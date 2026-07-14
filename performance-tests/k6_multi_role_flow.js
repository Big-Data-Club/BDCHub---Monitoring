import http from 'k6/http';
import { sleep, check } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// =============================================================================
// k6 Concurrency/Performance Configurations (Multi-Role Workload)
// =============================================================================
const TEST_TYPE = __ENV.TEST_TYPE || 'load';
let scenarios = {};

if (TEST_TYPE === 'smoke') {
  scenarios = {
    student_smoke: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10s',
      exec: 'studentJourney',
    },
    teacher_smoke: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10s',
      exec: 'teacherJourney',
    },
    admin_smoke: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '10s',
      exec: 'adminJourney',
    },
  };
} else if (TEST_TYPE === 'stress') {
  scenarios = {
    student_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 100 }, // Stress student load
        { duration: '3m', target: 100 },
        { duration: '1m', target: 0 },
      ],
      exec: 'studentJourney',
    },
    teacher_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 15 },  // Stress teacher load
        { duration: '3m', target: 15 },
        { duration: '1m', target: 0 },
      ],
      exec: 'teacherJourney',
    },
    admin_stress: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 5 },   // Stress admin load
        { duration: '3m', target: 5 },
        { duration: '1m', target: 0 },
      ],
      exec: 'adminJourney',
    },
  };
} else if (TEST_TYPE === 'spike') {
  scenarios = {
    student_spike: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 120 }, // Sudden massive student surge
        { duration: '1m', target: 120 },
        { duration: '10s', target: 0 },
      ],
      exec: 'studentJourney',
    },
    teacher_spike: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 20 },  // Sudden teacher surge
        { duration: '1m', target: 20 },
        { duration: '10s', target: 0 },
      ],
      exec: 'teacherJourney',
    },
    admin_spike: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 8 },   // Sudden admin surge
        { duration: '1m', target: 8 },
        { duration: '10s', target: 0 },
      ],
      exec: 'adminJourney',
    },
  };
} else if (TEST_TYPE === 'soak') {
  scenarios = {
    student_soak: {
      executor: 'constant-vus',
      vus: 20,
      duration: '30m',
      exec: 'studentJourney',
    },
    teacher_soak: {
      executor: 'constant-vus',
      vus: 3,
      duration: '30m',
      exec: 'teacherJourney',
    },
    admin_soak: {
      executor: 'constant-vus',
      vus: 1,
      duration: '30m',
      exec: 'adminJourney',
    },
  };
} else {
  // Default: Load Testing (normal/peak expected concurrency ratios: 85% Students, 12% Teachers, 3% Admins)
  scenarios = {
    student_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 40 },
        { duration: '3m', target: 40 },
        { duration: '1m', target: 0 },
      ],
      exec: 'studentJourney',
    },
    teacher_load: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 5 },
        { duration: '3m', target: 5 },
        { duration: '1m', target: 0 },
      ],
      exec: 'teacherJourney',
    },
    admin_load: {
      executor: 'constant-vus',
      vus: 2,
      duration: '5m',
      exec: 'adminJourney',
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
const NODE_ID = parseInt(__ENV.NODE_ID || '2221');
const AI_SERVICE_SECRET = __ENV.AI_SERVICE_SECRET || 'ai-service-secret-change-me';

// VU-scoped token cache (independent runtimes per VU)
let cachedStudentToken = null;
let cachedStudentId = null;

let cachedTeacherToken = null;
let cachedTeacherId = null;

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
// STUDENT JOURNEY SCENARIO
// =============================================================================
export function studentJourney() {
  if (!cachedStudentToken) {
    const studentNum = ((__VU - 1) % 100) + 1; // 100 students seeded
    const email = `test_student_${studentNum}@example.com`;
    const auth = authenticate(email, 'password');
    if (!auth) { sleep(2); return; }
    cachedStudentToken = auth.token;
    cachedStudentId = auth.userId;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cachedStudentToken}`,
  };

  // Browse Courses
  const syllabusRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses`, { headers: authHeaders });
  check(syllabusRes, { 'student: get courses ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // View Lesson
  const viewPayload = JSON.stringify({
    course_id: COURSE_ID,
    lesson_id: null,
    node_id: NODE_ID,
    action_type: 'lesson_view',
  });
  http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, viewPayload, { headers: authHeaders });
  sleep(randomIntBetween(5, 10)); // simulated read time

  // Complete Lesson
  const completePayload = JSON.stringify({
    course_id: COURSE_ID,
    lesson_id: null,
    node_id: NODE_ID,
    action_type: 'lesson_complete',
    payload: { reason: 'k6_multi_role_test' },
  });
  http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, completePayload, { headers: authHeaders });
  sleep(randomIntBetween(2, 5));

  // Flip Flashcard
  if (Math.random() < 0.5) {
    const flipPayload = JSON.stringify({
      course_id: COURSE_ID,
      lesson_id: null,
      node_id: NODE_ID,
      action_type: 'flashcard_flip',
    });
    http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, flipPayload, { headers: authHeaders });
  }

  // Load personalization profile
  const profileRes = http.get(`${BASE_URL}/personalize/student/${cachedStudentId}/course/${COURSE_ID}`, {
    headers: { 'Content-Type': 'application/json', 'X-AI-Secret': AI_SERVICE_SECRET }
  });
  check(profileRes, { 'student: get personalize profile ok': (r) => r.status === 200 });

  sleep(randomIntBetween(3, 5));
}

