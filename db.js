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
   N+1クエリ → collectionGroupで2回のクエリに最適化
   ユーザ数n: 従来 2n回 → 改善後 2回
   ---------------------------------------------------------- */
export async function getOrgProgress(users) {
  /* 全ユーザのprogress・quizResultsをcollectionGroupで一括取得 */
  const [progressSnap, quizSnap] = await Promise.all([
    getDocs(collectionGroup(db, 'courses').withConverter ? 
      query(collectionGroup(db, 'courses')) : 
      collectionGroup(db, 'courses')),
    getDocs(collectionGroup(db, 'courses')),
  ]);

  /* progressデータをユーザID別に整理 */
  const progressMap = {};
  progressSnap.docs.forEach(d => {
    /* path: progress/{uid}/courses/{courseId} */
    const pathParts = d.ref.path.split('/');
    if (pathParts[0] !== 'progress') return;
    const uid      = pathParts[1];
    const courseId = pathParts[3];
    if (!progressMap[uid]) progressMap[uid] = {};
    progressMap[uid][courseId] = d.data();
  });

  /* quizResultsデータをユーザID別に整理 */
  const quizMap = {};
  quizSnap.docs.forEach(d => {
    const pathParts = d.ref.path.split('/');
    if (pathParts[0] !== 'quizResults') return;
    const uid      = pathParts[1];
    const courseId = pathParts[3];
    if (!quizMap[uid]) quizMap[uid] = {};
    quizMap[uid][courseId] = d.data();
  });

  /* ユーザリストとマージして返す */
  return users.map(user => ({
    ...user,
    progress:  progressMap[user.uid]  || {},
    quizzes:   quizMap[user.uid]      || {},
  }));
}

/* ----------------------------------------------------------
   組織診断プラン — 保存・取得・削除
   Firestoreパス: orgPlan/main（シングルドキュメント）
   ---------------------------------------------------------- */

/**
 * 診断JSONをFirestoreに保存する（管理者専用）
 * @param {Object} planData  education-plan.json の中身
 */
export async function saveOrgPlan(planData) {
  const ref = doc(db, 'orgPlan', 'main');
  await setDoc(ref, {
    ...planData,
    importedAt: serverTimestamp(),
  });
}

/**
 * 組織診断プランを取得する
 * @returns {Object|null} プランデータ or null（未設定時）
 */
export async function getOrgPlan() {
  const ref  = doc(db, 'orgPlan', 'main');
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
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
