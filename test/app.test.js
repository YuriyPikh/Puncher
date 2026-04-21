const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { after, before, beforeEach, test } = require('node:test');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');

function legacyHash(value) {
  const digest = crypto.createHash('sha256').update(String(value)).digest('hex');
  return `sha256:${digest}`;
}

function comparable(value) {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  return String(value);
}

function valuesEqual(left, right) {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }

  return String(left) === String(right);
}

function matchesFilter(document, filter = {}) {
  for (const [field, condition] of Object.entries(filter)) {
    const actualValue = document[field];

    if (condition instanceof RegExp) {
      if (!condition.test(String(actualValue ?? ''))) {
        return false;
      }
      continue;
    }

    if (
      condition &&
      typeof condition === 'object' &&
      !Array.isArray(condition) &&
      !(condition instanceof Date) &&
      !(condition instanceof ObjectId)
    ) {
      if (Array.isArray(condition.$in)) {
        const matched = condition.$in.some((entry) => valuesEqual(actualValue, entry));
        if (!matched) {
          return false;
        }
      }

      if (condition.$gte !== undefined && comparable(actualValue) < comparable(condition.$gte)) {
        return false;
      }

      if (condition.$lte !== undefined && comparable(actualValue) > comparable(condition.$lte)) {
        return false;
      }

      if (condition.$ne !== undefined && valuesEqual(actualValue, condition.$ne)) {
        return false;
      }

      continue;
    }

    if (!valuesEqual(actualValue, condition)) {
      return false;
    }
  }

  return true;
}

class FakeCursor {
  constructor(items) {
    this.items = items;
  }

  sort(spec = {}) {
    const [field, direction = 1] = Object.entries(spec)[0] || [];
    if (!field) {
      return this;
    }

    this.items.sort((left, right) => {
      const leftValue = comparable(left[field]);
      const rightValue = comparable(right[field]);

      if (leftValue === rightValue) {
        return 0;
      }

      if (leftValue === null || leftValue === undefined) {
        return direction >= 0 ? -1 : 1;
      }

      if (rightValue === null || rightValue === undefined) {
        return direction >= 0 ? 1 : -1;
      }

      return leftValue > rightValue ? direction : -direction;
    });

    return this;
  }

  async toArray() {
    return this.items;
  }
}

class FakeCollection {
  constructor(store) {
    this.store = store;
  }

  find(filter = {}) {
    return new FakeCursor(this.store.filter((entry) => matchesFilter(entry, filter)));
  }

  async findOne(filter = {}) {
    return this.store.find((entry) => matchesFilter(entry, filter)) || null;
  }

  async countDocuments(filter = {}) {
    return this.store.filter((entry) => matchesFilter(entry, filter)).length;
  }

  async insertOne(document) {
    this.store.push(document);
    return { acknowledged: true, insertedId: document._id };
  }

  async updateOne(filter, update) {
    const document = this.store.find((entry) => matchesFilter(entry, filter));
    if (!document) {
      return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
    }

    if (update && update.$set) {
      Object.assign(document, update.$set);
    }

    return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
  }
}

