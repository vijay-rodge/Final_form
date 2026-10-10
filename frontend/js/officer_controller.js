// AgriSure Bank Officer Dashboard & Loan Review Controller
// Handles Executive Metrics, Chart.js Risk Visualizations, Searchable Queue, 10-Section File Review, and Decision Audit Trail Logging

document.addEventListener('DOMContentLoaded', () => {
  initOfficerPortalUI();
});

function getApiBaseOfficer() {
  const h = window.location.hostname;
  const p = window.location.port;
  if (h !== 'localhost' && h !== '127.0.0.1') return '';
  if (p === '8000' || p === '8080' || !p) return '';
  return `http://localhost:${p || '8000'}`;
}
const API_BASE_OFFICER = getApiBaseOfficer();

let riskDistChartInstance = null;
let climateTrendChartInstance = null;
let currentLoadedAppId = null;

function getOfficerAuthHeaders() {
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

function initOfficerPortalUI() {
  const searchInput = document.getElementById('officerQueueSearch');
  const statusFilter = document.getElementById('officerStatusFilter');
  const riskFilter = document.getElementById('officerRiskFilter');
  const btnCloseModal = document.getElementById('btnCloseOfficerAppModal');
  const formModalAction = document.getElementById('formOfficerModalAction');

  if (searchInput) {
    let timer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(() => fetchOfficerApplicationsQueue(), 300);
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', () => fetchOfficerApplicationsQueue());
  }

  if (riskFilter) {
    riskFilter.addEventListener('change', () => fetchOfficerApplicationsQueue());
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener('click', closeOfficerAppModal);
  }

  const modalOverlay = document.getElementById('officerAppModalOverlay');
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'officerAppModalOverlay') closeOfficerAppModal();
    });
  }

  if (formModalAction) {
    formModalAction.addEventListener('submit', handleOfficerModalActionSubmit);
  }

  // Loan Records dataset filters
  const loanSearchInput = document.getElementById('loanRecordsSearch');
  if (loanSearchInput) {
    let loanTimer = null;
    loanSearchInput.addEventListener('input', () => {
      clearTimeout(loanTimer);
      loanTimer = setTimeout(() => loadLoanRecordsTable(1), 300);
    });
  }

  const loanStatusFilter = document.getElementById('loanRecordsStatusFilter');
  if (loanStatusFilter) {
    loanStatusFilter.addEventListener('change', () => loadLoanRecordsTable(1));
  }

  // Quick action modal backdrop click
  const quickModalOverlay = document.getElementById('quickActionModalOverlay');
  if (quickModalOverlay) {
    quickModalOverlay.addEventListener('click', (e) => {
      if (e.target.id === 'quickActionModalOverlay') closeQuickActionModal();
    });
  }
}

/**
 * Loads Officer Dashboard Metrics, Portfolio Charts, and Applications Queue
 */
async function loadOfficerPortalData() {
  await fetchOfficerDashboardSummary();
  await fetchOfficerApplicationsQueue();
}

/**
 * Fetches Executive Dashboard Summary Metrics & Chart Data
 */
async function fetchOfficerDashboardSummary() {
  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/dashboard-summary`, {
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      renderOfficerSummaryMetrics(data.summary || {});
      renderOfficerRiskCharts(data.risk_level_distribution || {}, data.climate_risk_trends || []);
    }
  } catch (err) {
    console.warn('[OfficerService] Error fetching dashboard summary:', err);
  }
}

function renderOfficerSummaryMetrics(s) {
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setVal('valOfficerTotalApps', s.total_applications || 100);
  setVal('valOfficerAwaitingReview', s.awaiting_review_count || 0);
  setVal('valOfficerUnderReview', s.under_review_count || 0);
  setVal('valOfficerRiskAssessed', `${s.assessed_by_risk_engine_count || 100}`);
  setVal('valOfficerAddInfo', s.additional_info_required_count || 0);
  setVal('valOfficerApproveReject', `${s.approved_count || 0} / ${s.rejected_count || 0}`);
}

function renderOfficerRiskCharts(dist, trends) {
  // 1. Doughnut Chart: Risk Distribution
  const canvasDist = document.getElementById('chartOfficerRiskDist');
  if (canvasDist && window.Chart) {
    if (riskDistChartInstance) riskDistChartInstance.destroy();

    riskDistChartInstance = new Chart(canvasDist, {
      type: 'doughnut',
      data: {
        labels: ['Low Risk', 'Moderate Risk', 'High Risk'],
        datasets: [{
          data: [dist.Low || 45, dist.Moderate || 42, dist.High || 13],
          backgroundColor: ['#0d9488', '#d97706', '#e11d48']
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' }
        }
      }
    });
  }

  // 2. Bar Chart: Regional Climate Risk Trends
  const canvasTrends = document.getElementById('chartOfficerClimateTrends');
  if (canvasTrends && window.Chart && trends.length > 0) {
    if (climateTrendChartInstance) climateTrendChartInstance.destroy();

    const labels = trends.map(t => t.district);
    const rainData = trends.map(t => t.total_rain_mm);
    const highRiskData = trends.map(t => t.high_risk_count);

    climateTrendChartInstance = new Chart(canvasTrends, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Total Rainfall (mm)',
            data: rainData,
            backgroundColor: '#06b6d4',
            yAxisID: 'y'
          },
          {
            label: 'High Climate Risk Count',
            data: highRiskData,
            backgroundColor: '#e11d48',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { type: 'linear', position: 'left', title: { display: true, text: 'Rainfall (mm)' } },
          y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'High Risk Count' } }
        }
      }
    });
  }
}

/**
 * Fetches Searchable & Filterable Application Queue
 */
async function fetchOfficerApplicationsQueue() {
  const tbody = document.getElementById('officerQueueTableBody');
  if (!tbody) return;

  const search = document.getElementById('officerQueueSearch')?.value.trim() || '';
  const status = document.getElementById('officerStatusFilter')?.value || 'All';
  const risk = document.getElementById('officerRiskFilter')?.value || 'All';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status !== 'All') params.append('status_filter', status);
  if (risk !== 'All') params.append('risk_filter', risk);

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications?${params.toString()}`, {
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      renderOfficerQueueTable(data.applications || []);
      return;
    }
  } catch (err) {
    console.warn('[OfficerService] Queue API error, using static fallback:', err);
  }

  // Fallback if unauthenticated/offline
  tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--rose);">Unable to load queue. Please log in as a Bank Officer.</td></tr>`;
}

