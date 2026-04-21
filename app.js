const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const path = require('path');
const { ObjectId } = require('mongodb');
const { getCollections } = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const VALID_LOG_STATUSES = new Set(['active', 'approved', 'rejected']);
const VALID_REVIEW_STATUSES = new Set(['approved', 'rejected']);

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(isoString) {
  return new Date(isoString).toISOString().slice(0, 10);
}

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function toApiId(value) {
  if (value === null || value === undefined) {
    return value;
  }

  return String(value);
}

function buildIdVariants(value) {
  const stringValue = String(value);
  const variants = [stringValue];

  if (ObjectId.isValid(stringValue)) {
    variants.push(new ObjectId(stringValue));
  }

  return variants;
}

function buildIdFilter(field, value) {
  const variants = buildIdVariants(value);
  if (variants.length === 1) {
    return { [field]: variants[0] };
  }

  return { [field]: { $in: variants } };
}

function idsEqual(left, right) {
  return String(left) === String(right);
}

function hashLegacySecret(value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest('hex');
  return `sha256:${digest}`;
}

async function hashSecret(value) {
  return bcrypt.hash(String(value), 12);
}

async function verifySecret(plainText, storedHash) {
  if (!storedHash) {
    return false;
  }

  if (storedHash.startsWith('sha256:')) {
    return hashLegacySecret(plainText) === storedHash;
  }

  if (storedHash.startsWith('$2')) {
    try {
      return await bcrypt.compare(String(plainText), storedHash);
    } catch (_error) {
      return false;
    }
  }

  return false;
}

function parseTimestamp(value, fieldName) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const error = new Error(`Invalid timestamp in field "${fieldName}"`);
    error.status = 400;
    throw error;
  }

  return date.toISOString();
}

function calculateDurationMinutes(punchInIso, punchOutIso) {
  if (!punchInIso || !punchOutIso) {
    return 0;
  }

  const startMs = new Date(punchInIso).getTime();
  const endMs = new Date(punchOutIso).getTime();
  const diff = Math.floor((endMs - startMs) / 60000);

  if (diff < 0) {
    const error = new Error('punch_out must be after punch_in');
    error.status = 400;
    throw error;
  }

  return diff;
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === '');
  if (missing.length > 0) {
    const error = new Error(`Missing required field(s): ${missing.join(', ')}`);
    error.status = 400;
    throw error;
  }
}

function validateDateOnly(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const error = new Error(`Invalid ${fieldName}. Use YYYY-MM-DD format.`);
    error.status = 400;
    throw error;
  }
}

function escapeCsvValue(value) {
  const stringValue = value === null || value === undefined ? '' : String(value);
  const escaped = stringValue.replaceAll('"', '""');
  return `"${escaped}"`;
}