function buildSeedData() {
  const ids = {
    techSolutions: new ObjectId('65e000000000000000000001'),
    remoteWorks: new ObjectId('65e000000000000000000002'),
    alice: new ObjectId('65e000000000000000000101'),
    bob: new ObjectId('65e000000000000000000102'),
    charlie: new ObjectId('65e000000000000000000103'),
    dana: new ObjectId('65e000000000000000000104'),
    erin: new ObjectId('65e000000000000000000105'),
    aliceLog: new ObjectId('65e000000000000000000201'),
    bobLogMorning: new ObjectId('65e000000000000000000202'),
    bobLogAfternoon: new ObjectId('65e000000000000000000203'),
    danaActiveLog: new ObjectId('65e000000000000000000204'),
    erinActiveLog: new ObjectId('65e000000000000000000205'),
    correctionAlice: new ObjectId('65e000000000000000000301'),
    correctionBob: new ObjectId('65e000000000000000000302')
  };

  return {
    companies: [
      {
        _id: ids.techSolutions,
        name: 'Tech Solutions LLC',
        organization_code: 'TECHSOL01',
        settings: { timezone: 'America/New_York' },
        admin_password_hash: 'hidden-admin-secret',
        created_at: '2026-04-01T08:00:00.000Z'
      },
      {
        _id: ids.remoteWorks,
        name: 'Remote Works Inc',
        organization_code: 'REMOTE01',
        settings: { timezone: 'UTC' },
        created_at: '2026-04-01T08:00:00.000Z'
      }
    ],
    users: [
      {
        _id: ids.alice,
        company_id: ids.techSolutions,
        name: 'Alice Admin',
        email: 'alice@techsolutions.com',
        password_hash: bcrypt.hashSync('Password123!', 8),
        pin_hash: bcrypt.hashSync('1111', 8),
        role: 'employee',
        department: 'Operations',
        is_active: true,
        created_at: '2026-04-01T08:00:00.000Z'
      },
      {
        _id: ids.bob,
        company_id: ids.techSolutions,
        name: 'Bob Legacy',
        email: 'bob@techsolutions.com',
        password_hash: legacyHash('Legacy123!'),
        pin_hash: bcrypt.hashSync('2222', 8),
        role: 'manager',
        department: 'Support',
        is_active: true,
        created_at: '2026-04-01T08:00:00.000Z'
      },
      {
        _id: ids.charlie,
        company_id: ids.techSolutions,
        name: 'Charlie Inactive',
        email: 'charlie@techsolutions.com',
        password_hash: bcrypt.hashSync('Inactive123!', 8),
        pin_hash: bcrypt.hashSync('3333', 8),
        role: 'employee',
        department: 'Sales',
        is_active: false,
        created_at: '2026-04-01T08:00:00.000Z'
      },
      {
        _id: ids.dana,
        company_id: ids.remoteWorks,
        name: 'Dana Remote',
        email: 'dana@remoteworks.com',
        password_hash: bcrypt.hashSync('Remote123!', 8),
        pin_hash: bcrypt.hashSync('4444', 8),
        role: 'employee',
        department: 'Remote Ops',
        is_active: true,
        created_at: '2026-04-01T08:00:00.000Z'
      },
      {
        _id: ids.erin,
        company_id: ids.techSolutions,
        name: 'Erin Active',
        email: 'erin@techsolutions.com',
        password_hash: bcrypt.hashSync('Erin123!', 8),
        pin_hash: bcrypt.hashSync('5555', 8),
        role: 'employee',
        department: 'Front Desk',
        is_active: true,
        created_at: '2026-04-01T08:00:00.000Z'
      }
    ],
    timeLogs: [
      {
        _id: ids.aliceLog,
        company_id: ids.techSolutions,
        user_id: ids.alice,
        date: '2026-04-20',
        punch_in: '2026-04-20T08:00:00.000Z',
        punch_out: '2026-04-20T16:00:00.000Z',
        duration_minutes: 480,
        punch_method: 'WEB_PORTAL',
        status: 'approved',
        note: 'Regular shift',
        created_at: '2026-04-20T08:00:00.000Z',
        updated_at: '2026-04-20T16:00:00.000Z'
      },
      {
        _id: ids.bobLogMorning,
        company_id: ids.techSolutions,
        user_id: ids.bob,
        date: '2026-04-18',
        punch_in: '2026-04-18T08:00:00.000Z',
        punch_out: '2026-04-18T12:00:00.000Z',
        duration_minutes: 240,
        punch_method: 'WEB_PORTAL',
        status: 'approved',
        note: 'Morning shift',
        created_at: '2026-04-18T08:00:00.000Z',
        updated_at: '2026-04-18T12:00:00.000Z'
      },
      {
        _id: ids.bobLogAfternoon,
        company_id: ids.techSolutions,
        user_id: ids.bob,
        date: '2026-04-18',
        punch_in: '2026-04-18T13:00:00.000Z',
        punch_out: '2026-04-18T17:00:00.000Z',
        duration_minutes: 240,
        punch_method: 'WEB_PORTAL',
        status: 'rejected',
        note: 'Afternoon shift',
        created_at: '2026-04-18T13:00:00.000Z',
        updated_at: '2026-04-18T17:00:00.000Z'
      },
      {
        _id: ids.danaActiveLog,
        company_id: ids.remoteWorks,
        user_id: ids.dana,
        date: '2026-04-21',
        punch_in: '2026-04-21T09:00:00.000Z',
        punch_out: null,
        duration_minutes: 0,
        punch_method: 'MOBILE',
        status: 'active',
        note: 'Remote start',
        created_at: '2026-04-21T09:00:00.000Z',
        updated_at: '2026-04-21T09:00:00.000Z'
      },
      {
        _id: ids.erinActiveLog,
        company_id: ids.techSolutions,
        user_id: ids.erin,
        date: '2026-04-21',
        punch_in: '2026-04-21T09:30:00.000Z',
        punch_out: null,
        duration_minutes: 0,
        punch_method: 'KIOSK',
        status: 'active',
        note: 'Front desk open',
        created_at: '2026-04-21T09:30:00.000Z',
        updated_at: '2026-04-21T09:30:00.000Z'
      }
    ],
    timeCorrections: [
      {
        _id: ids.correctionAlice,
        company_id: ids.techSolutions,
        user_id: ids.alice,
        time_log_id: ids.aliceLog,
        requested_punch_in: '2026-04-20T08:00:00.000Z',
        requested_punch_out: '2026-04-20T16:30:00.000Z',
        reason: 'Stayed late for handoff',
        status: 'pending',
        admin_comment: '',
        reviewed_by: null,
        created_at: '2026-04-21T10:00:00.000Z',
        updated_at: '2026-04-21T10:00:00.000Z'
      },
      {
        _id: ids.correctionBob,
        company_id: ids.techSolutions,
        user_id: ids.bob,
        time_log_id: ids.bobLogMorning,
        requested_punch_in: '2026-04-18T07:45:00.000Z',
        requested_punch_out: '2026-04-18T12:00:00.000Z',
        reason: 'Forgot to punch on arrival',
        status: 'pending',
        admin_comment: '',
        reviewed_by: null,
        created_at: '2026-04-21T11:00:00.000Z',
        updated_at: '2026-04-21T11:00:00.000Z'
      }
    ],
    ids
  };
}

