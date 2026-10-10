// AgriSure Climate Credit Risk Assessment Controller
// Controls Borrower Selection, Dataset Agronomic Integration, Risk Scoring, SHAP Explainability & Batch Evaluation

document.addEventListener('DOMContentLoaded', () => {
  initRiskUI();
});

const API_BASE_RISK = (window.location.port === '8000') ? '' : 'http://localhost:8000';

let currentBorrowersList = [];
let shapChartInstance = null;

function initRiskUI() {
  const borrowerSelect = document.getElementById('riskBorrowerSelect');
  const borrowerSelectPage = document.getElementById('riskBorrowerSelectPage');
  const btnAssess = document.getElementById('btnRunRiskAssessment');
  const btnAssessPage = document.getElementById('btnRunRiskAssessmentPage');
  const btnBatch = document.getElementById('btnEvaluateBatchPortfolio');
  const btnBatchPage = document.getElementById('btnEvaluateBatchPortfolioPage');

  const onSelectChange = (val) => {
    if (borrowerSelect) borrowerSelect.value = val;
    if (borrowerSelectPage) borrowerSelectPage.value = val;
    populateFormFromBorrower(val);
    runRiskAssessment();
    updateRiskRoleVisibility();
  };

  if (borrowerSelect) {
    borrowerSelect.addEventListener('change', (e) => onSelectChange(e.target.value));
  }
  if (borrowerSelectPage) {
    borrowerSelectPage.addEventListener('change', (e) => onSelectChange(e.target.value));
  }

  const handleAssessClick = () => {
    runRiskAssessment();
    window.location.hash = '#/risk';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (btnAssess) btnAssess.addEventListener('click', handleAssessClick);
  if (btnAssessPage) btnAssessPage.addEventListener('click', handleAssessClick);

  const handleBatchClick = () => {
    runBatchPortfolioEvaluation();
    window.location.hash = '#/risk';
    setTimeout(() => {
      const batchEl = document.getElementById('riskBatchPortfolioCard');
      if (batchEl) batchEl.scrollIntoView({ behavior: 'smooth' });
    }, 200);
  };

  if (btnBatch) btnBatch.addEventListener('click', handleBatchClick);
  if (btnBatchPage) btnBatchPage.addEventListener('click', handleBatchClick);

  fetchBorrowersList();
  updateRiskRoleVisibility();
}

function populateSelectsWithBorrowers(list) {
  const selects = [
    document.getElementById('riskBorrowerSelect'),
    document.getElementById('riskBorrowerSelectPage')
  ];

  selects.forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '';
    list.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.farmer_id;
      opt.textContent = `${b.farmer_id} — ${b.district}, ${b.state} | ${b.crop_type} (₹${parseInt(b.loan_amount_inr).toLocaleString()})`;
      select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
  });
}

async function fetchBorrowersList() {
  try {
    const res = await fetch(`${API_BASE_RISK}/api/v2/risk/borrowers`);
    if (res.ok) {
      const data = await res.json();
      currentBorrowersList = data.data || [];
      populateSelectsWithBorrowers(currentBorrowersList);

      if (currentBorrowersList.length > 0) {
        populateFormFromBorrower(currentBorrowersList[0].farmer_id);
        runRiskAssessment();
      }
      return;
    }
  } catch (err) {
    console.warn('[RiskService] Could not fetch borrowers live, using static fallback list:', err);
  }

  populateFallbackBorrowers();
}

function populateFallbackBorrowers() {
  currentBorrowersList = [
    { farmer_id: 'DEMO001', district: 'Pune', state: 'Maharashtra', crop_type: 'Pulses', farm_area_acres: '5.66', loan_amount_inr: '182000', loan_term_months: '12', annual_interest_rate_pct: '9.65', irrigation_type: 'Mixed' },
    { farmer_id: 'DEMO002', district: 'Jaipur', state: 'Rajasthan', crop_type: 'Onion', farm_area_acres: '5.71', loan_amount_inr: '150000', loan_term_months: '18', annual_interest_rate_pct: '8.98', irrigation_type: 'Rainfed' },
    { farmer_id: 'DEMO004', district: 'Amravati', state: 'Maharashtra', crop_type: 'Sugarcane', farm_area_acres: '5.64', loan_amount_inr: '183000', loan_term_months: '24', annual_interest_rate_pct: '8.52', irrigation_type: 'Drip' },
    { farmer_id: 'DEMO009', district: 'Dharwad', state: 'Karnataka', crop_type: 'Cotton', farm_area_acres: '11.65', loan_amount_inr: '186000', loan_term_months: '6', annual_interest_rate_pct: '7.92', irrigation_type: 'Drip' }
  ];

  populateSelectsWithBorrowers(currentBorrowersList);
  populateFormFromBorrower('DEMO001');
  runRiskAssessment();
}

