import http from 'k6/http';
import { sleep, check } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// k6 Concurrency/Performance Configurations
// =============================================================================
const TEST_TYPE = __ENV.TEST_TYPE || 'load';
let scenarios = {};

if (TEST_TYPE === 'smoke') {
  scenarios = {
    smoke_test: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10s',
    },
  };
} else if (TEST_TYPE === 'stress') {
  scenarios = {
    stress_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 10 }, // Ramp up to 10 VUs (admin transactions are extremely heavy)
        { duration: '3m', target: 10 }, // Sustained stress
        { duration: '1m', target: 0 },  // Ramp down
      ],
    },
  };
} else if (TEST_TYPE === 'spike') {
  scenarios = {
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 15 }, // Sudden surge to 15 VUs
        { duration: '1m', target: 15 },  // Sustain peak
        { duration: '10s', target: 0 },  // Rapid drop-off
      ],
    },
  };
} else if (TEST_TYPE === 'soak') {
  scenarios = {
    soak_test: {
      executor: 'constant-vus',
      vus: 2,                            // Constant small load (2 admins running background jobs)
      duration: '30m',                   // 30 minutes soak test
    },
  };
} else {
  // Default: Load Testing (normal/peak expected concurrency)
  scenarios = {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 5 },  // Ramp up to 5 VUs
        { duration: '3m', target: 5 },  // Maintain peak
        { duration: '1m', target: 0 },  // Ramp down
      ],
    },
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],              // Less than 1% errors
    http_req_duration: ['p(95)<1200', 'p(99)<3000'], // 95% under 1.2s, 99% under 3s (higher SLAs due to heavy DuckDB processing)
  },
};

// Global Configuration via Environment Variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const AI_SERVICE_SECRET = __ENV.AI_SERVICE_SECRET || 'ai-service-secret-change-me';

// VU-scoped token cache
let cachedAdminToken = null;
let cachedAdminId = null;

// Helper function to log in and get token
function authenticate(email, password) {
  const payload = JSON.stringify({ email, password });
  const res = http.post(`${BASE_URL}/apiv1/api/auth/login`, payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.status === 200) {
    return {
      token: res.json('token') || res.json('jwt'),
      userId: res.json('userId') || res.json('id') || 1,
    };
  }
  return null;
}

// =============================================================================
// ADMIN JOURNEY WORKLOAD (Management & Heavy DuckDB Analytics)
// =============================================================================
export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ── STEP 1: AUTHENTICATION (Cached per VU) ─────────────────────────────────
  if (!cachedAdminToken) {
    // Maps VUs to test_admin_1@example.com up to test_admin_5@example.com
    const adminNum = ((__VU - 1) % 5) + 1;
    const email = `test_admin_${adminNum}@example.com`;
    const auth = authenticate(email, 'password');
    if (!auth) { sleep(5); return; }
    cachedAdminToken = auth.token;
    cachedAdminId = auth.userId;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cachedAdminToken}`,
  };

  const personalizeHeaders = {
    'Content-Type': 'application/json',
    'X-AI-Secret': AI_SERVICE_SECRET,
  };

  sleep(randomIntBetween(1, 3));

  // ── STEP 2: LIST USERS (Management) ────────────────────────────────────────
  const usersRes = http.get(`${BASE_URL}/apiv1/api/users`, { headers: authHeaders });
  check(usersRes, { 'admin: list users ok': (r) => r.status === 200 || r.status === 403 });
  sleep(randomIntBetween(3, 6));

  // ── STEP 3: FETCH STUDENT METRICS (Personalize DuckDB) ──────────────────────
  const metricsRes = http.get(`${BASE_URL}/personalize/analytics/gold/student-metrics`, { headers: personalizeHeaders });
  check(metricsRes, { 'admin: get lakehouse metrics ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // ── STEP 4: FETCH CONCEPT STRUGGLES (Personalize DuckDB) ────────────────────
  const strugglesRes = http.get(`${BASE_URL}/personalize/analytics/gold/concept-struggles`, { headers: personalizeHeaders });
  check(strugglesRes, { 'admin: get lakehouse struggles ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // ── STEP 5: FETCH STRUGGLE ALERTS (Personalize DuckDB) ──────────────────────
  const alertsRes = http.get(`${BASE_URL}/personalize/analytics/gold/struggle-alerts`, { headers: personalizeHeaders });
  check(alertsRes, { 'admin: get lakehouse alerts ok': (r) => r.status === 200 });
  sleep(randomIntBetween(3, 5));

  // ── STEP 6: TRIGGER PARQUET EXPORT (Heavy write transaction / Lock test) ───
  const exportRes = http.post(`${BASE_URL}/personalize/analytics/gold/export`, {}, { headers: personalizeHeaders });
  check(exportRes, { 'admin: trigger parquet export ok': (r) => r.status === 200 });

  sleep(randomIntBetween(5, 10));
}

// =============================================================================
// Output Summary Reports (Console and HTML)
// =============================================================================
export function handleSummary(data) {
  return {
    'summary.html': htmlReport(data),
    'stdout': textSummary(data, { indent: ' ', enableColors: true }),
  };
}