function createCollections(seed) {
  const stores = {
    companies: seed.companies,
    users: seed.users,
    timeLogs: seed.timeLogs,
    timeCorrections: seed.timeCorrections
  };

  return {
    companies: new FakeCollection(stores.companies),
    users: new FakeCollection(stores.users),
    timeLogs: new FakeCollection(stores.timeLogs),
    timeCorrections: new FakeCollection(stores.timeCorrections),
    __stores: stores,
    __ids: seed.ids
  };
}

let currentCollections = createCollections(buildSeedData());

const dbModulePath = require.resolve('../db');
require.cache[dbModulePath] = {
  id: dbModulePath,
  filename: dbModulePath,
  loaded: true,
  exports: {
    getCollections() {
      return currentCollections;
    }
  }
};

const app = require('../app');

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  currentCollections = createCollections(buildSeedData());
});

async function request(method, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json') ? await response.json() : await response.text();

  return {
    status: response.status,
    body: payload,
    headers: response.headers
  };
}

test('serves the root UI and reports health and docs metadata', async () => {
  const root = await request('GET', '/');
  assert.equal(root.status, 200);
  assert.match(root.body, /Puncher/i);

  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.collections.companies, 2);
  assert.equal(health.body.collections.users, 5);
  assert.equal(health.body.collections.time_logs, 5);
  assert.equal(health.body.collections.time_corrections, 2);

  const docs = await request('GET', '/api/docs');
  assert.equal(docs.status, 200);
  assert.equal(docs.body.basePath, '/api');
  assert.ok(docs.body.endpoints.includes('POST /api/auth/login'));
  assert.ok(
    docs.body.companies.some(
      (company) => company.name === 'Tech Solutions LLC' && company.organization_code === 'TECHSOL01'
    )
  );
});

