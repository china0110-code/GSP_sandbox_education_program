/* ============================================================
   admin-report.js — 受講状況レポート・CSVエクスポート
   ============================================================ */

export function renderReport(allUsers, allCourses, orgData) {
  const total        = allUsers.length;
  const totalCourses = allCourses.length;

  let completedSum = 0, passedSum = 0;
  orgData.forEach(u => {
    completedSum += Object.values(u.progress).filter(p => p.status === 'completed').length;
    passedSum    += Object.values(u.quizzes).filter(q => q.passed).length;
  });

  const avgComp    = total > 0 ? Math.round(completedSum / total) : 0;
  const overallPct = total > 0 ? Math.round(completedSum / (total * totalCourses) * 100) : 0;

  document.getElementById('reportSummary').innerHTML = `
    <div class="admin-chip">
      <div class="admin-chip-n">${total}</div>
      <div class="admin-chip-l">登録ユーザ数</div>
    </div>
    <div class="admin-chip">
      <div class="admin-chip-n">${overallPct}<span style="font-size:1rem;color:var(--muted)">%</span></div>
      <div class="admin-chip-l">全体受講率</div>
    </div>
    <div class="admin-chip">
      <div class="admin-chip-n">${avgComp}</div>
      <div class="admin-chip-l">平均完了講座数</div>
    </div>
    <div class="admin-chip">
      <div class="admin-chip-n">${passedSum}</div>
      <div class="admin-chip-l">クイズ合格累計</div>
    </div>
  `;

  const AXIS_COLORS = {
    data:'#1a5276', tech:'#1a4a3a', people:'#4a2070',
    org:'#145232', gov:'#7e2020', culture:'#7e5109',
  };
  const AXIS_LABELS = {
    data:'データ', tech:'テクノロジー', people:'人材',
    org:'組織', gov:'ガバナンス', culture:'文化',
  };

  const axisIds = ['data','tech','people','org','gov','culture'];
  document.getElementById('axisReport').innerHTML = axisIds.map(axisId => {
    const axisCourses = allCourses.filter(c => c.axis === axisId);
    if (!axisCourses.length) return '';
    let compCount = 0;
    orgData.forEach(u => {
      axisCourses.forEach(c => {
        if (u.progress[c.id]?.status === 'completed') compCount++;
      });
    });
    const denominator = total * axisCourses.length;
    const pct = denominator > 0 ? Math.round(compCount / denominator * 100) : 0;
    return `
    <div class="report-axis-card">
      <span class="report-axis-label" style="background:${AXIS_COLORS[axisId]}">${AXIS_LABELS[axisId]}</span>
      <div class="report-axis-pct">${pct}<span style="font-size:1rem;color:var(--muted)">%</span></div>
      <div class="report-axis-sub">${axisCourses.length}講座 / ${compCount}件完了</div>
      <div class="prog-bar" style="margin-top:10px">
        <div class="prog-fill" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');

  renderReportTable(orgData, allCourses);
}

export function renderReportTable(data, allCourses) {
  const TARGET_LABELS = {
    all:'全社員', exec:'経営層', mgmt:'管理職',
    legal:'法務・コンプライアンス担当', it:'情報システム部門',
    dx:'DX推進部門', data_user:'業務部門のデータ利活用担当',
  };
  document.getElementById('reportTbody').innerHTML = data.map(u => {
    const comp  = Object.values(u.progress).filter(p => p.status === 'completed').length;
    const pct   = allCourses.length > 0 ? Math.round(comp / allCourses.length * 100) : 0;
    const passed = Object.values(u.quizzes).filter(q => q.passed).length;
    return `
    <tr>
      <td><strong>${u.name}</strong></td>
      <td>${u.department || '—'}</td>
      <td><span class="badge badge-muted">${TARGET_LABELS[u.targetGroup] || u.targetGroup}</span></td>
      <td>${comp} / ${allCourses.length}</td>
      <td>
        <div class="mini-prog">
          <div class="mini-prog-bar"><div class="mini-prog-fill" style="width:${pct}%"></div></div>
          <span class="mini-prog-pct">${pct}%</span>
        </div>
      </td>
      <td>${passed}</td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted)">データなし</td></tr>`;
}

export function exportCSV(orgData, allCourses) {
  const TARGET_LABELS = {
    all:'全社員', exec:'経営層', mgmt:'管理職',
    legal:'法務・コンプライアンス担当', it:'情報システム部門',
    dx:'DX推進部門', data_user:'業務部門のデータ利活用担当',
  };
  const header = ['名前','部門','対象者区分','完了講座数','全体進捗(%)', 'クイズ合格数'];
  const rows = orgData.map(u => {
    const comp   = Object.values(u.progress).filter(p => p.status === 'completed').length;
    const pct    = allCourses.length > 0 ? Math.round(comp / allCourses.length * 100) : 0;
    const passed = Object.values(u.quizzes).filter(q => q.passed).length;
    return [u.name, u.department || '', TARGET_LABELS[u.targetGroup] || '', comp, pct, passed];
  });
  const csv  = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `受講状況_${new Date().toLocaleDateString('ja-JP').replace(/\//g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
