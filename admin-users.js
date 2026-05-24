/* ============================================================
   admin-users.js — ユーザ管理・登録・編集・削除
   ============================================================ */
import { registerUser as authRegister, softDeleteUser } from "./auth.js";
import { db } from "./firebase.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const TARGET_LABELS = {
  all:'全社員', exec:'経営層', mgmt:'管理職',
  legal:'法務・コンプライアンス担当', it:'情報システム部門',
  dx:'DX推進部門', data_user:'業務部門のデータ利活用担当',
};

/* ----------------------------------------------------------
   ユーザテーブル描画
   ---------------------------------------------------------- */
export function renderUserTable(users) {
  document.getElementById('userTbody').innerHTML = users.map(u => `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td style="font-size:.82rem;color:var(--muted)">${u.email}</td>
      <td><span class="badge ${u.role === 'admin' ? 'badge-ink' : 'badge-muted'}">
        ${u.role === 'admin' ? '管理者' : '学習者'}
      </span></td>
      <td>${u.department || '—'}</td>
      <td><span class="badge badge-muted">${TARGET_LABELS[u.targetGroup] || u.targetGroup}</span></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openEditModal('${u.uid}')">編集</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDelete('${u.uid}', '${u.name}')">削除</button>
      </td>
    </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted)">ユーザなし</td></tr>`;
}

/* ----------------------------------------------------------
   ユーザ登録
   ---------------------------------------------------------- */
export async function registerUser(allUsers, orgData, allCourses, renderAll) {
  const name     = document.getElementById('regName').value.trim();
  const email    = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const role     = document.getElementById('regRole').value;
  const dept     = document.getElementById('regDept').value.trim();
  const target   = document.getElementById('regTarget').value;

  const errEl = document.getElementById('regErr');
  const okEl  = document.getElementById('regOk');
  errEl.classList.remove('show');
  okEl.classList.remove('show');

  if (!name || !email || !password || !target) {
    errEl.textContent = '必須項目（*）をすべて入力してください。';
    errEl.classList.add('show');
    return { ok: false };
  }
  if (password.length < 8) {
    errEl.textContent = 'パスワードは8文字以上で入力してください。';
    errEl.classList.add('show');
    return { ok: false };
  }

  const btn = document.getElementById('regBtn');
  btn.disabled = true;
  btn.textContent = '登録中…';

  try {
    await authRegister({ email, password, name, role, department: dept, targetGroup: target });
    okEl.textContent = `${name} さんを登録しました。`;
    okEl.classList.add('show');
    clearRegForm();
    return { ok: true };
  } catch (e) {
    const msg = e.code === 'auth/email-already-in-use'
      ? 'このメールアドレスは既に使用されています。'
      : `登録に失敗しました：${e.message}`;
    errEl.textContent = msg;
    errEl.classList.add('show');
    return { ok: false };
  } finally {
    btn.disabled = false;
    btn.textContent = '登録する';
  }
}

export function clearRegForm() {
  ['regName','regEmail','regPassword','regDept'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('regRole').value   = 'learner';
  document.getElementById('regTarget').value = 'all';
}

/* ----------------------------------------------------------
   削除モーダル
   ---------------------------------------------------------- */
let pendingDeleteUid = null;

export function confirmDelete(uid, name, onDeleted) {
  pendingDeleteUid = uid;
  document.getElementById('deleteModal').classList.add('open');
  document.getElementById('deleteConfirmBtn').textContent = `「${name}」を削除する`;
  document.getElementById('deleteConfirmBtn').onclick = async () => {
    await softDeleteUser(pendingDeleteUid);
    closeModal();
    onDeleted(pendingDeleteUid);
    pendingDeleteUid = null;
  };
}

export function closeModal() {
  document.getElementById('deleteModal').classList.remove('open');
  pendingDeleteUid = null;
}

/* ----------------------------------------------------------
   編集モーダル
   ---------------------------------------------------------- */
let editingUid = null;

export function openEditModal(uid, allUsers, orgData, allCourses) {
  editingUid = uid;
  const user = allUsers.find(u => u.uid === uid);
  if (!user) return;

  document.getElementById('editName').value   = user.name || '';
  document.getElementById('editEmail').value  = user.email || '';
  document.getElementById('editRole').value   = user.role || 'learner';
  document.getElementById('editDept').value   = user.department || '';
  document.getElementById('editTarget').value = user.targetGroup || 'all';
  document.getElementById('editErr').classList.remove('show');
  document.getElementById('editOk').classList.remove('show');

  const uData = orgData.find(u => u.uid === uid);
  if (uData) {
    const comp    = Object.values(uData.progress || {}).filter(p => p.status === 'completed').length;
    const inProg  = Object.values(uData.progress || {}).filter(p => p.status === 'in_progress').length;
    const passed  = Object.values(uData.quizzes  || {}).filter(q => q.passed).length;
    const total   = allCourses.length;
    document.getElementById('editProgressDetail').innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:center">
        <div style="background:var(--white);border-radius:6px;padding:8px;border:1px solid var(--border)">
          <div style="font-size:1.2rem;font-weight:700;color:var(--ink-soft)">${comp}<span style="font-size:.8rem;color:var(--muted)">/${total}</span></div>
          <div style="font-size:.72rem;color:var(--muted)">完了講座</div>
        </div>
        <div style="background:var(--white);border-radius:6px;padding:8px;border:1px solid var(--border)">
          <div style="font-size:1.2rem;font-weight:700;color:var(--gold)">${inProg}</div>
          <div style="font-size:.72rem;color:var(--muted)">受講中</div>
        </div>
        <div style="background:var(--white);border-radius:6px;padding:8px;border:1px solid var(--border)">
          <div style="font-size:1.2rem;font-weight:700;color:var(--green)">${passed}</div>
          <div style="font-size:.72rem;color:var(--muted)">クイズ合格</div>
        </div>
      </div>`;
  } else {
    document.getElementById('editProgressDetail').textContent = '受講履歴なし';
  }
  document.getElementById('editModal').classList.add('open');
}

export function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
  editingUid = null;
}

export async function saveEdit(allUsers, orgData, onSaved) {
  const name   = document.getElementById('editName').value.trim();
  const role   = document.getElementById('editRole').value;
  const dept   = document.getElementById('editDept').value.trim();
  const target = document.getElementById('editTarget').value;

  const errEl = document.getElementById('editErr');
  const okEl  = document.getElementById('editOk');
  errEl.classList.remove('show');
  okEl.classList.remove('show');

  if (!name) {
    errEl.textContent = '氏名は必須です。';
    errEl.classList.add('show');
    return;
  }

  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true;
  btn.textContent = '保存中…';

  try {
    await setDoc(doc(db, 'users', editingUid), {
      name, role, department: dept, targetGroup: target,
    }, { merge: true });

    onSaved(editingUid, { name, role, department: dept, targetGroup: target });

    okEl.textContent = `${name} さんの情報を更新しました。`;
    okEl.classList.add('show');
    setTimeout(() => closeEditModal(), 1200);
  } catch (e) {
    errEl.textContent = `更新に失敗しました：${e.message}`;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = '保存する';
  }
}