test('handles employee authentication for bcrypt, legacy hashes, and invalid credentials', async () => {
  const bcryptLogin = await request('POST', '/api/auth/login', {
    email: 'alice@techsolutions.com',
    password: 'Password123!'
  });
  assert.equal(bcryptLogin.status, 200);
  assert.equal(bcryptLogin.body.user.email, 'alice@techsolutions.com');
  assert.equal(bcryptLogin.body.company.name, 'Tech Solutions LLC');
  assert.equal('password_hash' in bcryptLogin.body.user, false);

  const legacyLogin = await request('POST', '/api/auth/login', {
    email: 'bob@techsolutions.com',
    password: 'Legacy123!'
  });
  assert.equal(legacyLogin.status, 200);
  assert.equal(legacyLogin.body.user.name, 'Bob Legacy');

  const invalidLogin = await request('POST', '/api/auth/login', {
    email: 'alice@techsolutions.com',
    password: 'wrong-password'
  });
  assert.equal(invalidLogin.status, 401);
  assert.equal(invalidLogin.body.message, 'Invalid credentials');

  const missingFields = await request('POST', '/api/auth/login', {
    email: 'alice@techsolutions.com'
  });
  assert.equal(missingFields.status, 400);
  assert.match(missingFields.body.message, /Missing required field/);
});

test('supports kiosk login plus company and user listing', async () => {
  const kioskLogin = await request('POST', '/api/auth/kiosk-login', {
    organization_code: 'TECHSOL01',
    pin: '1111'
  });
  assert.equal(kioskLogin.status, 200);
  assert.equal(kioskLogin.body.user.name, 'Alice Admin');

  const invalidKiosk = await request('POST', '/api/auth/kiosk-login', {
    organization_code: 'TECHSOL01',
    pin: '9999'
  });
  assert.equal(invalidKiosk.status, 401);

  const companies = await request('GET', '/api/companies');
  assert.equal(companies.status, 200);
  assert.deepEqual(
    companies.body.map((company) => company.name),
    ['Remote Works Inc', 'Tech Solutions LLC']
  );

  const activeUsers = await request('GET', `/api/companies/${currentCollections.__ids.techSolutions}/users`);
  assert.equal(activeUsers.status, 200);
  assert.equal(activeUsers.body.length, 3);

  const allUsers = await request('GET', `/api/companies/${currentCollections.__ids.techSolutions}/users?includeInactive=true`);
  assert.equal(allUsers.status, 200);
  assert.equal(allUsers.body.length, 4);
});

test('creates users and resets credentials through the admin routes', async () => {
  const createdUser = await request('POST', `/api/companies/${currentCollections.__ids.techSolutions}/users`, {
    name: 'Fiona New',
    email: 'fiona@techsolutions.com',
    password: 'Fiona123!',
    pin: '7878'
  });
  assert.equal(createdUser.status, 201);
  assert.equal(createdUser.body.role, 'employee');
  assert.equal(createdUser.body.department, 'General');
  assert.equal(currentCollections.__stores.users.length, 6);

  const duplicateUser = await request('POST', `/api/companies/${currentCollections.__ids.techSolutions}/users`, {
    name: 'Fiona New',
    email: 'fiona@techsolutions.com',
    password: 'Fiona123!',
    pin: '7878'
  });
  assert.equal(duplicateUser.status, 409);

  const missingResetValues = await request('PATCH', `/api/users/${currentCollections.__ids.alice}/reset-credentials`, {});
  assert.equal(missingResetValues.status, 400);

  const resetCredentials = await request('PATCH', `/api/users/${currentCollections.__ids.alice}/reset-credentials`, {
    password: 'Changed123!',
    pin: '9090'
  });
  assert.equal(resetCredentials.status, 200);

  const loginWithNewPassword = await request('POST', '/api/auth/login', {
    email: 'alice@techsolutions.com',
    password: 'Changed123!'
  });
  assert.equal(loginWithNewPassword.status, 200);

  const missingUser = await request('PATCH', `/api/users/${new ObjectId('65e000000000000000000999')}/reset-credentials`, {
    password: 'Changed123!'
  });
  assert.equal(missingUser.status, 404);
});