function toApiTimestamp(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function normalizeCompany(company) {
  if (!company) {
    return null;
  }

  return {
    ...company,
    _id: toApiId(company._id),
    organization_code: company.organization_code ?? null,
    settings: company.settings || {},
    created_at: toApiTimestamp(company.created_at)
  };
}

function normalizeUser(user) {
  if (!user) {
    return null;
  }

  return {
    ...user,
    _id: toApiId(user._id),
    company_id: toApiId(user.company_id),
    department: user.department ?? 'General',
    is_active: user.is_active ?? true,
    created_at: toApiTimestamp(user.created_at)
  };
}

function normalizeTimeLog(log) {
  if (!log) {
    return null;
  }

  return {
    ...log,
    _id: toApiId(log._id),
    company_id: toApiId(log.company_id),
    user_id: toApiId(log.user_id),
    punch_in: toApiTimestamp(log.punch_in),
    punch_out: toApiTimestamp(log.punch_out),
    note: log.note ?? '',
    created_at: toApiTimestamp(log.created_at ?? log.punch_in ?? null),
    updated_at: toApiTimestamp(log.updated_at ?? log.punch_out ?? log.punch_in ?? null)
  };
}

function normalizeTimeCorrection(request) {
  if (!request) {
    return null;
  }

  return {
    ...request,
    _id: toApiId(request._id),
    company_id: toApiId(request.company_id),
    user_id: toApiId(request.user_id),
    time_log_id: request.time_log_id ? toApiId(request.time_log_id) : null,
    requested_punch_in: toApiTimestamp(request.requested_punch_in ?? null),
    requested_punch_out: toApiTimestamp(request.requested_punch_out ?? null),
    admin_comment: request.admin_comment ?? '',
    reviewed_by: request.reviewed_by ?? null,
    created_at: toApiTimestamp(request.created_at),
    updated_at: toApiTimestamp(request.updated_at)
  };
}

function sanitizeCompany(company) {
  const safeCompany = normalizeCompany(company);
  if (!safeCompany) {
    return null;
  }

  const { admin_password_hash: _adminPasswordHash, ...safe } = safeCompany;
  return safe;
}

function sanitizeUser(user) {
  const safeUser = normalizeUser(user);
  if (!safeUser) {
    return null;
  }

  const { password_hash: _passwordHash, pin_hash: _pinHash, ...safe } = safeUser;
  return safe;
}

async function findCompanyById(companyId) {
  const { companies } = getCollections();
  return companies.findOne(buildIdFilter('_id', companyId));
}

async function findCompanyByCode(organizationCode) {
  const { companies } = getCollections();
  return companies.findOne({ organization_code: organizationCode });
}

async function findUserById(userId) {
  const { users } = getCollections();
  return users.findOne(buildIdFilter('_id', userId));
}

async function findActiveLog(companyId, userId) {
  const { timeLogs } = getCollections();
  return timeLogs.findOne({
    ...buildIdFilter('company_id', companyId),
    ...buildIdFilter('user_id', userId),
    punch_out: null
  });
}

async function resolveCorrectionTargetLog({ companyId, userId, requestedPunchIn, requestedPunchOut }) {
  const { timeLogs } = getCollections();

  const activeLog = await findActiveLog(companyId, userId);
  if (activeLog) {
    return activeLog;
  }

  const referenceTimestamp = requestedPunchIn || requestedPunchOut;
  if (!referenceTimestamp) {
    const error = new Error(
      'Provide time_log_id, or include requested_punch_in/requested_punch_out so the API can identify the target time log.'
    );
    error.status = 400;
    throw error;
  }

  const matchingLogs = await timeLogs
    .find({
      ...buildIdFilter('company_id', companyId),
      ...buildIdFilter('user_id', userId),
      date: toDateOnly(referenceTimestamp)
    })
    .sort({ punch_in: -1 })
    .toArray();

  if (matchingLogs.length === 0) {
    const error = new Error('No time log found for the requested correction date');
    error.status = 404;
    throw error;
  }

  if (matchingLogs.length > 1) {
    const error = new Error('Multiple time logs found for that date. Provide time_log_id explicitly.');
    error.status = 409;
    throw error;
  }

  return matchingLogs[0];
}

async function requireCompanyAndUser(companyId, userId) {
  const [company, user] = await Promise.all([findCompanyById(companyId), findUserById(userId)]);

  if (!company) {
    const error = new Error('Company not found');
    error.status = 404;
    throw error;
  }

  if (!user || !idsEqual(user.company_id, companyId)) {
    const error = new Error('User not found in this company');
    error.status = 404;
    throw error;
  }

  return {
    company,
    user
  };
}

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', async (_req, res) => {
  const { companies, users, timeLogs, timeCorrections } = getCollections();
  const [companyCount, userCount, timeLogCount, correctionCount] = await Promise.all([
    companies.countDocuments(),
    users.countDocuments(),
    timeLogs.countDocuments(),
    timeCorrections.countDocuments()
  ]);

  res.json({
    status: 'ok',
    service: 'web-time-tracker-api',
    database: 'WebTimeTrackerDB',
    collections: {
      companies: companyCount,
      users: userCount,
      time_logs: timeLogCount,
      time_corrections: correctionCount
    },
    timestamp: nowIso()
  });
});

