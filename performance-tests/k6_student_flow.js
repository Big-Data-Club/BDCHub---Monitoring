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
        { duration: '2m', target: 100 }, // Push to 100 concurrent students
        { duration: '3m', target: 100 },
        { duration: '1m', target: 0 },
      ],
    },
  };
} else if (TEST_TYPE === 'spike') {
  scenarios = {
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '10s', target: 150 }, // Sudden massive surge of 150 users
        { duration: '1m', target: 150 },
        { duration: '10s', target: 0 },
      ],
    },
  };
} else if (TEST_TYPE === 'soak') {
  scenarios = {
    soak_test: {
      executor: 'constant-vus',
      vus: 25,                           // Constant moderate-to-high student load
      duration: '30m',                  // 30 minutes soak testing
    },
  };
} else {
  // Default: Load Testing (normal/peak expected concurrency)
  scenarios = {
    load_test: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '1m', target: 50 },  // Ramp up to 50 active students
        { duration: '3m', target: 50 },  // Maintain peak
        { duration: '1m', target: 0 },   // Ramp down
      ],
    },
  };
}

export const options = {
  scenarios,
  thresholds: {
    // SLAs: Define target performance thresholds
    http_req_failed: ['rate<0.01'],             // Error rate must be less than 1%
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // 95% of requests must complete under 800ms, 99% under 2s
  },
};

// Configurable parameters via environment variables
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000'; // Traefik gateway or localhost
const COURSE_ID = parseInt(__ENV.COURSE_ID || '19');
const NODE_ID = parseInt(__ENV.NODE_ID || '2221');
const AI_SERVICE_SECRET = __ENV.AI_SERVICE_SECRET || 'ai-service-secret-change-me';

// =============================================================================
// VU-scoped cache (initialized once per Virtual User engine)
// =============================================================================
let cachedToken = null;
let cachedUserId = null;

// =============================================================================
// Virtual User (VU) Execution Flow
// =============================================================================
export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ── STEP 1: AUTHENTICATION (Cached per VU) ─────────────────────────────────
  if (!cachedToken) {
    // Determine student email deterministically based on VU ID
    // Maps VUs to test_student_1@example.com up to test_student_100@example.com
    const studentNum = ((__VU - 1) % 100) + 1;
    const studentEmail = `test_student_${studentNum}@example.com`;
    
    const loginPayload = JSON.stringify({
      email: studentEmail,
      password: 'password',
    });
    
    const loginRes = http.post(`${BASE_URL}/apiv1/api/auth/login`, loginPayload, { headers });
    
    const loginOk = check(loginRes, {
      'login status is 200': (r) => r.status === 200,
      'login has token': (r) => r.json('token') !== undefined || r.json('jwt') !== undefined,
    });

    if (!loginOk) {
      sleep(1);
      return;
    }

    cachedToken = loginRes.json('token') || loginRes.json('jwt');
    cachedUserId = loginRes.json('userId') || loginRes.json('id') || 137;
  }

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cachedToken}`,
  };

  // Simulated think time (user reading/processing UI)
  sleep(randomIntBetween(1, 2));

  // ── STEP 2: BROWSE COURSE SYLLABUS ─────────────────────────────────────────
  const syllabusRes = http.get(`${BASE_URL}/lmsapiv1/api/v1/courses`, { headers: authHeaders });
  check(syllabusRes, {
    'get courses status is 200': (r) => r.status === 200,
  });

  sleep(randomIntBetween(2, 4));

  // ── STEP 3: VIEW CONTENT (Start Lesson) ────────────────────────────────────
  const viewPayload = JSON.stringify({
    course_id: COURSE_ID,
    lesson_id: null,
    node_id: NODE_ID,
    action_type: 'lesson_view',
  });
  
  const viewRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, viewPayload, { headers: authHeaders });
  check(viewRes, {
    'lesson_view interaction logged': (r) => r.status === 200 || r.status === 201,
  });

  // Simulate active student learning (reading textbook/watching video)
  sleep(randomIntBetween(5, 10));

  // ── STEP 4: COMPLETE LESSON ────────────────────────────────────────────────
  const completePayload = JSON.stringify({
    course_id: COURSE_ID,
    lesson_id: null,
    node_id: NODE_ID,
    action_type: 'lesson_complete',
    payload: { reason: 'k6_load_test' },
  });
  
  const completeRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, completePayload, { headers: authHeaders });
  check(completeRes, {
    'lesson_complete interaction logged': (r) => r.status === 200 || r.status === 201,
  });

  sleep(randomIntBetween(2, 5));

  // ── STEP 5: SIMULATE MICRO-ACTIONS ─────────────────────────────────────────
  const roll = Math.random();

  if (roll < 0.3) {
    // 30% chance: flip flashcards
    const flipPayload = JSON.stringify({
      course_id: COURSE_ID,
      lesson_id: null,
      node_id: NODE_ID,
      action_type: 'flashcard_flip',
    });
    const flipRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, flipPayload, { headers: authHeaders });
    check(flipRes, { 'flashcard_flip logged': (r) => r.status === 200 });
    
  } else if (roll < 0.6) {
    // 30% chance: answer a Quick Check question
    const isCorrect = Math.random() > 0.3; // 70% success rate
    
    // Log Quick Check attempt
    const checkAttemptPayload = JSON.stringify({
      course_id: COURSE_ID,
      lesson_id: null,
      node_id: NODE_ID,
      action_type: 'quick_check_attempt',
      score: isCorrect ? 1.0 : 0.0,
      status: isCorrect ? 'correct' : 'incorrect',
    });
    http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, checkAttemptPayload, { headers: authHeaders });

    // Log Quick Check result
    const checkResultPayload = JSON.stringify({
      course_id: COURSE_ID,
      lesson_id: null,
      node_id: NODE_ID,
      action_type: isCorrect ? 'quick_check_correct' : 'quick_check_incorrect',
    });
    const checkRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, checkResultPayload, { headers: authHeaders });
    check(checkRes, { 'quick_check logged': (r) => r.status === 200 });

  } else if (roll < 0.8) {
    // 20% chance: ask AI helper
    const askPayload = JSON.stringify({
      course_id: COURSE_ID,
      lesson_id: null,
      node_id: NODE_ID,
      action_type: 'ask_ai',
    });
    const askRes = http.post(`${BASE_URL}/lmsapiv1/api/v1/analytics/micro-interaction`, askPayload, { headers: authHeaders });
    check(askRes, { 'ask_ai logged': (r) => r.status === 200 });
  }

  sleep(randomIntBetween(2, 4));

  // ── STEP 6: VIEW PERSONALIZATION PROFILE ───────────────────────────────────
  const profileRes = http.get(`${BASE_URL}/personalize/student/${cachedUserId}/course/${COURSE_ID}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-AI-Secret': AI_SERVICE_SECRET
    }
  });
  check(profileRes, {
    'get personalize profile status is 200': (r) => r.status === 200,
  });

  // Final sleep before loop finishes
  sleep(randomIntBetween(3, 5));
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