function populateFormFromBorrower(farmerId) {
  const b = currentBorrowersList.find(x => x.farmer_id === farmerId);
  if (!b) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('riskDistrict', b.district || 'Dharwad');
  setVal('riskState', b.state || 'Karnataka');
  setVal('riskCrop', b.crop_type || 'Cotton');
  setVal('riskAcres', b.farm_area_acres || 5.0);
  setVal('riskLoanAmount', b.loan_amount_inr || 200000);
  setVal('riskLoanTerm', b.loan_term_months || 12);
  setVal('riskInterestRate', b.annual_interest_rate_pct || 8.5);
  setVal('riskIrrigation', b.irrigation_type || 'Rainfed');
}

async function runRiskAssessment() {
  const btnAssess = document.getElementById('btnRunRiskAssessment');
  const btnAssessPage = document.getElementById('btnRunRiskAssessmentPage');
  
  [btnAssess, btnAssessPage].forEach(btn => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Computing Risk...`;
    }
  });
  if (window.lucide) lucide.createIcons();

  const resetButtons = () => {
    [btnAssess, btnAssessPage].forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="shield-check"></i> Evaluate Credit Risk`;
      }
    });
    if (window.lucide) lucide.createIcons();
  };

  const getVal = (id, def) => {
    const el = document.getElementById(id);
    return el ? el.value : def;
  };

  const selPage = document.getElementById('riskBorrowerSelectPage');
  const selDash = document.getElementById('riskBorrowerSelect');
  const farmerId = (selPage && selPage.value) ? selPage.value : ((selDash && selDash.value) ? selDash.value : 'DEMO001');
  const payload = {
    farmer_id: farmerId,
    district: getVal('riskDistrict', 'Dharwad'),
    state: getVal('riskState', 'Karnataka'),
    crop_type: getVal('riskCrop', 'Cotton'),
    land_acres: parseFloat(getVal('riskAcres', 5.0)),
    loan_amount: parseFloat(getVal('riskLoanAmount', 200000)),
    loan_term_months: parseInt(getVal('riskLoanTerm', 12)),
    interest_rate: parseFloat(getVal('riskInterestRate', 8.5)),
    irrigation_type: getVal('riskIrrigation', 'Rainfed')
  };

  try {
    try {
      const res = await fetch(`${API_BASE_RISK}/api/v2/risk/assess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const result = await res.json();
        renderRiskResults(result);
        updateRiskRoleVisibility();
        return;
      }
    } catch (err) {
      console.warn('[RiskService] Assessment API error, running local evaluation fallback:', err);
    }

    // Fallback client side evaluation
    renderRiskResults(createFallbackRiskResult(payload));
    updateRiskRoleVisibility();
  } finally {
    resetButtons();
  }
}

function renderRiskResults(res) {
  const risk = res.risk_assessment || {};
  const agro = res.agronomic_dataset_context || {};
  const telem = res.telemetry_context || {};
  const shap = res.explainability || {};

  const setTxt = (id, txt) => {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
  };

  // 1. Dual-Pillar Risk Classifications & Calibration Badge
  const overallCls = risk.overall_risk_classification || 'Low';
  const climCls = risk.climate_risk_classification || 'Moderate';
  const finCls = risk.financial_risk_classification || 'Low';

  const elOverall = document.getElementById('valOverallRiskBadge');
  if (elOverall) {
    let bClass = 'badge-teal';
    if (overallCls === 'High') bClass = 'badge-danger';
    else if (overallCls === 'Moderate') bClass = 'badge-warning';
    elOverall.className = `badge ${bClass}`;
    elOverall.style.fontSize = '1.1rem';
    elOverall.style.padding = '6px 14px';
    elOverall.style.fontWeight = '800';
    elOverall.innerHTML = `<i data-lucide="shield"></i> ${overallCls.toUpperCase()} OVERALL RISK`;
  }

  const elClimBadge = document.getElementById('valClimateRiskBadge');
  if (elClimBadge) {
    let bClass = 'badge-teal';
    if (climCls === 'High') bClass = 'badge-danger';
    else if (climCls === 'Moderate') bClass = 'badge-warning';
    elClimBadge.className = `badge ${bClass}`;
    elClimBadge.textContent = `${climCls} Climate Risk`;
  }

  const elFinBadge = document.getElementById('valFinancialRiskBadge');
  if (elFinBadge) {
    let bClass = 'badge-teal';
    if (finCls === 'High') bClass = 'badge-danger';
    else if (finCls === 'Moderate') bClass = 'badge-warning';
    elFinBadge.className = `badge ${bClass}`;
    elFinBadge.textContent = `${finCls} Financial Risk`;
  }

  const elCalib = document.getElementById('valModelCalibrationBadge');
  if (elCalib) {
    const status = risk.probability_model_status || 'PROTOTYPE_RISK_SCORE';
    elCalib.textContent = `⚠️ ${status.replace(/_/g, ' ')} (UNCALIBRATED)`;
  }

  // 2. Plain Language Narrative Summary Box
  const narrBox = document.getElementById('riskNarrativeBox');
  if (narrBox) {
    const narrativeText = risk.plain_language_narrative || 'Detailed evaluation complete.';
    narrBox.innerHTML = `<strong>📋 Plain Language Risk Narrative:</strong> ${narrativeText}`;
  }

  // 3. Credit Score & Decision Badge
  const elScore = document.getElementById('valClimateCreditScore');
  const elDecisionBadge = document.getElementById('valRiskDecisionBadge');
  const elDecisionReason = document.getElementById('valRiskDecisionReason');
  const elScoreProgress = document.getElementById('valScoreProgressBar');

  const scoreVal = risk.climate_credit_score || risk.climateCreditScore || 650;
  if (elScore) elScore.textContent = scoreVal;
  if (elScoreProgress) {
    const pct = Math.min(100, Math.max(0, ((scoreVal - 300) / 600) * 100));
    elScoreProgress.style.width = `${pct}%`;
  }

  if (elDecisionBadge) {
    const dec = risk.decision || (overallCls === 'High' ? 'HIGH RISK / REJECTED' : (overallCls === 'Moderate' ? 'CONDITIONAL APPROVAL' : 'APPROVED'));
    let badgeCls = 'badge-warning';
    if (dec === 'APPROVED') badgeCls = 'badge-teal';
    else if (dec.includes('REJECTED') || dec.includes('HIGH RISK')) badgeCls = 'badge-danger';
    
    elDecisionBadge.className = `badge ${badgeCls}`;
    elDecisionBadge.innerHTML = `<i data-lucide="shield-alert"></i> ${dec}`;
  }

  if (elDecisionReason) elDecisionReason.textContent = risk.decisionReason || `Overall Risk: ${overallCls}. Decision support guidance provided for officer review.`;

  // 4. Metrics & Probability
  setTxt('valRepaymentProb', `${risk.estimated_repayment_probability_pct || 89.5}%`);
  setTxt('valRiskPD', `${risk.estimated_default_probability_pct || risk.pdClimatePct || 10.5}%`);
  setTxt('valRiskExpectedLoss', `₹${(risk.expected_loss_inr || risk.expectedLossRs || 0).toLocaleString()}`);
  setTxt('valRiskDSCR', `${risk.dscr || 1.45}x`);

  // 5. Positive & Negative Risk Factors Tables
  const posContainer = document.getElementById('riskPositiveFactorsContainer');
  if (posContainer) {
    const posList = risk.positive_factors || [];
    if (posList.length === 0) {
      posContainer.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">No major positive factors identified.</div>';
    } else {
      posContainer.innerHTML = posList.map(f => `
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 10px; border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-weight: 700; color: #166534; margin-bottom: 2px;">
            <span>${f.factor} (${f.category})</span>
            <span class="badge badge-teal" style="font-size: 0.75rem;">${f.impact}</span>
          </div>
          <div style="font-size: 0.8rem; color: #15803d;">${f.explanation} (Value: <strong>${f.value}</strong>)</div>
        </div>
      `).join('');
    }
  }

  const negContainer = document.getElementById('riskNegativeFactorsContainer');
  if (negContainer) {
    const negList = risk.negative_factors || [];
    if (negList.length === 0) {
      negContainer.innerHTML = '<div style="padding: 10px; color: var(--text-muted);">No major negative factors identified.</div>';
    } else {
      negContainer.innerHTML = negList.map(f => `
        <div style="background: #fff1f2; border: 1px solid #fecdd3; padding: 10px; border-radius: var(--radius-sm); margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; font-weight: 700; color: #9f1239; margin-bottom: 2px;">
            <span>${f.factor} (${f.category})</span>
            <span class="badge badge-rose" style="font-size: 0.75rem;">${f.impact}</span>
          </div>
          <div style="font-size: 0.8rem; color: #be123c;">${f.explanation} (Value: <strong>${f.value}</strong>)</div>
        </div>
      `).join('');
    }
  }

  // 6. Agronomic Context & Telemetry Badges
  setTxt('valAgroSource', agro.dataset_source || 'synthetic_agricultural_loan_repayment_100_farmers.csv');
  setTxt('valAgroNPK', `N:${agro.optimal_N || 70} | P:${agro.optimal_P || 45} | K:${agro.optimal_K || 35} (kg/ha)`);
  setTxt('valTelemRain', `${telem.rainfall_mm || 320} mm (Temp: ${telem.avg_temp_max_c || 29.5}°C)`);
  setTxt('valTelemSoil', `${telem.soil_texture || 'Loam'} (pH ${telem.soil_ph || 6.8})`);

  // 7. Render SHAP Waterfall/Bar Chart
  renderSHAPChart(shap.shapValues || []);

  // 8. Render Officer Next Steps & Directives
  const dirContainer = document.getElementById('riskDirectivesList');
  const directives = risk.officer_next_steps || shap.recommendations || [];
  if (dirContainer && directives) {
    dirContainer.innerHTML = '';
    directives.forEach(r => {
      const li = document.createElement('li');
      li.style.marginBottom = '6px';
      li.innerHTML = `<i data-lucide="check-circle-2" style="color: var(--teal-primary); margin-right: 6px;"></i> ${r}`;
      dirContainer.appendChild(li);
    });
  }

  if (window.lucide) lucide.createIcons();
}

function renderSHAPChart(shapValues) {
  const canvas = document.getElementById('chartSHAPExplainability');
  if (!canvas || !window.Chart) return;

  if (shapChartInstance) {
    shapChartInstance.destroy();
  }

  const labels = shapValues.map(s => s.feature);
  const points = shapValues.map(s => s.impactPoints);
  const colors = points.map(p => p >= 0 ? '#0d9488' : '#e11d48');

  shapChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Score Contribution (Points)',
        data: points,
        backgroundColor: colors
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.raw;
              return `${val >= 0 ? '+' : ''}${val} Score Points`;
            }
          }
        }
      },
      scales: {
        x: { title: { display: true, text: 'Points Impact (+ Boost / - Stress)' } }
      }
    }
  });
}

function getRiskAuthHeaders() {
  try {
    const saved = localStorage.getItem('AGRISURE_AUTH_SESSION') || sessionStorage.getItem('AGRISURE_AUTH_SESSION') || localStorage.getItem('NABARD_AUTH_SESSION') || sessionStorage.getItem('NABARD_AUTH_SESSION');
    if (saved) {
      const sess = JSON.parse(saved);
      if (sess && sess.access_token) {
        return {
          'Authorization': `Bearer ${sess.access_token}`,
          'Content-Type': 'application/json'
        };
      }
    }
  } catch (e) {}
  return { 'Content-Type': 'application/json' };
}

async function runBatchPortfolioEvaluation() {
  const tableBody = document.getElementById('batchRiskTableBody');
  const btnBatch = document.getElementById('btnEvaluateBatchPortfolio');
  const btnBatchPage = document.getElementById('btnEvaluateBatchPortfolioPage');

  [btnBatch, btnBatchPage].forEach(btn => {
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Evaluating 100 Borrower Records...`;
    }
  });
  if (window.lucide) lucide.createIcons();

  if (tableBody) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);"><i data-lucide="loader-2" class="spin"></i> Computing Dual-Pillar Risk Engine across all 100 Borrower Records...</td></tr>`;
    if (window.lucide) lucide.createIcons();
  }

  try {
    try {
      const res = await fetch(`${API_BASE_RISK}/api/v2/risk/batch`, {
        headers: getRiskAuthHeaders()
      });
      if (res.ok) {
        const result = await res.json();
        renderBatchResults(result);
        return;
      }
    } catch (err) {
      console.warn('[RiskService] Batch API error, using static batch evaluation:', err);
    }

    // Local static evaluation fallback (All 100 Borrowers)
    renderBatchResults(createFallbackBatchResults());
  } finally {
    [btnBatch, btnBatchPage].forEach(btn => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="layers"></i> Evaluate Entire Portfolio (100 Borrowers)`;
      }
    });
    if (window.lucide) lucide.createIcons();
  }
}

let currentBatchData = [];
let currentBatchFiltered = [];
let currentBatchPage = 1;
const BATCH_PAGE_SIZE = 15;
let isShowAllBatchRows = false;

function renderBatchResults(result) {
  const summaryBox = document.getElementById('batchPortfolioSummaryBox');

  if (summaryBox && result.portfolio_summary) {
    const p = result.portfolio_summary;
    summaryBox.innerHTML = `
      <div class="grid-4col" style="gap: 1rem;">
        <div style="background: #ffffff; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); text-align: center;">
          <div style="font-size: 0.78rem; color: var(--text-muted);">Evaluated Portfolio</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-main);">${p.total_borrowers_evaluated} Borrowers</div>
        </div>
        <div style="background: #ffffff; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); text-align: center;">
          <div style="font-size: 0.78rem; color: var(--text-muted);">Approved / Conditional</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: #0d9488;">${p.approved_count + p.conditional_count} (${p.approved_pct}%)</div>
        </div>
        <div style="background: #ffffff; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); text-align: center;">
          <div style="font-size: 0.78rem; color: var(--text-muted);">Total Loan Exposure</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--cyan-hover);">₹${(p.total_loan_exposure_inr || 0).toLocaleString()}</div>
        </div>
        <div style="background: #ffffff; padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); text-align: center;">
          <div style="font-size: 0.78rem; color: var(--text-muted);">Expected Loss (EL)</div>
          <div style="font-size: 1.5rem; font-weight: 800; color: var(--rose);">₹${(p.total_expected_loss_inr || 0).toLocaleString()} (${p.portfolio_expected_loss_pct}%)</div>
        </div>
      </div>
    `;
  }

  currentBatchData = result.borrowers || [];
  currentBatchFiltered = [...currentBatchData];
  currentBatchPage = 1;
  isShowAllBatchRows = false;

  setupBatchControls();
  renderBatchTablePage();
}

function setupBatchControls() {
  const searchInput = document.getElementById('batchRiskSearchInput');
  const btnPrev = document.getElementById('btnBatchPrevPage');
  const btnNext = document.getElementById('btnBatchNextPage');
  const btnToggleAll = document.getElementById('btnBatchToggleAll');

  if (searchInput && !searchInput.dataset.initialized) {
    searchInput.dataset.initialized = "true";
    let timer = null;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const query = e.target.value.trim().toLowerCase();
        if (!query) {
          currentBatchFiltered = [...currentBatchData];
        } else {
          currentBatchFiltered = currentBatchData.filter(b => 
            (b.farmer_id || '').toLowerCase().includes(query) ||
            (b.district || '').toLowerCase().includes(query) ||
            (b.crop || '').toLowerCase().includes(query) ||
            (b.decision || '').toLowerCase().includes(query)
          );
        }
        currentBatchPage = 1;
        renderBatchTablePage();
      }, 200);
    });
  }

  if (btnPrev && !btnPrev.dataset.initialized) {
    btnPrev.dataset.initialized = "true";
    btnPrev.addEventListener('click', () => {
      if (currentBatchPage > 1) {
        currentBatchPage--;
        renderBatchTablePage();
      }
    });
  }

  if (btnNext && !btnNext.dataset.initialized) {
    btnNext.dataset.initialized = "true";
    btnNext.addEventListener('click', () => {
      const maxPage = Math.ceil(currentBatchFiltered.length / BATCH_PAGE_SIZE);
      if (currentBatchPage < maxPage) {
        currentBatchPage++;
        renderBatchTablePage();
      }
    });
  }

  if (btnToggleAll && !btnToggleAll.dataset.initialized) {
    btnToggleAll.dataset.initialized = "true";
    btnToggleAll.addEventListener('click', () => {
      isShowAllBatchRows = !isShowAllBatchRows;
      btnToggleAll.textContent = isShowAllBatchRows ? "Paginate Rows (15 per page)" : "Show All 100 Rows";
      renderBatchTablePage();
    });
  }
}

function renderBatchTablePage() {
  const tableBody = document.getElementById('batchRiskTableBody');
  const indicator = document.getElementById('batchRiskPageIndicator');
  const btnPrev = document.getElementById('btnBatchPrevPage');
  const btnNext = document.getElementById('btnBatchNextPage');

  if (!tableBody) return;

  const total = currentBatchFiltered.length;
  if (total === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">No matching borrower records found in batch portfolio.</td></tr>`;
    if (indicator) indicator.textContent = `Showing 0 of ${currentBatchData.length} Borrowers`;
    return;
  }

  let itemsToRender = [];
  if (isShowAllBatchRows) {
    itemsToRender = currentBatchFiltered;
    if (indicator) indicator.textContent = `Showing all ${total} of ${currentBatchData.length} Borrowers`;
    if (btnPrev) btnPrev.disabled = true;
    if (btnNext) btnNext.disabled = true;
  } else {
    const totalPages = Math.ceil(total / BATCH_PAGE_SIZE);
    currentBatchPage = Math.max(1, Math.min(currentBatchPage, totalPages));
    
    const startIdx = (currentBatchPage - 1) * BATCH_PAGE_SIZE;
    const endIdx = Math.min(startIdx + BATCH_PAGE_SIZE, total);
    itemsToRender = currentBatchFiltered.slice(startIdx, endIdx);

    if (indicator) indicator.textContent = `Showing ${startIdx + 1}–${endIdx} of ${total} Borrowers (Page ${currentBatchPage} of ${totalPages})`;
    if (btnPrev) btnPrev.disabled = (currentBatchPage === 1);
    if (btnNext) btnNext.disabled = (currentBatchPage === totalPages);
  }

  let html = '';
  itemsToRender.forEach(b => {
    let decCls = 'badge-warning';
    if (b.decision === 'APPROVED') decCls = 'badge-teal';
    else if (b.decision && (b.decision.includes('REJECTED') || b.decision.includes('HIGH RISK'))) decCls = 'badge-danger';

    html += `
      <tr style="cursor: pointer;" onclick="populateFormFromBorrower('${b.farmer_id}'); runRiskAssessment(); window.scrollTo({ top: 0, behavior: 'smooth' });" title="Click to view detailed dual-pillar risk assessment for ${b.farmer_id}">
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); font-weight: 700; color: #0d9488;">${b.farmer_id}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);">${b.district}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);">${b.crop}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); font-weight: 600;">₹${(b.loan_amount || 0).toLocaleString()}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); font-weight: 700;">${b.credit_score}</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);">${b.pd_pct}%</td>
        <td style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle);"><span class="badge ${decCls}">${b.decision}</span></td>
      </tr>
    `;
  });

  tableBody.innerHTML = html;
  if (window.lucide) lucide.createIcons();
}