app.get('/api/docs', async (_req, res) => {
  const { companies } = getCollections();
  const liveCompanies = (await companies.find({}, { projection: { _id: 1, name: 1, organization_code: 1 } }).toArray()).map(
    (company) => ({
      _id: toApiId(company._id),
      name: company.name,
      organization_code: company.organization_code ?? null
    })
  );

  res.json({
    title: 'REST API - Web Time Tracker',
    basePath: '/api',
    database: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017',
      name: process.env.MONGODB_DB_NAME || 'WebTimeTrackerDB'
    },
    notes: [
      'This API is backed by MongoDB.',
      'Login results depend on the hashes stored in the database.',
      'Kiosk login requires organization_code to exist on a company document.'
    ],
    companies: liveCompanies,
    endpoints: [
      'POST /api/auth/login',
      'POST /api/auth/kiosk-login',
      'GET /api/companies',
      'GET /api/companies/:companyId/users',
      'POST /api/companies/:companyId/users',
      'PATCH /api/users/:userId/reset-credentials',
      'GET /api/time-logs',
      'POST /api/time-logs/punch-in',
      'POST /api/time-logs/punch-out',
      'PATCH /api/time-logs/:logId',
      'POST /api/time-corrections',
      'GET /api/time-corrections',
      'PATCH /api/time-corrections/:requestId/review',
      'GET /api/admin/:companyId/dashboard',
      'GET /api/reports/:companyId/time-logs.csv'
    ]
  });
});

app.post('/api/auth/login', async (req, res) => {
  requireFields(req.body, ['email', 'password']);

  const { users } = getCollections();
  const email = String(req.body.email).toLowerCase().trim();
  const password = String(req.body.password);

  const user = await users.findOne({ email, is_active: true });
  if (!user || !(await verifySecret(password, user.password_hash))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const company = await findCompanyById(user.company_id);
  return res.json({
    message: 'Login successful',
    user: sanitizeUser(user),
    company: sanitizeCompany(company)
  });
});

app.post('/api/auth/kiosk-login', async (req, res) => {
  requireFields(req.body, ['organization_code', 'pin']);

  const { users } = getCollections();
  const organizationCode = String(req.body.organization_code).trim();
  const pin = String(req.body.pin);

  const company = await findCompanyByCode(organizationCode);
  if (!company) {
    return res.status(401).json({ message: 'Invalid organization code or pin' });
  }

  const companyUsers = await users.find({ company_id: company._id, is_active: true }).toArray();
  let matchedUser = null;

  for (const user of companyUsers) {
    if (await verifySecret(pin, user.pin_hash)) {
      matchedUser = user;
      break;
    }
  }

  if (!matchedUser) {
    return res.status(401).json({ message: 'Invalid organization code or pin' });
  }

  return res.json({
    message: 'Kiosk authentication successful',
    user: sanitizeUser(matchedUser),
    company: sanitizeCompany(company)
  });
});

app.get('/api/companies', async (_req, res) => {
  const { companies } = getCollections();
  const items = await companies.find({}).sort({ name: 1 }).toArray();
  res.json(items.map(sanitizeCompany));
});

app.get('/api/companies/:companyId/users', async (req, res) => {
  const company = await findCompanyById(req.params.companyId);
  if (!company) {
    return res.status(404).json({ message: 'Company not found' });
  }

  const { users } = getCollections();
  const includeInactive = String(req.query.includeInactive || 'false').toLowerCase() === 'true';
  const filter = { company_id: company._id };

  if (!includeInactive) {
    filter.is_active = true;
  }

  const items = await users.find(filter).sort({ name: 1 }).toArray();
  return res.json(items.map(sanitizeUser));
});

app.post('/api/companies/:companyId/users', async (req, res) => {
  const { users } = getCollections();
  const company = await findCompanyById(req.params.companyId);
  if (!company) {
    return res.status(404).json({ message: 'Company not found' });
  }

  requireFields(req.body, ['name', 'email', 'password', 'pin']);

  const email = String(req.body.email).toLowerCase().trim();
  const existingUser = await users.findOne({ email });
  if (existingUser) {
    return res.status(409).json({ message: 'A user with this email already exists' });
  }

  const user = {
    _id: new ObjectId(generateId()),
    company_id: company._id,
    name: String(req.body.name).trim(),
    email,
    password_hash: await hashSecret(req.body.password),
    pin_hash: await hashSecret(req.body.pin),
    role: req.body.role ? String(req.body.role).trim() : 'employee',
    department: req.body.department ? String(req.body.department).trim() : 'General',
    is_active: true,
    created_at: nowIso()
  };

  await users.insertOne(user);
  return res.status(201).json(sanitizeUser(user));
});

app.patch('/api/users/:userId/reset-credentials', async (req, res) => {
  const { users } = getCollections();
  const user = await findUserById(req.params.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const updates = {};
  if (req.body.password !== undefined) {
    updates.password_hash = await hashSecret(req.body.password);
  }
  if (req.body.pin !== undefined) {
    updates.pin_hash = await hashSecret(req.body.pin);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ message: 'Provide at least one field: password or pin' });
  }

  await users.updateOne({ _id: user._id }, { $set: updates });
  const updatedUser = {
    ...user,
    ...updates
  };

  return res.json({ message: 'Credentials updated', user: sanitizeUser(updatedUser) });
});

