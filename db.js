/* ============================================================
   db.js — Firestore CRUD共通処理
   ============================================================ */
import { db } from "./firebase.js";
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, serverTimestamp, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ----------------------------------------------------------
   ユーザ一覧取得（管理者用）
   ---------------------------------------------------------- */
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'users'));
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => !u.deletedAt); // 論理削除済みを除外
}

/* ----------------------------------------------------------
   受講進捗
   ---------------------------------------------------------- */
export async function getProgress(uid) {
  const snap = await getDocs(collection(db, 'progress', uid, 'courses'));
  const result = {};
  snap.docs.forEach(d => { result[d.id] = d.data(); });
  return result;
}

export async function startCourse(uid, courseId) {
  const ref = doc(db, 'progress', uid, 'courses', courseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      status: 'in_progress',
      startedAt: serverTimestamp(),
      lastViewedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(ref, { lastViewedAt: serverTimestamp() });
  }
}

export async function completeCourse(uid, courseId) {
  const ref = doc(db, 'progress', uid, 'courses', courseId);
  await setDoc(ref, {
    status: 'completed',
    completedAt: serverTimestamp(),
    lastViewedAt: serverTimestamp(),
  }, { merge: true });
}

/* ----------------------------------------------------------
   クイズ結果
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
    score,
    total,
    passed,
    answers,   // { questionId: selectedIndex } の形式
    attempts,
    answeredAt: serverTimestamp(),
  }, { merge: true });

  return attempts;
}

/* ----------------------------------------------------------
   組織全体の受講状況集計（管理者用）
   ---------------------------------------------------------- */
export async function getOrgProgress(users) {
  const result = [];
  for (const user of users) {
    const progress = await getProgress(user.uid);
    const quizzes  = await getQuizResults(user.uid);
    result.push({ ...user, progress, quizzes });
  }
  return result;
}
