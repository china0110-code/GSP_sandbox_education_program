/* ============================================================
   firebase.js — Firebase初期化・共通エクスポート
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth }       from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyA3DmRsJBHg_LagKEGzkAU7F0ItqyZsMj4",
  authDomain:        "gsp-education.firebaseapp.com",
  projectId:         "gsp-education",
  storageBucket:     "gsp-education.firebasestorage.app",
  messagingSenderId: "439766079947",
  appId:             "1:439766079947:web:efe79f6cde4cc36e64be4e",
  measurementId:     "G-TSQ5JNNLSZ",
};

const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
