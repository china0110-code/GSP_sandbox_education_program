/* ============================================================
   auth.js — 認証・ユーザ管理共通処理
   ============================================================ */
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  updatePassword,
  deleteUser,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, deleteDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ----------------------------------------------------------
   ログイン / ログアウト
   ---------------------------------------------------------- */
export async function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  return signOut(auth);
}

/* ----------------------------------------------------------
   認証状態監視
   callback(user | null) を呼ぶ
   ---------------------------------------------------------- */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ----------------------------------------------------------
   現在ユーザのプロフィールを Firestore から取得
   ---------------------------------------------------------- */
export async function getMyProfile() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}

/* ----------------------------------------------------------
   ユーザ登録（管理者が実行）
   email / password / name / role / department / targetGroup
   ---------------------------------------------------------- */
export async function registerUser({ email, password, name, role, department, targetGroup }) {
  /* 一時的に別のAuth instanceでユーザ作成し、管理者セッションを維持 */
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid  = cred.user.uid;

  await setDoc(doc(db, 'users', uid), {
    name,
    email,
    role,          // 'learner' | 'admin'
    department,
    targetGroup,   // 診断ツールの対象者区分キーと整合
    createdAt: serverTimestamp(),
  });

  return uid;
}

/* ----------------------------------------------------------
   ユーザ削除（管理者が実行）
   ※ Firebase Admin SDKなしでの削除はユーザ自身のみ可能なため、
      Firestoreの論理削除（deletedAt）で対応する
   ---------------------------------------------------------- */
export async function softDeleteUser(uid) {
  await setDoc(doc(db, 'users', uid), { deletedAt: serverTimestamp() }, { merge: true });
}

/* ----------------------------------------------------------
   パスワードリセットメール送信
   ---------------------------------------------------------- */
export async function sendReset(email) {
  return sendPasswordResetEmail(auth, email);
}

/* ----------------------------------------------------------
   ロール確認ヘルパー
   ---------------------------------------------------------- */
export async function requireAuth(redirectTo = 'index.html') {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      unsub();
      if (!user) {
        window.location.href = redirectTo;
        return;
      }
      const profile = await getMyProfile();
      if (!profile || profile.deletedAt) {
        await signOut(auth);
        window.location.href = redirectTo;
        return;
      }
      resolve(profile);
    });
  });
}

export async function requireAdmin(redirectTo = 'dashboard.html') {
  const profile = await requireAuth();
  if (profile.role !== 'admin') {
    window.location.href = redirectTo;
    return null;
  }
  return profile;
}