function renderOfficerQueueTable(apps) {
  const tbody = document.getElementById('officerQueueTableBody');
  if (!tbody) return;

  if (apps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; padding: 2rem; color: var(--text-muted);">No loan applications matching search filter criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = apps.map(a => {
    let statusCls = 'badge-cyan';
    if (a.current_status === 'Approved') statusCls = 'badge-teal';
    else if (a.current_status === 'Rejected') statusCls = 'badge-rose';
    else if (a.current_status.includes('Additional')) statusCls = 'badge-purple';
    else if (a.current_status === 'Under Review') statusCls = 'badge-teal';

    let riskCls = 'badge-teal';
    if (a.overall_risk_level === 'High') riskCls = 'badge-rose';
    else if (a.overall_risk_level === 'Moderate') riskCls = 'badge-purple';

    return `
      <tr>
        <td style="padding: 10px 12px; font-weight: 700; color: var(--cyan-hover);">${escapeHtml(a.application_id)}</td>
        <td style="padding: 10px 12px;">${escapeHtml(a.farmer_name)}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">${escapeHtml(a.location)}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">${escapeHtml(a.crop_type)} (${a.farm_area_acres} Ac)</td>
        <td style="padding: 10px 12px; font-weight: 700;">₹${Number(a.requested_amount_inr).toLocaleString('en-IN')}</td>
        <td style="padding: 10px 12px;"><span class="badge ${statusCls}">${escapeHtml(a.current_status)}</span></td>
        <td style="padding: 10px 12px; font-size: 0.8rem;">${escapeHtml(a.climate_risk_level)}</td>
        <td style="padding: 10px 12px; font-size: 0.8rem;">${escapeHtml(a.financial_risk_level)}</td>
        <td style="padding: 10px 12px;"><span class="badge ${riskCls}">${escapeHtml(a.overall_risk_level)}</span></td>
        <td style="padding: 10px 12px; text-align: center;">
          <button class="btn-primary" style="padding: 5px 10px; font-size: 0.78rem;" onclick="openOfficerAppFile('${escapeHtml(a.application_id)}')">
            <i data-lucide="file-text"></i> Review File
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * Opens 10-Section Application Review File Modal
 */
async function openOfficerAppFile(appId) {
  currentLoadedAppId = appId;
  const modal = document.getElementById('officerAppModalOverlay');
  if (modal) modal.style.display = 'flex';

  document.getElementById('modalAppHeaderTitle').textContent = `Application Review File: ${appId}`;

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications/${appId}`, {
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      const file = await res.json();
      populateModalAppFile(file);
    }
  } catch (err) {
    console.error('Error fetching application review file:', err);
  }
}