app.get('/api/time-logs', async (req, res) => {
  const { timeLogs } = getCollections();
  const filter = {};

  if (req.query.company_id) {
    Object.assign(filter, buildIdFilter('company_id', req.query.company_id));
  }

  if (req.query.user_id) {
    Object.assign(filter, buildIdFilter('user_id', req.query.user_id));
  }

  if (req.query.status) {
    filter.status = String(req.query.status);
  }

  if (req.query.from) {
    validateDateOnly(req.query.from, 'from');
    filter.date = { ...(filter.date || {}), $gte: req.query.from };
  }

  if (req.query.to) {
    validateDateOnly(req.query.to, 'to');
    filter.date = { ...(filter.date || {}), $lte: req.query.to };
  }

  const logs = await timeLogs.find(filter).sort({ punch_in: -1 }).toArray();
  return res.json(logs.map(normalizeTimeLog));
});

app.post('/api/time-logs/punch-in', async (req, res) => {
  const { timeLogs } = getCollections();

  requireFields(req.body, ['company_id', 'user_id']);

  const companyId = String(req.body.company_id);
  const userId = String(req.body.user_id);
  const note = req.body.note ? String(req.body.note).trim() : '';
  const punchMethod = req.body.punch_method ? String(req.body.punch_method).trim() : 'WEB_PORTAL';

  const { company, user } = await requireCompanyAndUser(companyId, userId);

  const existing = await findActiveLog(companyId, userId);
  if (existing) {
    return res.status(409).json({
      message: 'This user already has an active shift',
      active_log_id: toApiId(existing._id)
    });
  }

  const punchIn = nowIso();
  const log = {
    _id: new ObjectId(generateId()),
    company_id: company._id,
    user_id: user._id,
    date: toDateOnly(punchIn),
    punch_in: punchIn,
    punch_out: null,
    duration_minutes: 0,
    punch_method: punchMethod,
    status: 'active',
    note,
    created_at: punchIn,
    updated_at: punchIn
  };

  await timeLogs.insertOne(log);
  return res.status(201).json(normalizeTimeLog(log));
});

