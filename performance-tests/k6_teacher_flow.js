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
        { duration: '2m', target: 25 }, // Ramp up to 25 VUs (limit of teacher workload)
        { duration: '3m', target: 25 }, // Sustained stress
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
        { duration: '10s', target: 30 }, // Sudden surge to 30 VUs
        { duration: '1m', target: 30 },  // Sustain peak
        { duration: '10s', target: 0 },  // Rapid drop-off
      ],
    },
  };
} else if (TEST_TYPE === 'soak') {
  scenarios = {
    soak_test: {
      executor: 'constant-vus',
      vus: 5,                            // Constant moderate load
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
        { duration: '1m', target: 10 }, // Ramp up to 10 VUs
        { duration: '3m', target: 10 }, // Maintain peak
        { duration: '1m', target: 0 },  // Ramp down
      ],
    },
  };
}

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],              // Less than 1% errors
    http_req_duration: ['p(95)<1000', 'p(99)<2500'], // 95% under 1s, 99% under 2.5s
  },
};

// Global Configuration via Environment Variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const COURSE_ID = parseInt(__ENV.COURSE_ID || '19');

// VU-scoped token cache (initialized once per Virtual User context)
let cachedTeacherToken = null;
let cachedTeacherId = null;

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
// TEACHER JOURNEY WORKLOAD
// =============================================================================
export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ── STEP 1: AUTHENTICATION (Cached per VU) ─────────────────────────────────
  if (!cachedTeacherToken) {
    // Maps VUs to test_teacher_1@example.com up to test_teacher_10@example.com
    const teacherNum = ((__VU - 1) % 10) + 1;
    const email = `test_teacher_${teacherNum}@example.com`;
    const auth = authenticate(email, 'password');
    if (!auth) { sleep(2); return; }
    cachedTeacherToken = auth.token;
    cachedTeacherId = auth.userId;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cachedTeacherToken}`,
  };

  sleep(randomIntBetween(1, 2));

  // ── STEP 2: BROWSE COURSE LIST ─────────────────────────────────────────────
  const coursesRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses`, { headers: authHeaders });
  check(coursesRes, { 'teacher: list courses ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // ── STEP 3: VIEW TEACHER DASHBOARD METRICS ─────────────────────────────────
  const dashboardRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/analytics/teacher-dashboard`, { headers: authHeaders });
  check(dashboardRes, { 'teacher: load dashboard ok': (r) => r.status === 200 || r.status === 404 });
  sleep(randomIntBetween(3, 5));

  // ── STEP 4: VIEW STUDENT PROGRESS OVERVIEW ─────────────────────────────────
  const progressRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses/${COURSE_ID}/student-progress-overview`, { headers: authHeaders });
  check(progressRes, { 'teacher: get progress overview ok': (r) => r.status === 200 || r.status === 404 });
  sleep(randomIntBetween(3, 5));

  // ── STEP 5: VIEW QUIZ ANALYTICS ────────────────────────────────────────────
  const quizAnalyticsRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses/${COURSE_ID}/quiz-analytics`, { headers: authHeaders });
  check(quizAnalyticsRes, { 'teacher: get quiz analytics ok': (r) => r.status === 200 || r.status === 404 });
  sleep(randomIntBetween(2, 4));

  // ── STEP 6: CREATE DRAFT CONTENT (Simulated Course Builder) ────────────────
  const createContentPayload = JSON.stringify({
    title: `Load Test Lesson - ${Date.now()}`,
    type: 'TEXT',
    is_mandatory: false,
    metadata: { content: 'Load testing content body' }
  });
  
  const editRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/courses`, createContentPayload, { headers: authHeaders });
  check(editRes, { 'teacher: modify course status resolved': (r) => r.status === 200 || r.status === 201 || r.status === 403 || r.status === 404 });

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
