/* ============================================================
   auth.js — 認証・ユーザ管理共通処理
   APIキーはfirebase.jsに一元化。auth.jsは設定を持たない。
   ============================================================ */
import { auth, db, app as firebaseApp } from "./firebase.js";
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getAuth,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp,
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
   ---------------------------------------------------------- */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

/* ----------------------------------------------------------
   現在ユーザのプロフィールをFirestoreから取得
   ---------------------------------------------------------- */
export async function getMyProfile() {
  const user = auth.currentUser;
  if (!user) return null;
  const snap = await getDoc(doc(db, 'users', user.uid));
  return snap.exists() ? { uid: user.uid, ...snap.data() } : null;
}

/* ----------------------------------------------------------
   ユーザ登録（管理者が実行）
   firebase.jsのappからconfigを再利用し第2インスタンスを作成。
   APIキーの二重管理を解消。
   ---------------------------------------------------------- */
export async function registerUser({ email, password, name, role, department, targetGroup }) {
  /* firebase.jsのappからconfigを取得して第2インスタンスを作成 */
  const config = firebaseApp.options;
  const tempAppName = `temp-register-${Date.now()}`;
  const tempApp  = initializeApp(config, tempAppName);
  const tempAuth = getAuth(tempApp);

  try {
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid  = cred.user.uid;

    /* Firestoreへの書き込みはメインインスタンスの管理者権限で実行 */
    await setDoc(doc(db, 'users', uid), {
      name,
      email,
      role,
      department,
      targetGroup,
      createdAt: serverTimestamp(),
    });

    await signOut(tempAuth);
    await deleteApp(tempApp);
    return uid;

  } catch (e) {
    try { await signOut(tempAuth); await deleteApp(tempApp); } catch (_) {}
    throw e;
  }
}

/* ----------------------------------------------------------
   ユーザ論理削除
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
      if (!user) { window.location.href = redirectTo; return; }
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