app.post('/api/time-logs/punch-out', async (req, res) => {
  const { timeLogs } = getCollections();

  requireFields(req.body, ['company_id', 'user_id']);

  const companyId = String(req.body.company_id);
  const userId = String(req.body.user_id);
  const note = req.body.note ? String(req.body.note).trim() : '';

  await requireCompanyAndUser(companyId, userId);

  const activeLog = await findActiveLog(companyId, userId);
  if (!activeLog) {
    return res.status(404).json({ message: 'Active shift not found' });
  }

  const punchOut = nowIso();
  const updatedLog = {
    ...activeLog,
    punch_out: punchOut,
    duration_minutes: calculateDurationMinutes(activeLog.punch_in, punchOut),
    status: 'approved',
    note: note ? (activeLog.note ? `${activeLog.note} | ${note}` : note) : activeLog.note ?? '',
    created_at: activeLog.created_at ?? activeLog.punch_in ?? punchOut,
    updated_at: punchOut
  };

  await timeLogs.updateOne({ _id: activeLog._id }, { $set: updatedLog });
  return res.json(normalizeTimeLog(updatedLog));
});

app.patch('/api/time-logs/:logId', async (req, res) => {
  const { timeLogs } = getCollections();
  const log = await timeLogs.findOne(buildIdFilter('_id', req.params.logId));
  if (!log) {
    return res.status(404).json({ message: 'Time log not found' });
  }

  const nextLog = {
    ...log,
    created_at: log.created_at ?? log.punch_in ?? null
  };

  if (req.body.punch_in !== undefined) {
    nextLog.punch_in = parseTimestamp(req.body.punch_in, 'punch_in');
    nextLog.date = toDateOnly(nextLog.punch_in);
  }

  if (req.body.punch_out !== undefined) {
    nextLog.punch_out = req.body.punch_out === null ? null : parseTimestamp(req.body.punch_out, 'punch_out');
  }

  if (req.body.note !== undefined) {
    nextLog.note = String(req.body.note);
  }

  if (req.body.status !== undefined) {
    const status = String(req.body.status);
    if (!VALID_LOG_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Invalid status value for time log' });
    }

    nextLog.status = status;
  }

  nextLog.duration_minutes = calculateDurationMinutes(nextLog.punch_in, nextLog.punch_out);

  if (nextLog.punch_out === null) {
    nextLog.status = 'active';
  } else if (nextLog.status === 'active') {
    nextLog.status = 'approved';
  }

  nextLog.updated_at = nowIso();

  await timeLogs.updateOne({ _id: log._id }, { $set: nextLog });
  return res.json(normalizeTimeLog(nextLog));
});

app.post('/api/time-corrections', async (req, res) => {
  const { timeCorrections, timeLogs } = getCollections();

  requireFields(req.body, ['company_id', 'user_id', 'reason']);

  const companyId = String(req.body.company_id);
  const userId = String(req.body.user_id);
  const { company, user } = await requireCompanyAndUser(companyId, userId);

  let requestedPunchIn = null;
  let requestedPunchOut = null;

  if (req.body.requested_punch_in !== undefined && req.body.requested_punch_in !== null) {
    requestedPunchIn = parseTimestamp(req.body.requested_punch_in, 'requested_punch_in');
  }

  if (req.body.requested_punch_out !== undefined && req.body.requested_punch_out !== null) {
    requestedPunchOut = parseTimestamp(req.body.requested_punch_out, 'requested_punch_out');
  }

  if (requestedPunchIn && requestedPunchOut) {
    calculateDurationMinutes(requestedPunchIn, requestedPunchOut);
  }

  const timeLogId = req.body.time_log_id ? String(req.body.time_log_id) : null;
  let linkedTimeLogId = null;
  if (timeLogId) {
    const linkedLog = await timeLogs.findOne({
      ...buildIdFilter('_id', timeLogId),
      ...buildIdFilter('user_id', userId),
      ...buildIdFilter('company_id', companyId)
    });
    if (!linkedLog) {
      return res.status(404).json({ message: 'Linked time log not found for this user/company' });
    }

    linkedTimeLogId = linkedLog._id;
  } else {
    const resolvedLog = await resolveCorrectionTargetLog({
      companyId,
      userId,
      requestedPunchIn,
      requestedPunchOut
    });
    linkedTimeLogId = resolvedLog._id;
  }

  const timestamp = nowIso();
  const request = {
    _id: new ObjectId(generateId()),
    company_id: company._id,
    user_id: user._id,
    time_log_id: linkedTimeLogId,
    requested_punch_in: requestedPunchIn,
    requested_punch_out: requestedPunchOut,
    reason: String(req.body.reason).trim(),
    status: 'pending',
    admin_comment: '',
    reviewed_by: null,
    created_at: timestamp,
    updated_at: timestamp
  };

  await timeCorrections.insertOne(request);
  return res.status(201).json(normalizeTimeCorrection(request));
});