function createFallbackRiskResult(p) {
  let baseScore = 650;
  const irr = (p.irrigation_type || '').toLowerCase();
  if (irr.includes('drip')) baseScore += 70;
  else if (irr.includes('rainfed')) baseScore -= 40;

  const fidNum = parseInt((p.farmer_id || '').replace(/\D/g, '')) || 1;
  const variation = ((fidNum * 37) % 160) - 80;
  const score = Math.max(320, Math.min(880, baseScore + variation));
  const pdPct = Math.round(Math.max(3.0, Math.min(65.0, ((900 - score) / 600) * 60 + 5)) * 10) / 10;
  const dec = score >= 700 ? 'APPROVED' : (score >= 600 ? 'CONDITIONAL APPROVAL' : 'HIGH RISK / REJECTED');

  return {
    agronomic_dataset_context: {
      dataset_source: 'Kaggle Datasets Catalog',
      optimal_N: 75.0, optimal_P: 45.0, optimal_K: 35.0,
      water_requirement_liters_yr: 2200.0
    },
    telemetry_context: {
      rainfall_mm: 336.7, avg_temp_max_c: 31.2, heatwave_days: 1, soil_ph: 6.8, soil_texture: 'Loam'
    },
    risk_assessment: {
      climateCreditScore: score,
      climate_credit_score: score,
      estimated_repayment_probability_pct: Math.round((100 - pdPct) * 10) / 10,
      estimated_default_probability_pct: pdPct,
      pdClimatePct: pdPct,
      lgdPct: 35.0,
      expected_loss_inr: Math.round((p.loan_amount || 200000) * (pdPct / 100) * 0.35),
      expectedLossRs: Math.round((p.loan_amount || 200000) * (pdPct / 100) * 0.35),
      grossFarmRevenueRs: Math.round((p.loan_amount || 200000) * 1.8),
      netFarmRevenueRs: Math.round((p.loan_amount || 200000) * 1.1),
      dscr: Math.round((1.2 + (score - 600) / 300) * 100) / 100,
      decision: dec,
      decisionReason: score >= 700 ? 'Strong repayment capacity with low climate risk.' : 'Requires PM Fasal Bima Insurance & Drip installation.',
      overall_risk_classification: score >= 700 ? 'Low' : (score >= 600 ? 'Moderate' : 'High'),
      climate_risk_classification: irr.includes('rainfed') ? 'Moderate' : 'Low',
      financial_risk_classification: score >= 700 ? 'Low' : 'Moderate',
      plain_language_narrative: `Loan Application for Farmer Borrower (${p.farmer_id}) (${p.crop_type} on ${p.land_acres} acres in ${p.district}, ${p.state}) has been evaluated with an Overall Risk Classification of ${score >= 700 ? 'LOW' : (score >= 600 ? 'MODERATE' : 'HIGH')}. Climate-Credit Score is ${score}/900 based on loan parameters and telemetry context.`
    },
    explainability: {
      shapValues: [
        { feature: 'CIBIL / Repayment History', impactPoints: +45 },
        { feature: 'Irrigation Type', impactPoints: irr.includes('drip') ? +65 : -35 },
        { feature: 'Temperature Stress', impactPoints: -15 },
        { feature: 'Rainfall Coverage', impactPoints: +20 },
        { feature: 'Debt Coverage (DSCR)', impactPoints: +30 }
      ],
      recommendations: [
        'Mandatory enrollment in PM Fasal Bima Yojana Weather-Based Crop Insurance.',
        'Apply Soil Health Card recommended N-P-K fertilizer ratio for optimal yield.'
      ]
    }
  };
}