test('lists, creates, and closes time logs while validating filters', async () => {
  const filteredLogs = await request(
    'GET',
    `/api/time-logs?company_id=${currentCollections.__ids.techSolutions}&user_id=${currentCollections.__ids.alice}&status=approved&from=2026-04-01&to=2026-04-30`
  );
  assert.equal(filteredLogs.status, 200);
  assert.equal(filteredLogs.body.length, 1);
  assert.equal(filteredLogs.body[0].duration_minutes, 480);

  const invalidDate = await request('GET', '/api/time-logs?from=2026/04/01');
  assert.equal(invalidDate.status, 400);

  const newPunchIn = await request('POST', '/api/time-logs/punch-in', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.alice),
    note: 'Starting an evening handoff',
    punch_method: 'WEB_PORTAL'
  });
  assert.equal(newPunchIn.status, 201);
  assert.equal(newPunchIn.body.status, 'active');

  const duplicatePunchIn = await request('POST', '/api/time-logs/punch-in', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.alice)
  });
  assert.equal(duplicatePunchIn.status, 409);

  const missingActiveShift = await request('POST', '/api/time-logs/punch-out', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.bob)
  });
  assert.equal(missingActiveShift.status, 404);

  const closedShift = await request('POST', '/api/time-logs/punch-out', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.erin),
    note: 'Closed register'
  });
  assert.equal(closedShift.status, 200);
  assert.equal(closedShift.body.status, 'approved');
  assert.match(closedShift.body.note, /Front desk open \| Closed register/);
});

test('edits time logs and rejects invalid update payloads', async () => {
  const missingLog = await request('PATCH', `/api/time-logs/${new ObjectId('65e000000000000000000998')}`, {
    note: 'Missing'
  });
  assert.equal(missingLog.status, 404);

  const invalidStatus = await request('PATCH', `/api/time-logs/${currentCollections.__ids.aliceLog}`, {
    status: 'paused'
  });
  assert.equal(invalidStatus.status, 400);

  const invalidOrder = await request('PATCH', `/api/time-logs/${currentCollections.__ids.aliceLog}`, {
    punch_in: '2026-04-20T17:00:00.000Z',
    punch_out: '2026-04-20T16:00:00.000Z'
  });
  assert.equal(invalidOrder.status, 400);

  const adjustedLog = await request('PATCH', `/api/time-logs/${currentCollections.__ids.aliceLog}`, {
    punch_in: '2026-04-20T08:15:00.000Z',
    punch_out: '2026-04-20T16:45:00.000Z',
    status: 'active',
    note: 'Adjusted after review'
  });
  assert.equal(adjustedLog.status, 200);
  assert.equal(adjustedLog.body.status, 'approved');
  assert.equal(adjustedLog.body.duration_minutes, 510);

  const reopenedLog = await request('PATCH', `/api/time-logs/${currentCollections.__ids.aliceLog}`, {
    punch_out: null
  });
  assert.equal(reopenedLog.status, 200);
  assert.equal(reopenedLog.body.status, 'active');
  assert.equal(reopenedLog.body.duration_minutes, 0);
});