app.get('/api/time-corrections', async (req, res) => {
  const { timeCorrections } = getCollections();
  const filter = {};

  if (req.query.company_id) {
    Object.assign(filter, buildIdFilter('company_id', req.query.company_id));
  }

  if (req.query.user_id) {
    Object.assign(filter, buildIdFilter('user_id', req.query.user_id));
  }

  if (req.query.status) {
    filter.status = String(req.query.status);
  }

  const requests = await timeCorrections.find(filter).sort({ created_at: -1 }).toArray();
  res.json(requests.map(normalizeTimeCorrection));
});

app.patch('/api/time-corrections/:requestId/review', async (req, res) => {
  const { timeCorrections, timeLogs } = getCollections();

  requireFields(req.body, ['status']);

  const reviewStatus = String(req.body.status);
  if (!VALID_REVIEW_STATUSES.has(reviewStatus)) {
    return res.status(400).json({ message: 'Invalid review status. Use "approved" or "rejected".' });
  }

  const request = await timeCorrections.findOne(buildIdFilter('_id', req.params.requestId));
  if (!request) {
    return res.status(404).json({ message: 'Correction request not found' });
  }

  if (reviewStatus === 'approved' && request.time_log_id) {
    const targetLog = await timeLogs.findOne(buildIdFilter('_id', request.time_log_id));
    if (!targetLog) {
      return res.status(404).json({ message: 'Linked time log not found while approving request' });
    }

    const updatedLog = {
      ...targetLog,
      created_at: targetLog.created_at ?? targetLog.punch_in ?? null
    };

    if (request.requested_punch_in) {
      updatedLog.punch_in = request.requested_punch_in;
      updatedLog.date = toDateOnly(updatedLog.punch_in);
    }

    if (request.requested_punch_out !== null && request.requested_punch_out !== undefined) {
      updatedLog.punch_out = request.requested_punch_out;
    }

    updatedLog.duration_minutes = calculateDurationMinutes(updatedLog.punch_in, updatedLog.punch_out);
    updatedLog.status = updatedLog.punch_out ? 'approved' : 'active';
    updatedLog.updated_at = nowIso();

    await timeLogs.updateOne({ _id: updatedLog._id }, { $set: updatedLog });
  }

  const updatedRequest = {
    ...request,
    status: reviewStatus,
    reviewed_by: req.body.reviewed_by ? String(req.body.reviewed_by) : null,
    admin_comment: req.body.admin_comment ? String(req.body.admin_comment).trim() : '',
    updated_at: nowIso()
  };

  await timeCorrections.updateOne({ _id: request._id }, { $set: updatedRequest });
  return res.json(normalizeTimeCorrection(updatedRequest));
});