function populateModalAppFile(f) {
  const s1 = f.section_1_farmer_profile || {};
  const s2 = f.section_2_bank_and_financials || {};
  const s3 = f.section_3_credit_score_repayment || {};
  const s4 = f.section_4_existing_obligations || {};
  const s5 = f.section_5_climate_weather_analysis || {};
  const s6 = f.section_6_satellite_agronomic || {};
  const s7 = f.section_7_risk_assessment_repayment_prob || {};
  const s8 = f.section_8_risk_drivers_explanation || {};
  const s9 = f.section_9_missing_data_warnings || [];
  const s10 = f.section_10_audit_trail_history || [];

  // Header Subtitle
  document.getElementById('modalAppHeaderSubtitle').textContent = `Farmer: ${s1.full_name} (${s1.farmer_id}) | Location: ${s1.district}, ${s1.state}`;

  // Section 1: Farmer Profile
  document.getElementById('fileFarmerName').textContent = s1.full_name || '--';
  document.getElementById('fileFarmerId').textContent = s1.farmer_id || '--';
  document.getElementById('filePhone').textContent = s1.phone_number || '+91 XXXXX XXXXX';
  document.getElementById('fileLocation').textContent = `${s1.district}, ${s1.state}`;

  // Section 2: Bank
  document.getElementById('fileBankName').textContent = s2.bank_name || '--';
  document.getElementById('fileAcctNo').textContent = s2.kcc_account_number || 'XXXX-XXXX-1540';
  document.getElementById('fileAcctBal').textContent = typeof s2.account_balance_inr === 'number' ? `₹${s2.account_balance_inr.toLocaleString()}` : s2.account_balance_inr;

  // Section 3: CIBIL
  document.getElementById('fileCibilScore').textContent = s3.derived_cibil_score || '720';
  document.getElementById('fileRepayHist').textContent = s3.previous_repayment_history || 'Repaid on time';

  // Section 4: Obligations
  document.getElementById('fileOverdue').textContent = `₹${(s4.amount_overdue_inr || 0).toLocaleString()} Overdue`;
  document.getElementById('fileDPD').textContent = `${s3.days_past_due || 0} Days`;

  // Section 5: Climate
  document.getElementById('fileRainfall').textContent = `${s5.rainfall_mm || 320} mm`;
  document.getElementById('fileRainDeficit').textContent = `${s5.rainfall_deficit_pct || 0}%`;
  document.getElementById('fileTemp').textContent = `${s5.avg_temp_max_c || 29.5}°C`;
  document.getElementById('fileHeatwave').textContent = `${s5.heatwave_days_count || 1} Days`;

  // Section 6: Satellite & Yield
  document.getElementById('fileBenchYield').textContent = `${s6.benchmark_yield_tons_ha || 4.5} Tons/ha`;
  document.getElementById('fileIrrigation').textContent = s6.irrigation_type || 'Rainfed';
  document.getElementById('fileSoil').textContent = `${s6.soil_texture || 'Loam'} (pH ${s6.soil_ph || 6.8})`;

  // Section 7: Risk
  document.getElementById('fileOverallRisk').textContent = (s7.overall_risk_classification || 'Low').toUpperCase();
  document.getElementById('fileClimateRisk').textContent = s7.climate_risk_classification || 'Moderate';
  document.getElementById('fileFinancialRisk').textContent = s7.financial_risk_classification || 'Low';
  document.getElementById('fileRepaymentScore').textContent = `${s7.estimated_repayment_probability_pct || 89.5}%`;

  // Section 8: Risk Drivers
  const pos = s8.positive_factors || [];
  const neg = s8.negative_factors || [];
  const driversContainer = document.getElementById('fileRiskDriversList');
  if (driversContainer) {
    let html = '';
    pos.forEach(p => { html += `<div style="color: #166534;">🟢 <strong>${p.factor}</strong>: ${p.explanation}</div>`; });
    neg.forEach(n => { html += `<div style="color: #be123c;">🔴 <strong>${n.factor}</strong>: ${n.explanation}</div>`; });
    driversContainer.innerHTML = html || '<div>No specific drivers recorded.</div>';
  }

  // Section 9: Missing Data Warnings
  const warningsContainer = document.getElementById('fileMissingDataList');
  if (warningsContainer) {
    if (s9.length === 0) {
      warningsContainer.innerHTML = '<div style="color: #166534;">🟢 All application data fields fully verified.</div>';
    } else {
      warningsContainer.innerHTML = s9.map(w => `
        <div style="margin-bottom: 4px;">⚠️ <strong>${w.field}:</strong> ${w.impact} <span class="badge badge-purple" style="font-size: 0.7rem;">${w.badge}</span></div>
      `).join('');
    }
  }

  // Section 10: Audit Trail Timeline
  const auditContainer = document.getElementById('fileAuditTrailTimeline');
  if (auditContainer) {
    auditContainer.innerHTML = s10.map(a => `
      <div style="border-left: 2px solid #0d9488; padding-left: 10px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; font-weight: 700; color: var(--text-main);">
          <span>${escapeHtml(a.action || a.status)}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(a.timestamp).toLocaleString()}</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-body); margin-top: 2px;">${escapeHtml(a.notes || a.officer_notes || 'Review step completed')}</div>
        <div style="font-size: 0.72rem; color: var(--text-muted);">Recorded by: ${escapeHtml(a.officer_name || a.officer_username)}</div>
      </div>
    `).join('');
  }

  if (window.lucide) lucide.createIcons();
}

/**
 * Handles Officer Action & Status Change Submission
 */
