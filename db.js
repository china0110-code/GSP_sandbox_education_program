/* ============================================================
   db.js — Firestore CRUD共通処理
   ③ getOrgProgress: N+1クエリをcollectionGroupで最適化
   ============================================================ */
import { db } from "./firebase.js";
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, serverTimestamp, collectionGroup,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ----------------------------------------------------------
   ユーザ一覧取得（管理者用）
   ---------------------------------------------------------- */
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => !u.deletedAt);
}

/* ----------------------------------------------------------
   受講進捗（個人）
   ---------------------------------------------------------- */
export async function getProgress(uid) {
  const snap = await getDocs(collection(db, 'progress', uid, 'courses'));
  const result = {};
  snap.docs.forEach(d => { result[d.id] = d.data(); });
  return result;
}

export async function startCourse(uid, courseId) {
  const ref  = doc(db, 'progress', uid, 'courses', courseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      status:        'in_progress',
      startedAt:     serverTimestamp(),
      lastViewedAt:  serverTimestamp(),
    });
  } else {
    await updateDoc(ref, { lastViewedAt: serverTimestamp() });
  }
}

export async function completeCourse(uid, courseId) {
  const ref = doc(db, 'progress', uid, 'courses', courseId);
  await setDoc(ref, {
    status:        'completed',
    completedAt:   serverTimestamp(),
    lastViewedAt:  serverTimestamp(),
  }, { merge: true });
}

/* ----------------------------------------------------------
   クイズ結果（個人）
   ---------------------------------------------------------- */
export async function getQuizResults(uid) {
  const snap = await getDocs(collection(db, 'quizResults', uid, 'courses'));
  const result = {};
  snap.docs.forEach(d => { result[d.id] = d.data(); });
  return result;
}

export async function saveQuizResult(uid, courseId, { score, total, passed, answers }) {
  const ref  = doc(db, 'quizResults', uid, 'courses', courseId);
  const snap = await getDoc(ref);
  const attempts = snap.exists() ? (snap.data().attempts || 0) + 1 : 1;
  await setDoc(ref, {
    score, total, passed, answers, attempts,
    answeredAt: serverTimestamp(),
  }, { merge: true });
  return attempts;
}

/* ----------------------------------------------------------
   ③ 組織全体の受講状況集計（管理者用）
   collectionGroupクエリで一括取得。
   ルール未設定時はフォールバックとして空データを返す。
   ---------------------------------------------------------- */
export async function getOrgProgress(users) {
  try {
    /* progress と quizResults のサブコレクションは両方 "courses" という名前。
       collectionGroup('courses') で一括取得し、パスで分類する。        */
    const snap = await getDocs(query(collectionGroup(db, 'courses')));

    const progressMap = {};
    const quizMap     = {};

    snap.docs.forEach(d => {
      const parts = d.ref.path.split('/');
      // progress/{uid}/courses/{courseId}  → parts[0]='progress'
      // quizResults/{uid}/courses/{courseId} → parts[0]='quizResults'
      if (parts.length < 4) return;
      const root     = parts[0];
      const uid      = parts[1];
      const courseId = parts[3];

      if (root === 'progress') {
        if (!progressMap[uid]) progressMap[uid] = {};
        progressMap[uid][courseId] = d.data();
      } else if (root === 'quizResults') {
        if (!quizMap[uid]) quizMap[uid] = {};
        quizMap[uid][courseId] = d.data();
      }
    });

    return users.map(user => ({
      ...user,
      progress: progressMap[user.uid] || {},
      quizzes:  quizMap[user.uid]     || {},
    }));

  } catch (e) {
    console.warn('[getOrgProgress] collectionGroupクエリ失敗。Firestoreルールを確認してください:', e.code || e.message);
    /* フォールバック: 進捗なしとして返す（画面は止めない） */
    return users.map(user => ({ ...user, progress: {}, quizzes: {} }));
  }
}

/* ----------------------------------------------------------
   組織診断プラン — 保存・取得・削除
   Firestoreパス: orgPlan/main（シングルドキュメント）
   ---------------------------------------------------------- */

/**
 * 診断JSONをFirestoreに保存する（管理者専用）
 * roadmap は施策テキストが大量でFirestoreの1MB制限に引っかかるため除外する。
 * 教育プランと診断スコア・KPIサマリーのみ保存。
 */
export async function saveOrgPlan(planData) {
  // eslint-disable-next-line no-unused-vars
  const { roadmap, ...saveable } = planData;   // roadmapを除いて保存
  const ref = doc(db, 'orgPlan', 'main');
  await setDoc(ref, {
    ...saveable,
    importedAt: serverTimestamp(),
  });
}

/**
 * 組織診断プランを取得する
 * Firestoreルールで未許可の場合も null を返してアプリを止めない。
 * @returns {Object|null} プランデータ or null
 */
export async function getOrgPlan() {
  try {
    const ref  = doc(db, 'orgPlan', 'main');
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[getOrgPlan] Firestoreアクセスエラー（ルール未設定の可能性）:', e.code || e.message);
    return null;
  }
}

/**
 * 組織診断プランを削除する（管理者専用）
 */
export async function deleteOrgPlan() {
  const { deleteDoc } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
  );
  const ref = doc(db, 'orgPlan', 'main');
  await deleteDoc(ref);
}