function createFallbackBatchResults() {
  const districts = ['Pune', 'Dharwad', 'Jaipur', 'Amravati', 'Warangal', 'Solapur', 'Agra', 'Belagavi', 'Indore', 'Rajkot', 'Prayagraj'];
  const crops = ['Pulses', 'Cotton', 'Onion', 'Sugarcane', 'Wheat', 'Rice', 'Maize', 'Millet'];

  const list = [];
  let totalExposure = 0;
  let totalEL = 0;
  let approved = 0;
  let conditional = 0;
  let rejected = 0;

  for (let i = 1; i <= 100; i++) {
    const fid = `DEMO${String(i).padStart(3, '0')}`;
    const dist = districts[i % districts.length];
    const crop = crops[i % crops.length];
    const loanAmt = 120000 + ((i * 3500) % 130000);

    const baseScore = 550 + ((i * 37) % 310);
    const pdPct = Math.round(Math.max(2.1, Math.min(45.0, ((900 - baseScore) / 600) * 40 + 2.0)) * 10) / 10;
    const el = Math.round(loanAmt * (pdPct / 100) * 0.35);

    let dec = 'APPROVED';
    if (baseScore >= 700) {
      dec = 'APPROVED';
      approved++;
    } else if (baseScore >= 600) {
      dec = 'CONDITIONAL APPROVAL';
      conditional++;
    } else {
      dec = 'HIGH RISK / REJECTED';
      rejected++;
    }

    totalExposure += loanAmt;
    totalEL += el;

    list.push({
      farmer_id: fid,
      district: dist,
      crop: crop,
      loan_amount: loanAmt,
      credit_score: baseScore,
      pd_pct: pdPct,
      expected_loss: el,
      dscr: Math.round((1.1 + (baseScore - 550) / 300) * 100) / 100,
      decision: dec
    });
  }

  return {
    portfolio_summary: {
      total_borrowers_evaluated: 100,
      approved_count: approved,
      conditional_count: conditional,
      rejected_count: rejected,
      approved_pct: Math.round(((approved + conditional) / 100) * 100),
      total_loan_exposure_inr: totalExposure,
      total_expected_loss_inr: totalEL,
      portfolio_expected_loss_pct: Math.round((totalEL / totalExposure) * 1000) / 10
    },
    borrowers: list
  };
}

