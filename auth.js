/* ============================================================
   auth.js — 認証・ユーザ管理共通処理
   ============================================================ */
import { auth, db } from "./firebase.js";
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
   第2Firebaseインスタンスでユーザ作成→即サインアウト
   → メインインスタンスの管理者セッションを維持
   ---------------------------------------------------------- */
export async function registerUser({ email, password, name, role, department, targetGroup }) {
  /* 第2インスタンス用のFirebase設定（firebase.jsと同じ値） */
  const firebaseConfig = {
    apiKey:            "AIzaSyA3DmRsJBHg_LagKEGzkAU7F0ItqyZsMj4",
    authDomain:        "gsp-education.firebaseapp.com",
    projectId:         "gsp-education",
    storageBucket:     "gsp-education.firebasestorage.app",
    messagingSenderId: "439766079947",
    appId:             "1:439766079947:web:efe79f6cde4cc36e64be4e",
  };

  /* 既存アプリと名前が衝突しないよう一意な名前を付ける */
  const tempAppName = `temp-register-${Date.now()}`;
  const tempApp  = initializeApp(firebaseConfig, tempAppName);
  const tempAuth = getAuth(tempApp);

  try {
    /* 第2インスタンスでユーザ作成（メインのセッションに影響しない） */
    const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
    const uid  = cred.user.uid;

    /* Firestoreへの書き込みはメインインスタンスの管理者権限で行う */
    await setDoc(doc(db, 'users', uid), {
      name,
      email,
      role,
      department,
      targetGroup,
      createdAt: serverTimestamp(),
    });

    /* 第2インスタンスを即サインアウト・削除 */
    await signOut(tempAuth);
    await tempApp.delete();

    return uid;

  } catch (e) {
    /* エラー時もクリーンアップ */
    try { await signOut(tempAuth); await tempApp.delete(); } catch (_) {}
    throw e;
  }
}

/* ----------------------------------------------------------
   ユーザ論理削除（管理者が実行）
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
