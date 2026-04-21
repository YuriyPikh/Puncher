const state = {
  companies: [],
  usersByCompany: new Map(),
  adminUsers: [],
  employeeLogs: [],
  employeeCorrections: [],
  adminLogs: [],
  adminCorrections: [],
  dashboard: null,
  sessions: {
    employee: null,
    kiosk: null
  },
  selected: {
    globalCompanyId: '',
    globalUserId: '',
    employeeCompanyId: '',
    employeeUserId: '',
    adminCompanyId: ''
  }
};

const elements = {
  healthBadge: document.getElementById('healthBadge'),
  healthStats: document.getElementById('healthStats'),
  healthTimestamp: document.getElementById('healthTimestamp'),
  docsDatabase: document.getElementById('docsDatabase'),
  docsEndpoints: document.getElementById('docsEndpoints'),
  globalCompanySelect: document.getElementById('globalCompanySelect'),
  globalUserSelect: document.getElementById('globalUserSelect'),
  refreshOverviewButton: document.getElementById('refreshOverviewButton'),
  employeeLoginForm: document.getElementById('employeeLoginForm'),
  employeeContextForm: document.getElementById('employeeContextForm'),
  employeeCompanySelect: document.getElementById('employeeCompanySelect'),
  employeeUserSelect: document.getElementById('employeeUserSelect'),
  employeeSessionBadge: document.getElementById('employeeSessionBadge'),
  punchForm: document.getElementById('punchForm'),
  employeeShiftStatus: document.getElementById('employeeShiftStatus'),
  employeeLogFiltersForm: document.getElementById('employeeLogFiltersForm'),
  employeeLogsTable: document.getElementById('employeeLogsTable'),
  correctionForm: document.getElementById('correctionForm'),
  correctionLogSelect: document.getElementById('correctionLogSelect'),
  employeeCorrectionsTable: document.getElementById('employeeCorrectionsTable'),
  refreshEmployeeDataButton: document.getElementById('refreshEmployeeDataButton'),
  kioskLoginForm: document.getElementById('kioskLoginForm'),
  kioskPunchForm: document.getElementById('kioskPunchForm'),
  kioskSessionBadge: document.getElementById('kioskSessionBadge'),
  kioskStatus: document.getElementById('kioskStatus'),
  adminCompanyForm: document.getElementById('adminCompanyForm'),
  adminCompanySelect: document.getElementById('adminCompanySelect'),
  includeInactiveUsersCheckbox: document.getElementById('includeInactiveUsersCheckbox'),
  adminCompanyBadge: document.getElementById('adminCompanyBadge'),
  dashboardSummary: document.getElementById('dashboardSummary'),
  addUserForm: document.getElementById('addUserForm'),
  resetCredentialsForm: document.getElementById('resetCredentialsForm'),
  resetUserSelect: document.getElementById('resetUserSelect'),
  dashboardEmployeesTable: document.getElementById('dashboardEmployeesTable'),
  reviewCorrectionForm: document.getElementById('reviewCorrectionForm'),
  reviewCorrectionSelect: document.getElementById('reviewCorrectionSelect'),
  adminCorrectionsTable: document.getElementById('adminCorrectionsTable'),
  refreshAdminButton: document.getElementById('refreshAdminButton'),
  adminLogsFilterForm: document.getElementById('adminLogsFilterForm'),
  adminLogUserSelect: document.getElementById('adminLogUserSelect'),
  adminLogsTable: document.getElementById('adminLogsTable'),
  editLogForm: document.getElementById('editLogForm'),
  editLogSelect: document.getElementById('editLogSelect'),
  reportForm: document.getElementById('reportForm'),
  reportDownloadLink: document.getElementById('reportDownloadLink'),
  reportLinkPreview: document.getElementById('reportLinkPreview'),
  toast: document.getElementById('toast')
};

function showToast(message, tone = 'info') {
  elements.toast.hidden = false;
  elements.toast.dataset.tone = tone;
  elements.toast.textContent = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 4200);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getJsonBody(form) {
  const formData = new FormData(form);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === 'string' ? value.trim() : value;
  }
  return payload;
}

