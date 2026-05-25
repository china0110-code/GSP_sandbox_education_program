/* ============================================================
   admin-roi.js — ROI計測ダッシュボード（管理者向け）
   依存ライブラリなし。SVGレーダーチャートを自前実装。
   ============================================================ */

/* ----------------------------------------------------------
   定数
   ---------------------------------------------------------- */
const AXIS_IDS     = ['data','tech','people','org','gov','culture'];
const AXIS_LABELS  = { data:'データ', tech:'テクノロジー', people:'人材', org:'組織', gov:'ガバナンス', culture:'文化' };
const AXIS_COLORS  = { data:'#1a5276', tech:'#1a4a3a', people:'#4a2070', org:'#145232', gov:'#7e2020', culture:'#7e5109' };

/* コスト換算パラメータ（管理者が入力で変更可能） */
const DEFAULT_COST_PER_HOUR   = 5000;   // 円/時間（人件費換算）
const DEFAULT_EXTERNAL_FEE    = 80000;  // 円/人（外部研修相場）
const HOURS_PER_MINUTE        = 1 / 60;

/* ----------------------------------------------------------
   メイン描画
   ---------------------------------------------------------- */
export function renderROI(allUsers, allCourses, orgData) {
  renderKPISummary(allUsers, allCourses, orgData);
  renderRadarChart(allCourses, orgData);
  renderScoreDistribution(orgData, allCourses);
  renderHoursBreakdown(allUsers, allCourses, orgData);
  renderCostSimulation(allUsers, allCourses, orgData);
  renderProgressTimeline(orgData, allCourses);
}

/* ----------------------------------------------------------
   ① KPIサマリーカード
   ---------------------------------------------------------- */
function renderKPISummary(allUsers, allCourses, orgData) {
  const total       = allUsers.length;
  const totalCourses = allCourses.length;
  if (total === 0 || totalCourses === 0) {
    document.getElementById('roiKpiGrid').innerHTML = '<p style="color:var(--muted);font-size:.85rem">データがありません。</p>';
    return;
  }

  let completedSum = 0, passedSum = 0, startedUsers = 0;
  orgData.forEach(u => {
    const completed = Object.values(u.progress || {}).filter(p => p.status === 'completed').length;
    const inProg    = Object.values(u.progress || {}).filter(p => p.status === 'in_progress').length;
    completedSum   += completed;
    passedSum      += Object.values(u.quizzes || {}).filter(q => q.passed).length;
    if (completed > 0 || inProg > 0) startedUsers++;
  });

  const participationRate = Math.round(startedUsers / total * 100);
  const completionRate    = Math.round(completedSum / (total * totalCourses) * 100);
  const passRate          = completedSum > 0 ? Math.round(passedSum / completedSum * 100) : 0;
  const avgCompleted      = Math.round(completedSum / total * 10) / 10;

  const totalMinutes = allCourses.reduce((s, c) => s + (c.duration || 0), 0);
  const learnedMinutes = (completedSum / totalCourses) * totalMinutes / total * total;
  const learnedHours  = Math.round(learnedMinutes / 60 * 10) / 10;

  const kpis = [
    { n: `${participationRate}%`, l: '受講参加率', sub: `${startedUsers}/${total}名`, color: participationRate >= 80 ? 'var(--green)' : participationRate >= 50 ? 'var(--gold)' : 'var(--red)' },
    { n: `${completionRate}%`,    l: '全体完了率', sub: `${completedSum}講座完了`, color: completionRate >= 70 ? 'var(--green)' : completionRate >= 40 ? 'var(--gold)' : 'var(--red)' },
    { n: `${passRate}%`,          l: 'クイズ合格率', sub: `${passedSum}件合格`, color: passRate >= 75 ? 'var(--green)' : passRate >= 50 ? 'var(--gold)' : 'var(--red)' },
    { n: `${avgCompleted}`,       l: '平均完了講座数', sub: `/ ${totalCourses}講座`, color: 'var(--ink-soft)' },
    { n: `${learnedHours}h`,      l: '累計学習時間（組織）', sub: `1人平均 ${Math.round(learnedHours / total * 10) / 10}h`, color: 'var(--ink-soft)' },
  ];

  document.getElementById('roiKpiGrid').innerHTML = kpis.map(k => `
    <div class="roi-kpi-card">
      <div class="roi-kpi-n" style="color:${k.color}">${k.n}</div>
      <div class="roi-kpi-l">${k.l}</div>
      <div class="roi-kpi-sub">${k.sub}</div>
    </div>`).join('');
}

/* ----------------------------------------------------------
   ② 6軸スキルギャップ レーダーチャート（SVG自前実装）
   ---------------------------------------------------------- */