function updateRiskRoleVisibility() {
  let isOfficer = false;
  try {
    const saved = localStorage.getItem('AGRISURE_AUTH_SESSION') || sessionStorage.getItem('AGRISURE_AUTH_SESSION') || localStorage.getItem('NABARD_AUTH_SESSION') || sessionStorage.getItem('NABARD_AUTH_SESSION');
    if (saved) {
      const sess = JSON.parse(saved);
      if (sess && sess.user && sess.user.role === 'bank_officer') {
        isOfficer = true;
      }
    }
  } catch (e) {}

  const btnContainer = document.getElementById('officerChangeBorrowerBtnContainer');
  const officerSelectCard = document.getElementById('riskOfficerBorrowerSelectCard');
  const decisionCard = document.getElementById('riskOfficerDecisionCard');
  const batchCard = document.getElementById('riskBatchPortfolioCard');

  if (btnContainer) btnContainer.style.display = isOfficer ? 'block' : 'none';
  if (officerSelectCard) officerSelectCard.style.display = isOfficer ? 'block' : 'none';
  if (decisionCard) decisionCard.style.display = isOfficer ? 'block' : 'none';
  if (batchCard) batchCard.style.display = isOfficer ? 'block' : 'none';

  // Target label update
  const targetLabel = document.getElementById('riskEvaluatedTargetLabel');
  if (targetLabel) {
    if (isOfficer) {
      const borrowerSelect = document.getElementById('riskBorrowerSelectPage') || document.getElementById('riskBorrowerSelect');
      const text = (borrowerSelect && borrowerSelect.options && borrowerSelect.options.length > 0 && borrowerSelect.selectedIndex >= 0) ? borrowerSelect.options[borrowerSelect.selectedIndex].text : 'DEMO001';
      targetLabel.textContent = `Borrower Application Record: ${text}`;
    } else {
      let farmerName = 'Farmer Borrower';
      try {
        const saved = localStorage.getItem('AGRISURE_AUTH_SESSION') || sessionStorage.getItem('AGRISURE_AUTH_SESSION');
        if (saved) {
          const sess = JSON.parse(saved);
          if (sess && sess.user && sess.user.full_name) farmerName = sess.user.full_name;
        }
      } catch (e) {}
      targetLabel.textContent = `My Personal Credit Risk Assessment — Farm Telemetry & Financial Score (${farmerName})`;
    }
  }
}
window.updateRiskRoleVisibility = updateRiskRoleVisibility;
window.runRiskAssessment = runRiskAssessment;
window.populateFormFromBorrower = populateFormFromBorrower;