async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = typeof data === 'object' && data ? data.message : `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function toLocalDateTimeInput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function toIsoFromInput(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date/time value');
  }

  return date.toISOString();
}

function formatDateTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date);
}

function formatDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const remainder = total % 60;
  return `${hours}h ${remainder}m`;
}

function persistState() {
  localStorage.setItem(
    'puncher-ui-state',
    JSON.stringify({
      sessions: state.sessions,
      selected: state.selected
    })
  );
}

function restoreState() {
  const saved = localStorage.getItem('puncher-ui-state');
  if (!saved) {
    return;
  }

  try {
    const parsed = JSON.parse(saved);
    state.sessions = parsed.sessions || state.sessions;
    state.selected = { ...state.selected, ...(parsed.selected || {}) };
  } catch (_error) {
    localStorage.removeItem('puncher-ui-state');
  }
}

function buildOptions(items, valueKey, labelBuilder, placeholder) {
  const parts = [];
  if (placeholder) {
    parts.push(`<option value="">${escapeHtml(placeholder)}</option>`);
  }

  for (const item of items) {
    parts.push(`<option value="${escapeHtml(item[valueKey])}">${escapeHtml(labelBuilder(item))}</option>`);
  }

  return parts.join('');
}

function syncCompanySelects() {
  const options = buildOptions(state.companies, '_id', (company) => company.name, 'Select company');
  elements.globalCompanySelect.innerHTML = options;
  elements.employeeCompanySelect.innerHTML = options;
  elements.adminCompanySelect.innerHTML = options;

  if (state.selected.globalCompanyId) {
    elements.globalCompanySelect.value = state.selected.globalCompanyId;
  }
  if (state.selected.employeeCompanyId) {
    elements.employeeCompanySelect.value = state.selected.employeeCompanyId;
  }
  if (state.selected.adminCompanyId) {
    elements.adminCompanySelect.value = state.selected.adminCompanyId;
  }
}

function getUsersForCompany(companyId) {
  return state.usersByCompany.get(companyId) || [];
}

function syncUserSelects(companyId) {
  const users = getUsersForCompany(companyId);
  const options = buildOptions(users, '_id', (user) => `${user.name} | ${user.department || 'General'}`, 'Select user');
  elements.globalUserSelect.innerHTML = options;
  elements.employeeUserSelect.innerHTML = options;
  elements.resetUserSelect.innerHTML = options;

  const adminUserOptions =
    '<option value="">All users</option>' +
    users
      .map((user) => `<option value="${escapeHtml(user._id)}">${escapeHtml(`${user.name} | ${user.department || 'General'}`)}</option>` )
      .join('');
  elements.adminLogUserSelect.innerHTML = adminUserOptions;

  if (state.selected.globalUserId) {
    elements.globalUserSelect.value = state.selected.globalUserId;
  }
  if (state.selected.employeeUserId) {
    elements.employeeUserSelect.value = state.selected.employeeUserId;
  }
}

async function loadHealthAndDocs() {
  const [health, docs] = await Promise.all([apiFetch('/api/health'), apiFetch('/api/docs')]);

  elements.healthBadge.textContent = health.status;
  elements.healthStats.innerHTML = `
    <div><dt>Companies</dt><dd>${health.collections.companies}</dd></div>
    <div><dt>Users</dt><dd>${health.collections.users}</dd></div>
    <div><dt>Logs</dt><dd>${health.collections.time_logs}</dd></div>
    <div><dt>Corrections</dt><dd>${health.collections.time_corrections}</dd></div>
  `;
  elements.healthTimestamp.textContent = `Database: ${health.database} • ${formatDateTime(health.timestamp)}`;

  elements.docsDatabase.textContent = `MongoDB: ${docs.database.uri} • DB: ${docs.database.name}`;
  elements.docsEndpoints.innerHTML = docs.endpoints.map((endpoint) => `<li>${escapeHtml(endpoint)}</li>`).join('');
}

async function loadCompanies() {
  state.companies = await apiFetch('/api/companies');
  syncCompanySelects();

  const fallbackCompany = state.selected.globalCompanyId || state.companies[0]?._id || '';
  if (fallbackCompany) {
    state.selected.globalCompanyId = fallbackCompany;
    state.selected.employeeCompanyId = state.selected.employeeCompanyId || fallbackCompany;
    state.selected.adminCompanyId = state.selected.adminCompanyId || fallbackCompany;
    syncCompanySelects();
    await loadUsersForCompany(fallbackCompany, true);
  }
}

async function loadUsersForCompany(companyId, includeInactive = false) {
  if (!companyId) {
    syncUserSelects('');
    return [];
  }

  const query = includeInactive ? '?includeInactive=true' : '';
  const users = await apiFetch(`/api/companies/${companyId}/users${query}`);
  state.usersByCompany.set(companyId, users);
  syncUserSelects(companyId);

  if (!state.selected.globalUserId && users[0]) {
    state.selected.globalUserId = users[0]._id;
  }

  if (!state.selected.employeeUserId && users[0]) {
    state.selected.employeeUserId = users[0]._id;
  }

  syncUserSelects(companyId);
  persistState();
  return users;
}

function findCompany(companyId) {
  return state.companies.find((company) => company._id === companyId) || null;
}

function findUser(companyId, userId) {
  return getUsersForCompany(companyId).find((user) => user._id === userId) || null;
}

function updateSessionBadges() {
  const employee = state.sessions.employee;
  const kiosk = state.sessions.kiosk;
  const adminCompany = findCompany(state.selected.adminCompanyId);

  elements.employeeSessionBadge.textContent = employee ? `${employee.user.name} @ ${employee.company.name}` : 'Not signed in';
  elements.kioskSessionBadge.textContent = kiosk ? `${kiosk.user.name} @ ${kiosk.company.name}` : 'Awaiting PIN';
  elements.adminCompanyBadge.textContent = adminCompany ? adminCompany.name : 'No company selected';
}

function renderTable(target, columns, rows, emptyMessage) {
  if (!rows.length) {
    target.innerHTML = `<p class="meta">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const cells = columns.map((column) => `<td>${column.render(row)}</td>`).join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');

  target.innerHTML = `<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function populateCorrectionLogSelect(logs) {
  const options = ['<option value="">Auto-resolve from date or active log</option>'];
  for (const log of logs) {
    options.push(
      `<option value="${escapeHtml(log._id)}">${escapeHtml(`${log.date} • ${formatDuration(log.duration_minutes)} • ${log.status}`)}</option>`
    );
  }
  elements.correctionLogSelect.innerHTML = options.join('');
}

function populateEditLogSelect(logs) {
  const options = ['<option value="">Select time log</option>'];
  for (const log of logs) {
    options.push(
      `<option value="${escapeHtml(log._id)}">${escapeHtml(`${log.date} • ${log.user_id} • ${log.status}`)}</option>`
    );
  }
  elements.editLogSelect.innerHTML = options.join('');
}

function populateReviewSelect(corrections) {
  const options = ['<option value="">Select correction request</option>'];
  for (const request of corrections) {
    options.push(
      `<option value="${escapeHtml(request._id)}">${escapeHtml(`${request.status} • ${request.user_id} • ${request.reason}`)}</option>`
    );
  }
  elements.reviewCorrectionSelect.innerHTML = options.join('');
}

function renderEmployeeShiftStatus() {
  const activeLog = state.employeeLogs.find((log) => log.status === 'active' || log.punch_out === null);
  if (!state.selected.employeeUserId) {
    elements.employeeShiftStatus.innerHTML = '<p class="meta">Select an employee context to load shift data.</p>';
    return;
  }

  if (!activeLog) {
    elements.employeeShiftStatus.innerHTML = '<p class="meta">No active shift. Employee is currently clocked out.</p>';
    return;
  }

  elements.employeeShiftStatus.innerHTML = `
    <div>
      <strong>Active shift</strong>
      <p class="meta">Started ${escapeHtml(formatDateTime(activeLog.punch_in))}</p>
      <p class="meta">Method: ${escapeHtml(activeLog.punch_method || '—')} • Status: ${escapeHtml(activeLog.status)}</p>
      <p class="meta">Note: ${escapeHtml(activeLog.note || 'None')}</p>
    </div>
  `;
}

function renderEmployeeTables() {
  renderEmployeeShiftStatus();
  populateCorrectionLogSelect(state.employeeLogs);

  renderTable(
    elements.employeeLogsTable,
    [
      { label: 'Date', render: (row) => escapeHtml(row.date) },
      { label: 'Punch In', render: (row) => escapeHtml(formatDateTime(row.punch_in)) },
      { label: 'Punch Out', render: (row) => escapeHtml(formatDateTime(row.punch_out)) },
      { label: 'Status', render: (row) => escapeHtml(row.status) },
      { label: 'Method', render: (row) => escapeHtml(row.punch_method || '—') },
      { label: 'Duration', render: (row) => escapeHtml(formatDuration(row.duration_minutes)) }
    ],
    state.employeeLogs,
    'No time logs for the selected filters.'
  );

  renderTable(
    elements.employeeCorrectionsTable,
    [
      { label: 'Created', render: (row) => escapeHtml(formatDateTime(row.created_at)) },
      { label: 'Requested In', render: (row) => escapeHtml(formatDateTime(row.requested_punch_in)) },
      { label: 'Requested Out', render: (row) => escapeHtml(formatDateTime(row.requested_punch_out)) },
      { label: 'Status', render: (row) => escapeHtml(row.status) },
      { label: 'Reason', render: (row) => escapeHtml(row.reason) }
    ],
    state.employeeCorrections,
    'No correction requests yet.'
  );
}

function renderAdminViews() {
  const summary = state.dashboard?.summary || {};
  elements.dashboardSummary.innerHTML = `
    <div><dt>Employees</dt><dd>${summary.employees_total ?? '--'}</dd></div>
    <div><dt>Active Now</dt><dd>${summary.active_now ?? '--'}</dd></div>
    <div><dt>Pending Corrections</dt><dd>${summary.pending_corrections ?? '--'}</dd></div>
  `;

  renderTable(
    elements.dashboardEmployeesTable,
    [
      { label: 'Employee', render: (row) => escapeHtml(row.user.name) },
      { label: 'Department', render: (row) => escapeHtml(row.user.department || 'General') },
      { label: 'Role', render: (row) => escapeHtml(row.user.role || 'employee') },
      { label: 'Status', render: (row) => escapeHtml(row.current_status) },
      { label: 'Last In', render: (row) => escapeHtml(formatDateTime(row.last_punch_in)) },
      { label: 'Last Out', render: (row) => escapeHtml(formatDateTime(row.last_punch_out)) }
    ],
    state.dashboard?.employees || [],
    'No dashboard employees loaded.'
  );

  renderTable(
    elements.adminCorrectionsTable,
    [
      { label: 'Status', render: (row) => escapeHtml(row.status) },
      { label: 'User', render: (row) => escapeHtml(row.user_id) },
      { label: 'Reason', render: (row) => escapeHtml(row.reason) },
      { label: 'Requested In', render: (row) => escapeHtml(formatDateTime(row.requested_punch_in)) },
      { label: 'Requested Out', render: (row) => escapeHtml(formatDateTime(row.requested_punch_out)) }
    ],
    state.adminCorrections,
    'No correction requests for this company.'
  );

  renderTable(
    elements.adminLogsTable,
    [
      { label: 'Log Id', render: (row) => `<span class="mono">${escapeHtml(row._id)}</span>` },
      { label: 'User', render: (row) => escapeHtml(row.user_id) },
      { label: 'Date', render: (row) => escapeHtml(row.date) },
      { label: 'Status', render: (row) => escapeHtml(row.status) },
      { label: 'Duration', render: (row) => escapeHtml(formatDuration(row.duration_minutes)) },
      { label: 'Note', render: (row) => escapeHtml(row.note || '—') }
    ],
    state.adminLogs,
    'No time logs match the selected filters.'
  );

  populateReviewSelect(state.adminCorrections);
  populateEditLogSelect(state.adminLogs);
}

async function refreshEmployeeData() {
  const companyId = state.selected.employeeCompanyId;
  const userId = state.selected.employeeUserId;
  if (!companyId || !userId) {
    renderEmployeeTables();
    return;
  }

  const filters = new FormData(elements.employeeLogFiltersForm);
  const params = new URLSearchParams({
    company_id: companyId,
    user_id: userId
  });
  for (const [key, value] of filters.entries()) {
    if (value) {
      params.set(key, value);
    }
  }

  state.employeeLogs = await apiFetch(`/api/time-logs?${params.toString()}`);
  state.employeeCorrections = await apiFetch(`/api/time-corrections?company_id=${companyId}&user_id=${userId}`);
  renderEmployeeTables();
}

async function refreshAdminData() {
  const companyId = state.selected.adminCompanyId;
  if (!companyId) {
    return;
  }

  const includeInactive = elements.includeInactiveUsersCheckbox.checked;
  const [dashboard, users, corrections] = await Promise.all([
    apiFetch(`/api/admin/${companyId}/dashboard`),
    apiFetch(`/api/companies/${companyId}/users${includeInactive ? '?includeInactive=true' : ''}`),
    apiFetch(`/api/time-corrections?company_id=${companyId}`)
  ]);

  state.dashboard = dashboard;
  state.adminUsers = users;
  state.usersByCompany.set(companyId, users);
  syncUserSelects(companyId);
  state.adminCorrections = corrections;
  elements.resetUserSelect.innerHTML = buildOptions(
    users,
    '_id',
    (user) => `${user.name} • ${user.department || 'General'}`,
    'Select user'
  );
  elements.adminLogUserSelect.innerHTML =
    '<option value="">All users</option>' +
    users.map((user) => `<option value="${escapeHtml(user._id)}">${escapeHtml(user.name)}</option>`).join('');

  await loadAdminLogs();
  updateReportLink();
  renderAdminViews();
}

async function loadAdminLogs() {
  const companyId = state.selected.adminCompanyId;
  if (!companyId) {
    state.adminLogs = [];
    renderAdminViews();
    return;
  }

  const filters = new FormData(elements.adminLogsFilterForm);
  const params = new URLSearchParams({ company_id: companyId });
  for (const [key, value] of filters.entries()) {
    if (value) {
      params.set(key, value);
    }
  }

  state.adminLogs = await apiFetch(`/api/time-logs?${params.toString()}`);
  renderAdminViews();
}

function updateReportLink() {
  const companyId = state.selected.adminCompanyId;
  if (!companyId) {
    elements.reportDownloadLink.href = '#';
    elements.reportLinkPreview.textContent = 'Pick a company and range to prepare the report URL.';
    return;
  }

  const formData = new FormData(elements.reportForm);
  const params = new URLSearchParams();
  for (const [key, value] of formData.entries()) {
    if (value) {
      params.set(key, value);
    }
  }

  const href = `/api/reports/${companyId}/time-logs.csv${params.toString() ? `?${params}` : ''}`;
  elements.reportDownloadLink.href = href;
  elements.reportLinkPreview.textContent = href;
}

function handleEditLogSelection() {
  const logId = elements.editLogSelect.value;
  const log = state.adminLogs.find((entry) => entry._id === logId);
  if (!log) {
    elements.editLogForm.reset();
    return;
  }

  elements.editLogForm.elements.namedItem('punch_in').value = toLocalDateTimeInput(log.punch_in);
  elements.editLogForm.elements.namedItem('punch_out').value = toLocalDateTimeInput(log.punch_out);
  elements.editLogForm.elements.namedItem('status').value = '';
  elements.editLogForm.elements.namedItem('note').value = log.note || '';
}

async function initialize() {
  restoreState();
  bindEvents();
  await Promise.all([loadHealthAndDocs(), loadCompanies()]);

  if (state.selected.employeeCompanyId) {
    await loadUsersForCompany(state.selected.employeeCompanyId, true);
  }

  elements.globalCompanySelect.value = state.selected.globalCompanyId || '';
  elements.employeeCompanySelect.value = state.selected.employeeCompanyId || state.selected.globalCompanyId || '';
  elements.adminCompanySelect.value = state.selected.adminCompanyId || state.selected.globalCompanyId || '';

  if (!state.selected.employeeCompanyId && elements.employeeCompanySelect.value) {
    state.selected.employeeCompanyId = elements.employeeCompanySelect.value;
  }
  if (!state.selected.adminCompanyId && elements.adminCompanySelect.value) {
    state.selected.adminCompanyId = elements.adminCompanySelect.value;
  }

  if (state.selected.globalCompanyId) {
    await loadUsersForCompany(state.selected.globalCompanyId, true);
  }

  updateSessionBadges();
  await refreshEmployeeData();
  await refreshAdminData();
  updateReportLink();
  renderEmployeeTables();
  renderAdminViews();
}

function bindEvents() {
  elements.refreshOverviewButton.addEventListener('click', async () => {
    try {
      await loadHealthAndDocs();
      showToast('Overview data refreshed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.globalCompanySelect.addEventListener('change', async (event) => {
    state.selected.globalCompanyId = event.target.value;
    state.selected.globalUserId = '';
    if (event.target.value) {
      await loadUsersForCompany(event.target.value, true);
    } else {
      syncUserSelects('');
    }
    persistState();
  });

  elements.globalUserSelect.addEventListener('change', (event) => {
    state.selected.globalUserId = event.target.value;
    persistState();
  });

  elements.employeeCompanySelect.addEventListener('change', async (event) => {
    state.selected.employeeCompanyId = event.target.value;
    state.selected.employeeUserId = '';
    if (event.target.value) {
      await loadUsersForCompany(event.target.value, true);
    }
    persistState();
  });

  elements.employeeUserSelect.addEventListener('change', (event) => {
    state.selected.employeeUserId = event.target.value;
    persistState();
  });

  elements.employeeContextForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.selected.employeeCompanyId = elements.employeeCompanySelect.value;
    state.selected.employeeUserId = elements.employeeUserSelect.value;
    persistState();
    await refreshEmployeeData();
    updateSessionBadges();
    showToast('Employee context updated.', 'success');
  });

  elements.employeeLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = getJsonBody(elements.employeeLoginForm);
      const data = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.sessions.employee = data;
      state.selected.employeeCompanyId = data.company._id;
      state.selected.employeeUserId = data.user._id;
      await loadUsersForCompany(data.company._id, true);
      elements.employeeCompanySelect.value = data.company._id;
      elements.employeeUserSelect.value = data.user._id;
      updateSessionBadges();
      persistState();
      await refreshEmployeeData();
      showToast('Employee login successful.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.punchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = event.submitter?.value || 'in';
    const companyId = state.selected.employeeCompanyId;
    const userId = state.selected.employeeUserId;
    if (!companyId || !userId) {
      showToast('Pick an employee context first.', 'error');
      return;
    }

    try {
      const payload = getJsonBody(elements.punchForm);
      payload.company_id = companyId;
      payload.user_id = userId;
      const endpoint = action === 'out' ? '/api/time-logs/punch-out' : '/api/time-logs/punch-in';
      await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      await refreshEmployeeData();
      showToast(action === 'out' ? 'Punch out recorded.' : 'Punch in recorded.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.employeeLogFiltersForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await refreshEmployeeData();
      showToast('Employee logs refreshed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.refreshEmployeeDataButton.addEventListener('click', async () => {
    try {
      await refreshEmployeeData();
      showToast('Employee data refreshed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.correctionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const companyId = state.selected.employeeCompanyId;
    const userId = state.selected.employeeUserId;
    if (!companyId || !userId) {
      showToast('Pick an employee context first.', 'error');
      return;
    }

    try {
      const payload = getJsonBody(elements.correctionForm);
      payload.company_id = companyId;
      payload.user_id = userId;
      if (!payload.time_log_id) {
        delete payload.time_log_id;
      }
      if (payload.requested_punch_in) {
        payload.requested_punch_in = toIsoFromInput(payload.requested_punch_in);
      } else {
        delete payload.requested_punch_in;
      }
      if (payload.requested_punch_out) {
        payload.requested_punch_out = toIsoFromInput(payload.requested_punch_out);
      } else {
        delete payload.requested_punch_out;
      }

      await apiFetch('/api/time-corrections', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      elements.correctionForm.reset();
      await refreshEmployeeData();
      showToast('Correction request created.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.kioskLoginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = getJsonBody(elements.kioskLoginForm);
      const data = await apiFetch('/api/auth/kiosk-login', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      state.sessions.kiosk = data;
      updateSessionBadges();
      elements.kioskStatus.innerHTML = `<p class="meta">Ready for ${escapeHtml(data.user.name)} at ${escapeHtml(data.company.name)}.</p>`;
      persistState();
      showToast('Kiosk login successful.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.kioskPunchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const action = event.submitter?.value || 'in';
    const session = state.sessions.kiosk;
    if (!session) {
      showToast('Authenticate in kiosk mode first.', 'error');
      return;
    }

    try {
      const payload = getJsonBody(elements.kioskPunchForm);
      payload.company_id = session.company._id;
      payload.user_id = session.user._id;
      payload.punch_method = 'KIOSK';
      const endpoint = action === 'out' ? '/api/time-logs/punch-out' : '/api/time-logs/punch-in';
      const response = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      elements.kioskStatus.innerHTML = `
        <p class="meta">${escapeHtml(action === 'out' ? 'Punch out recorded' : 'Punch in recorded')} for ${escapeHtml(session.user.name)}.</p>
        <p class="meta">${escapeHtml(formatDateTime(action === 'out' ? response.punch_out : response.punch_in))}</p>
      `;
      showToast('Kiosk action completed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.adminCompanySelect.addEventListener('change', (event) => {
    state.selected.adminCompanyId = event.target.value;
    persistState();
    updateSessionBadges();
    updateReportLink();
  });

  elements.adminCompanyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      state.selected.adminCompanyId = elements.adminCompanySelect.value;
      persistState();
      updateSessionBadges();
      await refreshAdminData();
      showToast('Admin workspace loaded.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.refreshAdminButton.addEventListener('click', async () => {
    try {
      await refreshAdminData();
      showToast('Admin data refreshed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.addUserForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.selected.adminCompanyId) {
      showToast('Load an admin company first.', 'error');
      return;
    }

    try {
      const payload = getJsonBody(elements.addUserForm);
      await apiFetch(`/api/companies/${state.selected.adminCompanyId}/users`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      elements.addUserForm.reset();
      await refreshAdminData();
      showToast('Employee created.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.resetCredentialsForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = getJsonBody(elements.resetCredentialsForm);
      const userId = payload.user_id;
      delete payload.user_id;
      if (!payload.password) {
        delete payload.password;
      }
      if (!payload.pin) {
        delete payload.pin;
      }
      await apiFetch(`/api/users/${userId}/reset-credentials`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      elements.resetCredentialsForm.reset();
      await refreshAdminData();
      showToast('Credentials updated.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.reviewCorrectionForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = getJsonBody(elements.reviewCorrectionForm);
      const requestId = payload.request_id;
      delete payload.request_id;
      await apiFetch(`/api/time-corrections/${requestId}/review`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await refreshAdminData();
      showToast('Correction reviewed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.adminLogsFilterForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await loadAdminLogs();
      showToast('Admin logs refreshed.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.editLogSelect.addEventListener('change', handleEditLogSelection);

  elements.editLogForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const payload = getJsonBody(elements.editLogForm);
      const logId = payload.log_id;
      delete payload.log_id;
      if (payload.punch_in) {
        payload.punch_in = toIsoFromInput(payload.punch_in);
      } else {
        delete payload.punch_in;
      }
      if (payload.punch_out) {
        payload.punch_out = toIsoFromInput(payload.punch_out);
      } else {
        payload.punch_out = null;
      }
      if (!payload.status) {
        delete payload.status;
      }
      await apiFetch(`/api/time-logs/${logId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      await loadAdminLogs();
      showToast('Time log updated.', 'success');
    } catch (error) {
      showToast(error.message, 'error');
    }
  });

  elements.reportForm.addEventListener('submit', (event) => {
    event.preventDefault();
    updateReportLink();
    showToast('CSV link prepared.', 'success');
  });
}

initialize().catch((error) => {
  console.error(error);
  showToast(error.message || 'Failed to initialize UI.', 'error');
});