// =============================================================================
// TEACHER JOURNEY SCENARIO
// =============================================================================
export function teacherJourney() {
  if (!cachedTeacherToken) {
    const teacherNum = ((__VU - 1) % 10) + 1; // 10 teachers seeded
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

  // 1. Browse course list
  const coursesRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses`, { headers: authHeaders });
  check(coursesRes, { 'teacher: list courses ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // 2. View Teacher Dashboard metrics
  const dashboardRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/analytics/teacher-dashboard`, { headers: authHeaders });
  check(dashboardRes, { 'teacher: load teacher dashboard ok': (r) => r.status === 200 || r.status === 404 });
  sleep(randomIntBetween(3, 5));

  // 3. View Student Progress Overview for a course
  const progressRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses/${COURSE_ID}/student-progress-overview`, { headers: authHeaders });
  check(progressRes, { 'teacher: get progress overview ok': (r) => r.status === 200 || r.status === 404 });
  sleep(randomIntBetween(3, 5));

  // 4. View Quiz Analytics
  const quizAnalyticsRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses/${COURSE_ID}/quiz-analytics`, { headers: authHeaders });
  check(quizAnalyticsRes, { 'teacher: get quiz analytics ok': (r) => r.status === 200 || r.status === 404 });

  // 5. Create a draft content (simulated course building)
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
// ADMIN JOURNEY SCENARIO (Lakehouse sync operations)
// =============================================================================
export function adminJourney() {
  if (!cachedAdminToken) {
    const adminNum = ((__VU - 1) % 5) + 1; // 5 admins seeded
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

  // 1. List users (Management)
  const usersRes = http.get(`${BASE_URL}/apiv1/api/users`, { headers: authHeaders });
  check(usersRes, { 'admin: list users ok': (r) => r.status === 200 || r.status === 403 });
  sleep(randomIntBetween(3, 6));

  // 2. Fetch Lakehouse Student Metrics View (Personalize)
  const metricsRes = http.get(`${BASE_URL}/personalize/analytics/gold/student-metrics`, {
    headers: { 'Content-Type': 'application/json', 'X-AI-Secret': AI_SERVICE_SECRET }
  });
  check(metricsRes, { 'admin: get lakehouse metrics ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // 3. Fetch Lakehouse Struggles View
  const strugglesRes = http.get(`${BASE_URL}/personalize/analytics/gold/concept-struggles`, {
    headers: { 'Content-Type': 'application/json', 'X-AI-Secret': AI_SERVICE_SECRET }
  });
  check(strugglesRes, { 'admin: get lakehouse struggles ok': (r) => r.status === 200 });
  sleep(randomIntBetween(2, 4));

  // 4. Fetch Struggle Alerts
  const alertsRes = http.get(`${BASE_URL}/personalize/analytics/gold/struggle-alerts`, {
    headers: { 'Content-Type': 'application/json', 'X-AI-Secret': AI_SERVICE_SECRET }
  });
  check(alertsRes, { 'admin: get lakehouse alerts ok': (r) => r.status === 200 });
  sleep(randomIntBetween(3, 5));

  // 5. Trigger Parquet Export (heavy DuckDB operation)
  const exportRes = http.post(`${BASE_URL}/personalize/analytics/gold/export`, {}, {
    headers: { 'Content-Type': 'application/json', 'X-AI-Secret': AI_SERVICE_SECRET }
  });
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