async function handleOfficerModalActionSubmit(e) {
  e.preventDefault();
  const alertBox = document.getElementById('modalOfficerAlertBox');
  const btnSubmit = document.getElementById('btnSubmitModalOfficerAction');
  
  if (alertBox) alertBox.style.display = 'none';

  if (!currentLoadedAppId) return;

  const action = document.getElementById('modalActionSelect').value;
  const approvedAmt = parseFloat(document.getElementById('modalApprovedAmount').value) || null;
  const notes = document.getElementById('modalExplanationNotes').value.trim();

  if ((action === 'approve' || action === 'reject' || action === 'request_additional_info') && !notes) {
    if (alertBox) {
      alertBox.className = 'warning-alert';
      alertBox.textContent = 'Mandatory Officer Decision Rationale is required.';
      alertBox.style.display = 'block';
    }
    return;
  }

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = `<i data-lucide="loader-2" class="spin"></i> Logging Decision Audit Record...`;
  }

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications/${currentLoadedAppId}/status`, {
      method: 'POST',
      headers: getOfficerAuthHeaders(),
      body: JSON.stringify({
        action: action,
        explanation_or_notes: notes,
        approved_amount_inr: approvedAmt
      })
    });

    const data = await res.json();
    if (!res.ok) {
      if (alertBox) {
        alertBox.className = 'warning-alert';
        alertBox.textContent = data.detail?.message || data.detail || 'Action failed.';
        alertBox.style.display = 'block';
      }
      return;
    }

    if (alertBox) {
      alertBox.className = 'info-alert';
      alertBox.style.background = '#f0fdf4';
      alertBox.style.border = '1px solid #86efac';
      alertBox.style.color = '#166534';
      alertBox.innerHTML = `<strong>✅ Decision Recorded!</strong><br>Status updated to <code>${data.new_status}</code>. Audit log entry recorded.`;
      alertBox.style.display = 'block';
    }

    // Refresh application modal file and queue table
    setTimeout(() => {
      openOfficerAppFile(currentLoadedAppId);
      fetchOfficerDashboardSummary();
      fetchOfficerApplicationsQueue();
    }, 1000);

  } catch (err) {
    if (alertBox) {
      alertBox.className = 'warning-alert';
      alertBox.textContent = 'Server error recording decision.';
      alertBox.style.display = 'block';
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `<i data-lucide="check-circle-2"></i> Submit Officer Decision & Log Audit Record`;
    }
  }
}

function closeOfficerAppModal() {
  const modal = document.getElementById('officerAppModalOverlay');
  if (modal) modal.style.display = 'none';
  currentLoadedAppId = null;
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeJs(str) {
  return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

/**
 * Renders the Rectangular Farmer Application Request Bars
 * Displays labeled bar with farmer details, crop, risk, and action buttons (Approve, Reject, Review, Delete Row).
 */
function renderRectangularAppBars(containerId, apps) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!apps || apps.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
        <div style="font-size: 2rem; margin-bottom: 8px;">✨</div>
        <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">No Active Farmer Loan Applications</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
          All farmer loan application requests have been reviewed or cleared from this active desk.
        </div>
        <button class="btn-secondary" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 14px;" onclick="resetDismissedApps()">
          <i data-lucide="rotate-ccw"></i> Restore Cleared Rows
        </button>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = apps.map(a => {
    const appId = escapeHtml(a.application_id);
    const farmerName = escapeHtml(a.farmer_name || 'Farmer Borrower');
    const farmerId = escapeHtml(a.farmer_id || '');
    const location = escapeHtml(a.location || 'Maharashtra');
    const crop = escapeHtml(a.crop_type || 'Crop');
    const acres = a.farm_area_acres || 0;
    const reqAmount = a.requested_amount_inr || 0;
    const purpose = escapeHtml(a.loan_purpose || 'Agricultural Working Capital');
    const status = a.current_status || 'Submitted';
    const notes = a.officer_notes || '';
    const irr = escapeHtml(a.irrigation_type || 'Canal / Borewell');
    const cibil = a.cibil_score || 720;
    const risk = a.overall_risk_level || 'Low';

    let statusBadgeClass = 'badge-cyan';
    let borderColor = '#0d9488';
    if (status === 'Approved') {
      statusBadgeClass = 'badge-teal';
      borderColor = '#10b981';
    } else if (status === 'Rejected') {
      statusBadgeClass = 'badge-rose';
      borderColor = '#e11d48';
    } else if (status.includes('Additional') || status.includes('Info')) {
      statusBadgeClass = 'badge-purple';
      borderColor = '#8b5cf6';
    } else if (status === 'Under Review') {
      statusBadgeClass = 'badge-teal';
      borderColor = '#0d9488';
    }

    let riskBadgeClass = 'badge-teal';
    if (risk === 'High') riskBadgeClass = 'badge-rose';
    else if (risk === 'Moderate') riskBadgeClass = 'badge-purple';

    const safeFarmerJs = escapeJs(farmerName);

    return `
      <div class="officer-app-bar" id="app-bar-${appId}" style="background: #ffffff; border: 1.5px solid ${borderColor}; border-radius: 10px; padding: 1.15rem 1.35rem; margin-bottom: 1rem; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: transform 0.2s ease, box-shadow 0.2s ease;">
        
        <!-- Bar Header: Rectangular Application Request Label + App ID + Statuses -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.85rem; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
            <span class="badge" style="background: #ccfbf1; color: #0f766e; font-weight: 700; font-size: 0.82rem; padding: 5px 12px; border: 1px solid #99f6e4; display: inline-flex; align-items: center; gap: 5px;">
              🌾 Application Request from Farmer
            </span>
            <span style="font-weight: 800; color: #0d9488; font-size: 1.05rem; cursor: pointer; text-decoration: underline;" onclick="openOfficerAppFile('${appId}')" title="Click to view complete 10-section file">
              ${appId}
            </span>
            ${a.is_newly_submitted ? '<span class="badge badge-purple" style="font-size: 0.72rem;">New Submission</span>' : ''}
          </div>
          
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="badge ${statusBadgeClass}" style="font-size: 0.82rem; font-weight: 700; padding: 4px 12px;">
              ${escapeHtml(status)}
            </span>
            <span class="badge ${riskBadgeClass}" style="font-size: 0.76rem; font-weight: 600;">
              ${escapeHtml(risk)} Risk
            </span>
          </div>
        </div>

        <!-- Bar Body: Grid with Farmer demographics, Agronomics, and Loan metrics -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 0.75rem; background: #f8fafc; padding: 12px 14px; border-radius: 8px; border: 1px solid var(--border-subtle);">
          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Farmer Borrower</div>
            <div style="font-weight: 800; color: var(--text-main); font-size: 0.95rem;">${farmerName}</div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">${location} ${farmerId ? `(${farmerId})` : ''}</div>
          </div>

          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Requested Amount</div>
            <div style="font-weight: 800; color: #0f766e; font-size: 1.2rem;">₹${Number(reqAmount).toLocaleString('en-IN')}</div>
            ${a.approved_amount_inr ? `<div style="font-size: 0.75rem; color: #10b981; font-weight: 700;">Approved: ₹${Number(a.approved_amount_inr).toLocaleString('en-IN')}</div>` : ''}
          </div>

          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Crop & Land Area</div>
            <div style="font-weight: 700; color: var(--text-main); font-size: 0.9rem;">${crop} (${acres} Acres)</div>
            <div style="font-size: 0.76rem; color: var(--text-muted);">${irr} | CIBIL: <strong>${cibil}</strong></div>
          </div>

          <div>
            <div style="font-size: 0.72rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Loan Purpose</div>
            <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; line-height: 1.35;">${purpose}</div>
            <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">Date: ${escapeHtml(a.submission_date || '2026-10-09')}</div>
          </div>
        </div>

        <!-- Officer Review Notes snippet if already processed -->
        ${notes ? `
          <div style="background: #ffffff; border-left: 3px solid #0d9488; padding: 6px 10px; margin-bottom: 0.75rem; font-size: 0.8rem; color: var(--text-body); border-radius: 0 4px 4px 0;">
            <strong style="color: #0f766e;">Officer Review Note:</strong> ${escapeHtml(notes)}
          </div>
        ` : ''}

        <!-- Action Bar: Approve, Reject, Review File, Delete Row -->
        <div style="display: flex; justify-content: flex-end; align-items: center; gap: 8px; flex-wrap: wrap; padding-top: 0.6rem; border-top: 1px dashed #e2e8f0;">
          <button class="btn-primary" style="background: #10b981; border: none; padding: 6px 14px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;" onclick="openQuickApproveModal('${appId}', ${reqAmount}, '${safeFarmerJs}')">
            <i data-lucide="check-circle-2"></i> Approve
          </button>
          <button class="btn-primary" style="background: #e11d48; border: none; padding: 6px 14px; font-size: 0.82rem; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;" onclick="openQuickRejectModal('${appId}', '${safeFarmerJs}')">
            <i data-lucide="x-circle"></i> Reject
          </button>
          <button class="btn-secondary" style="padding: 6px 14px; font-size: 0.82rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;" onclick="openOfficerAppFile('${appId}')">
            <i data-lucide="file-text"></i> Review File
          </button>
          <button class="btn-secondary" style="background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; padding: 6px 12px; font-size: 0.82rem; font-weight: 600; display: inline-flex; align-items: center; gap: 5px;" onclick="deleteAppRow('${appId}')" title="Dismiss row from active review desk">
            <i data-lucide="trash-2"></i> Delete Row
          </button>
        </div>

      </div>
    `;
  }).join('');

  if (window.lucide) lucide.createIcons();
}

/**
 * Opens 1-Click Quick Approve Modal
 */
function openQuickApproveModal(appId, requestedAmt, farmerName) {
  const modal = document.getElementById('quickActionModalOverlay');
  if (!modal) return;

  document.getElementById('quickActionAppId').value = appId;
  document.getElementById('quickActionType').value = 'approve';
  document.getElementById('quickActionTitle').textContent = 'Confirm Loan Approval';
  document.getElementById('quickActionSubtitle').textContent = `Application: ${appId} | Farmer: ${farmerName}`;
  
  const amtGroup = document.getElementById('quickActionAmountGroup');
  if (amtGroup) amtGroup.style.display = 'block';
  
  document.getElementById('quickActionAmount').value = requestedAmt || 150000;
  document.getElementById('quickActionReqAmountLabel').textContent = `₹${Number(requestedAmt || 0).toLocaleString('en-IN')}`;
  
  document.getElementById('quickActionNotesLabel').innerHTML = 'Officer Approval Rationale & Risk Determination <span style="color: var(--rose);">*</span>';
  document.getElementById('quickActionNotes').value = 'Approved following automated dual-pillar risk assessment. Strong CIBIL history, verified land record, and low climate vulnerability.';

  const btnConfirm = document.getElementById('btnConfirmQuickAction');
  if (btnConfirm) {
    btnConfirm.style.background = '#10b981';
    btnConfirm.innerHTML = '<i data-lucide="check"></i> Confirm Approval & Update Records';
  }

  const iconBox = document.getElementById('quickActionIconBox');
  if (iconBox) iconBox.innerHTML = '<i data-lucide="check-circle"></i>';

  const alertBox = document.getElementById('quickActionAlert');
  if (alertBox) alertBox.style.display = 'none';

  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

/**
 * Opens 1-Click Quick Reject Modal
 */
function openQuickRejectModal(appId, farmerName) {
  const modal = document.getElementById('quickActionModalOverlay');
  if (!modal) return;

  document.getElementById('quickActionAppId').value = appId;
  document.getElementById('quickActionType').value = 'reject';
  document.getElementById('quickActionTitle').textContent = 'Confirm Loan Rejection';
  document.getElementById('quickActionSubtitle').textContent = `Application: ${appId} | Farmer: ${farmerName}`;
  
  const amtGroup = document.getElementById('quickActionAmountGroup');
  if (amtGroup) amtGroup.style.display = 'none';
  
  document.getElementById('quickActionNotesLabel').innerHTML = 'Officer Rejection Rationale <span style="color: var(--rose);">*</span>';
  document.getElementById('quickActionNotes').value = 'Application rejected due to inadequate debt coverage or elevated climate vulnerability.';

  const btnConfirm = document.getElementById('btnConfirmQuickAction');
  if (btnConfirm) {
    btnConfirm.style.background = '#e11d48';
    btnConfirm.innerHTML = '<i data-lucide="x-circle"></i> Confirm Rejection & Update Records';
  }

  const iconBox = document.getElementById('quickActionIconBox');
  if (iconBox) iconBox.innerHTML = '<i data-lucide="x-circle"></i>';

  const alertBox = document.getElementById('quickActionAlert');
  if (alertBox) alertBox.style.display = 'none';

  modal.style.display = 'flex';
  if (window.lucide) lucide.createIcons();
}

/**
 * Closes Quick Action Modal
 */
function closeQuickActionModal() {
  const modal = document.getElementById('quickActionModalOverlay');
  if (modal) modal.style.display = 'none';
}

/**
 * Submits Quick Action Confirm (Approve / Reject)
 */
async function submitQuickActionConfirm(e) {
  e.preventDefault();
  const alertBox = document.getElementById('quickActionAlert');
  const btnSubmit = document.getElementById('btnConfirmQuickAction');
  
  if (alertBox) alertBox.style.display = 'none';

  const appId = document.getElementById('quickActionAppId').value;
  const action = document.getElementById('quickActionType').value;
  const amount = parseFloat(document.getElementById('quickActionAmount').value) || null;
  const notes = document.getElementById('quickActionNotes').value.trim();

  if (!appId || !action) return;

  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Processing Decision...';
  }

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications/${appId}/quick-action`, {
      method: 'POST',
      headers: getOfficerAuthHeaders(),
      body: JSON.stringify({
        action: action,
        explanation_or_notes: notes,
        approved_amount_inr: amount
      })
    });

    const data = await res.json();
    if (!res.ok) {
      if (alertBox) {
        alertBox.className = 'warning-alert';
        alertBox.textContent = data.detail?.message || data.detail || 'Action failed.';
        alertBox.style.display = 'block';
      }
      return;
    }

    closeQuickActionModal();
    alert(`✅ Application ${appId} successfully ${action === 'approve' ? 'Approved' : 'Rejected'}!\nUpdated for farmer and recorded in loan records.`);
    
    // Refresh all views
    loadOfficerLoansView();
    renderOfficerDashboardView();
    if (window.loadFarmerDashboardData) window.loadFarmerDashboardData();

  } catch (err) {
    if (alertBox) {
      alertBox.className = 'warning-alert';
      alertBox.textContent = 'Server error recording decision.';
      alertBox.style.display = 'block';
    }
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
    }
  }
}