function renderRadarChart(allCourses, orgData) {
  const total = orgData.length;
  if (total === 0) {
    document.getElementById('roiRadar').innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:24px">データがありません。</p>';
    return;
  }

  /* 軸ごとの完了率を0〜1で計算 */
  const scores = {};
  AXIS_IDS.forEach(axisId => {
    const axisCourses = allCourses.filter(c => c.axis === axisId);
    if (!axisCourses.length) { scores[axisId] = 0; return; }
    let comp = 0;
    orgData.forEach(u => {
      axisCourses.forEach(c => {
        if (u.progress[c.id]?.status === 'completed') comp++;
      });
    });
    scores[axisId] = comp / (total * axisCourses.length);
  });

  const svg = buildRadarSVG(scores, 300);
  document.getElementById('roiRadar').innerHTML = svg;

  /* 凡例 */
  document.getElementById('roiRadarLegend').innerHTML = AXIS_IDS.map(id => `
    <div style="display:flex;align-items:center;gap:6px;font-size:.78rem">
      <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${AXIS_COLORS[id]}"></span>
      ${AXIS_LABELS[id]}：<strong>${Math.round(scores[id] * 100)}%</strong>
    </div>`).join('');
}

function buildRadarSVG(scores, size) {
  const cx = size / 2, cy = size / 2, r = size * 0.38;
  const n  = AXIS_IDS.length;
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2;

  /* グリッド（20%, 40%, 60%, 80%, 100%） */
  const gridLevels = [0.2, 0.4, 0.6, 0.8, 1.0];
  let gridSVG = gridLevels.map(lv => {
    const pts = AXIS_IDS.map((_, i) => {
      const a = startAngle + i * angleStep;
      return `${cx + Math.cos(a) * r * lv},${cy + Math.sin(a) * r * lv}`;
    }).join(' ');
    return `<polygon points="${pts}" fill="none" stroke="rgba(0,0,0,.07)" stroke-width="1"/>`;
  }).join('');

  /* 軸ライン */
  let axisLines = AXIS_IDS.map((_, i) => {
    const a = startAngle + i * angleStep;
    return `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}" stroke="rgba(0,0,0,.1)" stroke-width="1"/>`;
  }).join('');

  /* スコアポリゴン */
  const scorePoints = AXIS_IDS.map((id, i) => {
    const a = startAngle + i * angleStep;
    const v = scores[id] || 0;
    return `${cx + Math.cos(a) * r * v},${cy + Math.sin(a) * r * v}`;
  }).join(' ');

  /* ラベル */
  let labels = AXIS_IDS.map((id, i) => {
    const a   = startAngle + i * angleStep;
    const lx  = cx + Math.cos(a) * (r + 28);
    const ly  = cy + Math.sin(a) * (r + 28);
    const anchor = Math.cos(a) > 0.1 ? 'start' : Math.cos(a) < -0.1 ? 'end' : 'middle';
    return `<text x="${lx}" y="${ly}" text-anchor="${anchor}" dominant-baseline="middle"
      font-size="11" font-family="'Noto Sans JP',sans-serif" fill="#223a66" font-weight="700">${AXIS_LABELS[id]}</text>`;
  }).join('');

  /* スコアドット */
  let dots = AXIS_IDS.map((id, i) => {
    const a = startAngle + i * angleStep;
    const v = scores[id] || 0;
    const dx = cx + Math.cos(a) * r * v;
    const dy = cy + Math.sin(a) * r * v;
    return `<circle cx="${dx}" cy="${dy}" r="4" fill="${AXIS_COLORS[id]}" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');

  return `
  <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">
    ${gridSVG}
    ${axisLines}
    <polygon points="${scorePoints}"
      fill="rgba(34,58,102,.15)" stroke="#223a66" stroke-width="2" stroke-linejoin="round"/>
    ${labels}
    ${dots}
    <text x="${cx}" y="${size - 8}" text-anchor="middle" font-size="9" fill="#aaa" font-family="sans-serif">組織全体の軸別完了率</text>
  </svg>`;
}

/* ----------------------------------------------------------
   ③ クイズスコア分布（棒グラフ）
   ---------------------------------------------------------- */
function renderScoreDistribution(orgData, allCourses) {
  /* スコアを0-9, 10-19, ... 90-100のバケットに */
  const buckets = Array(10).fill(0);
  let totalAttempts = 0;

  orgData.forEach(u => {
    Object.entries(u.quizzes || {}).forEach(([courseId, q]) => {
      const course = allCourses.find(c => c.id === courseId);
      if (!course) return;
      const pct = Math.round(q.score / q.total * 100);
      const idx = Math.min(Math.floor(pct / 10), 9);
      buckets[idx]++;
      totalAttempts++;
    });
  });

  if (totalAttempts === 0) {
    document.getElementById('roiScoreDist').innerHTML = '<p style="color:var(--muted);font-size:.85rem;padding:16px">クイズ受験データがありません。</p>';
    return;
  }

  const maxBucket = Math.max(...buckets, 1);
  const labels    = ['0-9','10-19','20-29','30-39','40-49','50-59','60-69','70-79','80-89','90-100'];
  const passMark  = 7; // インデックス7以上（70%〜）が合格ライン

  document.getElementById('roiScoreDist').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:6px;height:120px;padding:0 4px">
      ${buckets.map((cnt, i) => {
        const h   = Math.round(cnt / maxBucket * 100);
        const isPassing = i >= passMark;
        return `
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
          <div style="font-size:.65rem;color:var(--muted)">${cnt > 0 ? cnt : ''}</div>
          <div style="width:100%;height:${h}%;min-height:${cnt > 0 ? 4 : 0}px;
               background:${isPassing ? 'var(--green)' : 'var(--border)'};
               border-radius:3px 3px 0 0;transition:height .4s ease;opacity:${isPassing ? 1 : 0.6}"></div>
          <div style="font-size:.6rem;color:var(--muted);writing-mode:horizontal-tb;white-space:nowrap">${labels[i]}</div>
        </div>`;
      }).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:12px;font-size:.75rem;color:var(--muted)">
      <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;background:var(--green);border-radius:2px"></span>合格ライン（70%〜）</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="display:inline-block;width:10px;height:10px;background:var(--border);border-radius:2px"></span>合格未満</span>
      <span style="margin-left:auto">合計 ${totalAttempts} 件</span>
    </div>`;
}

/* ----------------------------------------------------------
   ④ 受講時間 累計・部門別比較
   ---------------------------------------------------------- */
function renderHoursBreakdown(allUsers, allCourses, orgData) {
  /* 部門別に集計 */
  const deptMap = {};
  orgData.forEach(u => {
    const dept = u.department || '（部門未設定）';
    if (!deptMap[dept]) deptMap[dept] = { users: 0, minutes: 0 };
    deptMap[dept].users++;

    Object.entries(u.progress || {}).forEach(([courseId, prog]) => {
      if (prog.status !== 'completed') return;
      const course = allCourses.find(c => c.id === courseId);
      if (course) deptMap[dept].minutes += course.duration || 0;
    });
  });

  const depts = Object.entries(deptMap).sort((a, b) => b[1].minutes - a[1].minutes);

  if (depts.length === 0) {
    document.getElementById('roiHoursBreakdown').innerHTML = '<p style="color:var(--muted);font-size:.85rem">データがありません。</p>';
    return;
  }

  const maxMinutes = Math.max(...depts.map(([, d]) => d.minutes), 1);

  document.getElementById('roiHoursBreakdown').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px">
      ${depts.map(([dept, d]) => {
        const pct     = Math.round(d.minutes / maxMinutes * 100);
        const hours   = Math.round(d.minutes / 60 * 10) / 10;
        const perUser = d.users > 0 ? Math.round(d.minutes / d.users / 60 * 10) / 10 : 0;
        return `
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;font-size:.82rem">
            <span style="font-weight:700;color:var(--ink)">${dept}</span>
            <span style="color:var(--muted);font-size:.76rem">${hours}h 累計 / 1人平均 ${perUser}h（${d.users}名）</span>
          </div>
          <div style="height:8px;background:var(--border);border-radius:99px;overflow:hidden">
            <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--ink-soft),var(--gold));border-radius:99px;transition:width .5s ease"></div>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ----------------------------------------------------------
   ⑤ コスト換算シミュレーション
   ---------------------------------------------------------- */
export function renderCostSimulation(allUsers, allCourses, orgData, costPerHour, externalFee) {
  const cph = costPerHour ?? DEFAULT_COST_PER_HOUR;
  const efee = externalFee ?? DEFAULT_EXTERNAL_FEE;

  const total = allUsers.length;
  if (total === 0) {
    document.getElementById('roiCostResult').innerHTML = '';
    return;
  }

  /* 実際の学習完了時間（分）合計 */
  let totalCompletedMinutes = 0;
  orgData.forEach(u => {
    Object.entries(u.progress || {}).forEach(([courseId, prog]) => {
      if (prog.status !== 'completed') return;
      const course = allCourses.find(c => c.id === courseId);
      if (course) totalCompletedMinutes += course.duration || 0;
    });
  });

  const totalHours = totalCompletedMinutes / 60;

  /* 人件費換算（受講時間 × 時間単価） */
  const laborCost = Math.round(totalHours * cph);

  /* 外部研修費用との比較（人数 × 外部費用 × 完了率） */
  const completedUsers = orgData.filter(u =>
    Object.values(u.progress || {}).some(p => p.status === 'completed')
  ).length;
  const externalEquiv  = Math.round(completedUsers * efee);

  /* 節約額（外部研修比較） */
  const saving = externalEquiv - laborCost;
  const roi    = laborCost > 0 ? Math.round((saving / laborCost) * 100) : 0;

  document.getElementById('roiCostResult').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-bottom:20px">
      ${[
        { label:'累計学習時間（組織）', value:`${Math.round(totalHours * 10) / 10}h`, sub:'完了講座の合計' },
        { label:'人件費換算コスト',     value:`¥${laborCost.toLocaleString()}`, sub:`@¥${cph.toLocaleString()}/h` },
        { label:'外部研修相当額',        value:`¥${externalEquiv.toLocaleString()}`, sub:`@¥${efee.toLocaleString()}/人（${completedUsers}名）` },
        { label:'推定節約額',            value:`¥${Math.abs(saving).toLocaleString()}`, sub: saving >= 0 ? '外部研修より節約' : '外部研修より割高', valueColor: saving >= 0 ? 'var(--green)' : 'var(--red)' },
        { label:'推定ROI',               value:`${roi > 0 ? '+' : ''}${roi}%`, sub:'（節約額 / 人件費コスト）', valueColor: roi >= 0 ? 'var(--green)' : 'var(--red)' },
      ].map(({ label, value, sub, valueColor }) => `
        <div class="roi-kpi-card">
          <div class="roi-kpi-n" style="font-size:1.4rem;${valueColor ? `color:${valueColor}` : ''}">${value}</div>
          <div class="roi-kpi-l">${label}</div>
          <div class="roi-kpi-sub">${sub}</div>
        </div>`).join('')}
    </div>
    <p style="font-size:.75rem;color:var(--muted);line-height:1.7">
      ※ 人件費換算コストは「累計学習時間 × 時間単価」で算出します。外部研修相当額は「受講完了者数 × 外部研修相場」で算出します。<br>
      ※ これらはあくまでシミュレーション値です。実際の効果測定には別途KPI設計が必要です。
    </p>`;
}

/* ----------------------------------------------------------
   ⑥ 受講進捗タイムライン（フェーズ別完了状況）
   ---------------------------------------------------------- */
function renderProgressTimeline(orgData, allCourses) {
  const phases = [1, 2];
  const result = phases.map(ph => {
    const phaseCourses = allCourses.filter(c => c.phase === ph);
    if (!phaseCourses.length) return null;

    let compCount = 0;
    const denominator = orgData.length * phaseCourses.length;
    orgData.forEach(u => {
      phaseCourses.forEach(c => {
        if (u.progress[c.id]?.status === 'completed') compCount++;
      });
    });

    const pct = denominator > 0 ? Math.round(compCount / denominator * 100) : 0;

    /* 完了者数（フェーズ内の全講座を完了したユーザ） */
    const fullComp = orgData.filter(u =>
      phaseCourses.every(c => u.progress[c.id]?.status === 'completed')
    ).length;

    return { ph, pct, fullComp, total: orgData.length, courseCount: phaseCourses.length };
  }).filter(Boolean);

  document.getElementById('roiTimeline').innerHTML = result.map(({ ph, pct, fullComp, total, courseCount }) => `
    <div style="display:flex;align-items:center;gap:20px;padding:16px 0;border-bottom:1px solid var(--border)">
      <div style="flex-shrink:0;text-align:center;width:80px">
        <div class="phase-chip phase-${ph}" style="font-size:.9rem;padding:.4rem .8rem">Phase ${ph}</div>
        <div style="font-size:.72rem;color:var(--muted);margin-top:4px">${courseCount}講座</div>
      </div>
      <div style="flex:1">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:.82rem">
          <span style="color:var(--muted)">受講完了率（全講座 × 全ユーザ）</span>
          <span style="font-weight:700;color:${pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--gold)' : 'var(--red)'}">${pct}%</span>
        </div>
        <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:${pct >= 70 ? 'var(--green)' : pct >= 40 ? '#d97706' : 'var(--red)'};border-radius:99px;transition:width .6s ease"></div>
        </div>
        <div style="font-size:.75rem;color:var(--muted);margin-top:6px">
          全課程完了者：<strong>${fullComp}</strong> / ${total} 名
        </div>
      </div>
    </div>`).join('') || '<p style="color:var(--muted);font-size:.85rem">データがありません。</p>';
}