app.get('/api/admin/:companyId/dashboard', async (req, res) => {
  const { users, timeLogs, timeCorrections } = getCollections();
  const companyId = req.params.companyId;
  const company = await findCompanyById(companyId);
  if (!company) {
    return res.status(404).json({ message: 'Company not found' });
  }

  const [companyUsers, pendingCorrections, companyLogs] = await Promise.all([
    users.find({ ...buildIdFilter('company_id', companyId), is_active: true }).sort({ name: 1 }).toArray(),
    timeCorrections.find({ ...buildIdFilter('company_id', companyId), status: 'pending' }).sort({ created_at: -1 }).toArray(),
    timeLogs.find(buildIdFilter('company_id', companyId)).sort({ punch_in: -1 }).toArray()
  ]);

  const logsByUser = new Map();
  for (const log of companyLogs) {
    const userKey = toApiId(log.user_id);
    if (!logsByUser.has(userKey)) {
      logsByUser.set(userKey, []);
    }

    logsByUser.get(userKey).push(log);
  }

  const employees = companyUsers.map((user) => {
    const userLogs = logsByUser.get(toApiId(user._id)) || [];
    const activeLog = userLogs.find((log) => log.punch_out === null) || null;
    const lastLog = userLogs[0] || null;

    return {
      user: sanitizeUser(user),
      current_status: activeLog ? 'active' : 'offline',
      last_punch_in: lastLog ? lastLog.punch_in : null,
      last_punch_out: lastLog ? lastLog.punch_out ?? null : null,
      active_log_id: activeLog ? toApiId(activeLog._id) : null
    };
  });

  return res.json({
    generated_at: nowIso(),
    company: sanitizeCompany(company),
    summary: {
      employees_total: companyUsers.length,
      active_now: employees.filter((entry) => entry.current_status === 'active').length,
      pending_corrections: pendingCorrections.length
    },
    employees,
    pending_corrections: pendingCorrections.map(normalizeTimeCorrection)
  });
});

app.get('/api/reports/:companyId/time-logs.csv', async (req, res) => {
  const { users, timeLogs } = getCollections();
  const companyId = req.params.companyId;
  const company = await findCompanyById(companyId);
  if (!company) {
    return res.status(404).json({ message: 'Company not found' });
  }

  const filter = buildIdFilter('company_id', companyId);
  if (req.query.from) {
    validateDateOnly(req.query.from, 'from');
    filter.date = { ...(filter.date || {}), $gte: req.query.from };
  }

  if (req.query.to) {
    validateDateOnly(req.query.to, 'to');
    filter.date = { ...(filter.date || {}), $lte: req.query.to };
  }

  const [companyUsers, logs] = await Promise.all([
    users.find(buildIdFilter('company_id', companyId)).sort({ name: 1 }).toArray(),
    timeLogs.find(filter).sort({ date: 1, user_id: 1 }).toArray()
  ]);

  const totalsByUserId = new Map();
  for (const entry of logs) {
    const log = normalizeTimeLog(entry);
    if (log.status === 'rejected') {
      continue;
    }

    const userId = log.user_id;
    const current = totalsByUserId.get(userId) || {
      shifts_count: 0,
      total_minutes_worked: 0
    };

    current.shifts_count += 1;
    current.total_minutes_worked += Number(log.duration_minutes) || 0;
    totalsByUserId.set(userId, current);
  }

  const header = [
    'company_id',
    'user_id',
    'employee_name',
    'department',
    'shifts_count',
    'total_minutes_worked',
    'total_hours_worked'
  ];

  const rows = companyUsers.map((entry) => {
    const user = normalizeUser(entry);
    const totals = totalsByUserId.get(user._id) || {
      shifts_count: 0,
      total_minutes_worked: 0
    };
    const totalHoursWorked = (totals.total_minutes_worked / 60).toFixed(2);

    return [
      companyId,
      user._id,
      user.name || '',
      user.department || '',
      totals.shifts_count,
      totals.total_minutes_worked,
      totalHoursWorked
    ]
      .map(escapeCsvValue)
      .join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="time-logs-${companyId}.csv"`);
  return res.status(200).send(csv);
});

app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Internal server error'
  });
});

module.exports = app;