/**
 * Deletes / Dismisses Application Row from Active Review Desk
 */
async function deleteAppRow(appId) {
  if (!confirm(`Are you sure you want to dismiss application ${appId} from this review desk?\n\nNote: The underlying loan record and farmer's decision status will remain permanently stored.`)) {
    return;
  }

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications/${appId}/delete`, {
      method: 'POST',
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      // Animate removal from DOM
      const bars = document.querySelectorAll(`[id="app-bar-${appId}"]`);
      bars.forEach(b => {
        b.style.transition = 'all 0.3s ease';
        b.style.opacity = '0';
        b.style.transform = 'translateX(30px)';
        setTimeout(() => b.remove(), 300);
      });

      // Update counters
      const pendingEl = document.getElementById('dashOfficerPendingCount');
      if (pendingEl) {
        const c = parseInt(pendingEl.textContent) || 0;
        if (c > 0) pendingEl.textContent = c - 1;
      }

      // Check if container is empty
      setTimeout(() => {
        ['dashOfficerAppBarsContainer', 'officerLoansAppBarsContainer'].forEach(cId => {
          const c = document.getElementById(cId);
          if (c && c.querySelectorAll('.officer-app-bar').length === 0) {
            c.innerHTML = `
              <div style="text-align: center; padding: 2.5rem 1.5rem; background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px;">
                <div style="font-size: 2rem; margin-bottom: 8px;">✨</div>
                <div style="font-weight: 700; color: var(--text-main); font-size: 1rem;">All Applications Processed</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 4px;">
                  Processed application rows have been cleared from this desk. Underlying loan records remain permanently saved.
                </div>
                <button class="btn-secondary" style="margin-top: 12px; font-size: 0.8rem; padding: 6px 14px;" onclick="resetDismissedApps()">
                  <i data-lucide="rotate-ccw"></i> Restore Cleared Rows
                </button>
              </div>
            `;
            if (window.lucide) lucide.createIcons();
          }
        });
      }, 350);

    } else {
      alert('Failed to dismiss row from server.');
    }
  } catch (err) {
    console.error('Error deleting application row:', err);
  }
}

/**
 * Restores All Dismissed Applications Back to Queue
 */
async function resetDismissedApps() {
  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications/reset-dismissed`, {
      method: 'POST',
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      alert('All dismissed applications have been restored to your review desk.');
      renderOfficerDashboardView();
      loadOfficerLoansView();
    }
  } catch (err) {
    console.error('Error resetting dismissed apps:', err);
  }
}

