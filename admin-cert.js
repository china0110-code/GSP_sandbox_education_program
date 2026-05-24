/* ============================================================
   admin-cert.js — 修了証関連（セレクト描画）
   修了証の表示はcert.htmlに移管。本ファイルはセレクト管理のみ。
   ============================================================ */

export function renderCertSelects(allUsers, allCourses) {
  const userSel = document.getElementById('certUser');
  userSel.innerHTML = `<option value="">ユーザを選択…</option>` +
    allUsers.map(u => `<option value="${u.uid}">${u.name}</option>`).join('');

  const courseSel = document.getElementById('certCourse');
  courseSel.innerHTML = `<option value="">講座を選択…</option>` +
    allCourses.map(c => `<option value="${c.id}">${c.title}</option>`).join('');

  /* リセット */
  document.getElementById('certLinkArea').style.display = 'none';
}