test('creates and lists time correction requests with explicit and auto-resolved targets', async () => {
  const explicitTarget = await request('POST', '/api/time-corrections', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.alice),
    time_log_id: String(currentCollections.__ids.aliceLog),
    requested_punch_out: '2026-04-20T16:15:00.000Z',
    reason: 'Stayed a few minutes longer'
  });
  assert.equal(explicitTarget.status, 201);
  assert.equal(explicitTarget.body.status, 'pending');

  const autoResolved = await request('POST', '/api/time-corrections', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.alice),
    requested_punch_in: '2026-04-20T08:10:00.000Z',
    reason: 'Badge scanner lagged'
  });
  assert.equal(autoResolved.status, 201);
  assert.equal(autoResolved.body.time_log_id, String(currentCollections.__ids.aliceLog));

  const ambiguousTarget = await request('POST', '/api/time-corrections', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.bob),
    requested_punch_in: '2026-04-18T08:05:00.000Z',
    reason: 'Need to fix one of the split shifts'
  });
  assert.equal(ambiguousTarget.status, 409);

  const missingReference = await request('POST', '/api/time-corrections', {
    company_id: String(currentCollections.__ids.techSolutions),
    user_id: String(currentCollections.__ids.alice),
    reason: 'No target details supplied'
  });
  assert.equal(missingReference.status, 400);

  const correctionList = await request(
    'GET',
    `/api/time-corrections?company_id=${currentCollections.__ids.techSolutions}&user_id=${currentCollections.__ids.alice}&status=pending`
  );
  assert.equal(correctionList.status, 200);
  assert.equal(correctionList.body.length, 3);
});

test('reviews time corrections and updates linked time logs on approval', async () => {
  const invalidReview = await request('PATCH', `/api/time-corrections/${currentCollections.__ids.correctionAlice}/review`, {
    status: 'pending'
  });
  assert.equal(invalidReview.status, 400);

  const missingReview = await request('PATCH', `/api/time-corrections/${new ObjectId('65e000000000000000000997')}/review`, {
    status: 'approved'
  });
  assert.equal(missingReview.status, 404);

  const approvedReview = await request('PATCH', `/api/time-corrections/${currentCollections.__ids.correctionAlice}/review`, {
    status: 'approved',
    reviewed_by: 'qa-admin',
    admin_comment: 'Approved after supervisor review'
  });
  assert.equal(approvedReview.status, 200);
  assert.equal(approvedReview.body.status, 'approved');
  assert.equal(approvedReview.body.reviewed_by, 'qa-admin');

  const updatedLog = currentCollections.__stores.timeLogs.find((entry) => String(entry._id) === String(currentCollections.__ids.aliceLog));
  assert.equal(updatedLog.duration_minutes, 510);
  assert.equal(updatedLog.status, 'approved');
  assert.equal(updatedLog.punch_out, '2026-04-20T16:30:00.000Z');
});

test('builds the admin dashboard, exports CSV reports, and returns route errors', async () => {
  const dashboard = await request('GET', `/api/admin/${currentCollections.__ids.techSolutions}/dashboard`);
  assert.equal(dashboard.status, 200);
  assert.equal(dashboard.body.summary.employees_total, 3);
  assert.equal(dashboard.body.summary.active_now, 1);
  assert.equal(dashboard.body.summary.pending_corrections, 2);

  const missingDashboard = await request('GET', `/api/admin/${new ObjectId('65e000000000000000000996')}/dashboard`);
  assert.equal(missingDashboard.status, 404);

  const csvReport = await request(
    'GET',
    `/api/reports/${currentCollections.__ids.techSolutions}/time-logs.csv?from=2026-04-01&to=2026-04-30`
  );
  assert.equal(csvReport.status, 200);
  assert.match(csvReport.headers.get('content-type'), /text\/csv/);
  assert.match(csvReport.body, /"Bob Legacy","Support","1","240","4\.00"/);

  const invalidCsvFilter = await request('GET', `/api/reports/${currentCollections.__ids.techSolutions}/time-logs.csv?from=2026/04/01`);
  assert.equal(invalidCsvFilter.status, 400);

  const unknownRoute = await request('GET', '/api/not-a-route');
  assert.equal(unknownRoute.status, 404);
  assert.equal(unknownRoute.body.path, '/api/not-a-route');
});