/**
 * Loan Records Dataset Table (Pagination & Search)
 */
let currentLoanRecordsPage = 1;
let totalLoanRecordsPages = 1;

async function loadLoanRecordsTable(page = 1) {
  currentLoanRecordsPage = Math.max(1, page);
  const tbody = document.getElementById('loanRecordsTableBody');
  if (!tbody) return;

  const search = document.getElementById('loanRecordsSearch')?.value.trim() || '';
  const status = document.getElementById('loanRecordsStatusFilter')?.value || 'All';

  const params = new URLSearchParams({
    page: currentLoanRecordsPage,
    page_size: 15
  });
  if (search) params.append('search', search);
  if (status !== 'All') params.append('status_filter', status);

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/loan-records?${params.toString()}`, {
      headers: getOfficerAuthHeaders()
    });

    if (res.ok) {
      const data = await res.json();
      totalLoanRecordsPages = data.total_pages || 1;
      renderLoanRecordsTable(data.records || [], data.total_records || 0, data.page || 1, totalLoanRecordsPages);
    } else {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--rose);">Failed to load loan records.</td></tr>`;
    }
  } catch (err) {
    console.error('Error loading loan records:', err);
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--rose);">Error connecting to backend server.</td></tr>`;
  }
}

function renderLoanRecordsTable(records, totalRecords, page, totalPages) {
  const tbody = document.getElementById('loanRecordsTableBody');
  if (!tbody) return;

  if (!records || records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; padding: 2rem; color: var(--text-muted);">No loan records match search criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = records.map(r => {
    const loanId = escapeHtml(r.loan_id || '--');
    const farmerId = escapeHtml(r.farmer_id || '--');
    const loc = escapeHtml(`${r.district || ''}, ${r.state || ''}`);
    const crop = escapeHtml(`${r.crop_type || ''} (${r.farm_area_acres || 0} Ac)`);
    const amt = Number(r.loan_amount_inr || 0).toLocaleString('en-IN');
    const income = Number(r.estimated_annual_farm_income_inr || 0).toLocaleString('en-IN');
    const rate = `${r.annual_interest_rate_pct || 8.5}%`;
    const repStatus = escapeHtml(r.repayment_status || 'Active');
    const defFlag = parseInt(r.default_flag || 0);

    let statusCls = 'badge-teal';
    if (repStatus.toLowerCase().includes('reject')) statusCls = 'badge-rose';
    else if (repStatus.toLowerCase().includes('overdue') || repStatus.toLowerCase().includes('delay')) statusCls = 'badge-purple';
    else if (repStatus.toLowerCase().includes('repaid')) statusCls = 'badge-teal';
    else if (repStatus.toLowerCase().includes('submitted')) statusCls = 'badge-cyan';

    const riskBadge = (defFlag === 1) 
      ? '<span class="badge badge-rose">High Risk</span>' 
      : '<span class="badge badge-teal">Normal Risk</span>';

    return `
      <tr>
        <td style="padding: 10px 12px; font-weight: 700; color: #0d9488;">${loanId}</td>
        <td style="padding: 10px 12px; font-weight: 600;">${farmerId}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">${loc}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">${crop}</td>
        <td style="padding: 10px 12px; font-weight: 700; color: #0f766e;">₹${amt}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">₹${income}</td>
        <td style="padding: 10px 12px; font-size: 0.85rem;">${rate}</td>
        <td style="padding: 10px 12px;"><span class="badge ${statusCls}">${repStatus}</span></td>
        <td style="padding: 10px 12px; text-align: center;">${riskBadge}</td>
      </tr>
    `;
  }).join('');

  // Update pagination info
  const start = Math.min((page - 1) * 15 + 1, totalRecords);
  const end = Math.min(page * 15, totalRecords);
  const infoEl = document.getElementById('loanRecordsPaginationInfo');
  if (infoEl) infoEl.textContent = `Showing ${start} - ${end} of ${totalRecords} records`;

  const pageLabel = document.getElementById('currentLoanPageLabel');
  if (pageLabel) pageLabel.textContent = `Page ${page} of ${totalPages}`;

  const btnPrev = document.getElementById('btnPrevLoanPage');
  if (btnPrev) btnPrev.disabled = (page <= 1);

  const btnNext = document.getElementById('btnNextLoanPage');
  if (btnNext) btnNext.disabled = (page >= totalPages);

  if (window.lucide) lucide.createIcons();
}

function changeLoanRecordsPage(delta) {
  const newPage = currentLoanRecordsPage + delta;
  if (newPage >= 1 && newPage <= totalLoanRecordsPages) {
    loadLoanRecordsTable(newPage);
  }
}

/**
 * Loads Officer View on Loan Records Page (#/loans)
 */
async function loadOfficerLoansView() {
  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications`, {
      headers: getOfficerAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      renderRectangularAppBars('officerLoansAppBarsContainer', data.applications || []);
    }
  } catch (err) {
    console.error('Error fetching applications for loan desk:', err);
  }

  loadLoanRecordsTable(1);
}

/**
 * Loads Officer View on Dashboard Page (#/dashboard)
 */
async function renderOfficerDashboardView() {
  const dashContainer = document.getElementById('officerDashboardContainer');
  if (dashContainer) dashContainer.style.display = 'block';

  try {
    const resSumm = await fetch(`${API_BASE_OFFICER}/api/v2/officer/dashboard-summary`, {
      headers: getOfficerAuthHeaders()
    });
    if (resSumm.ok) {
      const dataSumm = await resSumm.json();
      const s = dataSumm.summary || {};
      const welcome = document.getElementById('dashOfficerWelcome');
      if (welcome) {
        welcome.textContent = `Authorized Credit Officer: ${dataSumm.officer || 'Anil Deshmukh (Credit Officer)'} | AgriSure Regional Office`;
      }
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };
      setVal('dashOfficerPendingCount', s.awaiting_review_count || 0);
      setVal('dashOfficerReviewCount', s.under_review_count || 0);
      setVal('dashOfficerApprovedCount', s.approved_count || 0);
      setVal('dashOfficerRejectedCount', s.rejected_count || 0);
    }
  } catch (err) {
    console.error('Error loading officer dashboard summary:', err);
  }

  try {
    const res = await fetch(`${API_BASE_OFFICER}/api/v2/officer/applications`, {
      headers: getOfficerAuthHeaders()
    });
    if (res.ok) {
      const data = await res.json();
      renderRectangularAppBars('dashOfficerAppBarsContainer', data.applications || []);
    }
  } catch (err) {
    console.error('Error loading officer dashboard applications:', err);
  }
}

// Global window exports
window.loadOfficerPortalData = loadOfficerPortalData;
window.openOfficerAppFile = openOfficerAppFile;
window.renderOfficerDashboardView = renderOfficerDashboardView;
window.loadOfficerLoansView = loadOfficerLoansView;
window.openQuickApproveModal = openQuickApproveModal;
window.openQuickRejectModal = openQuickRejectModal;
window.closeQuickActionModal = closeQuickActionModal;
window.submitQuickActionConfirm = submitQuickActionConfirm;
window.deleteAppRow = deleteAppRow;
window.resetDismissedApps = resetDismissedApps;
window.loadLoanRecordsTable = loadLoanRecordsTable;
window.changeLoanRecordsPage = changeLoanRecordsPage;
window.renderRectangularAppBars = renderRectangularAppBars;
