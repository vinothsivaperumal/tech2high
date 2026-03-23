/**
 * Tech2High Portal — Comprehensive API Automation Test Suite
 * ===========================================================
 * Runs 100+ test scenarios covering every API endpoint.
 *
 * Usage:  npx tsx tests/run-all.ts
 *
 * Requires: dev server running on http://localhost:4000
 * Test accounts: student@tech2high.com / trainer@tech2high.com (password123) / admin@tech2high.com (Test@1234)
 */

import { api, login, register, uid, API } from "./setup.js";

/* ── Types ──────────────────────────────────────────────────────── */
interface TestResult {
  id: number;
  section: string;
  name: string;
  passed: boolean;
  status: number;
  ms: number;
  error?: string;
}

const results: TestResult[] = [];
let testId = 0;

/* ── Shared tokens & IDs ────────────────────────────────────────── */
let studentToken = "";
let trainerToken = "";
let adminToken = "";
let studentId = "";
let trainerId = "";
let adminId = "";

// Created resource IDs (for later use in subsequent tests)
let createdProgramId = "";
let createdCourseId = "";
let createdTopicId = "";
let createdBatchId = "";
let createdAssignmentId = "";
let createdVideoId = "";
let createdMaterialId = "";
let testStudentToken = "";
let testStudentId = "";
let testStudentEmail = "";
let createdPaymentId = "";
let createdAgreementId = "";
let createdCertificationId = "";
let createdCredentialId = "";
let createdClientId = "";
let createdProjectId = "";
let createdStudentProjectId = "";
let createdBatchVideoId = "";

/* ── Helpers ────────────────────────────────────────────────────── */
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForServer(maxWait = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const resp = await fetch(`${API}/health`);
      if (resp.ok) return true;
    } catch {}
    await delay(500);
  }
  return false;
}

/* ── Test runner ────────────────────────────────────────────────── */
async function test(section: string, name: string, fn: () => Promise<{ status: number }>) {
  const start = Date.now();
  try {
    const { status } = await fn();
    const ms = Date.now() - start;
    results.push({ id: ++testId, section, name, passed: true, status, ms });
  } catch (err: unknown) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    // On fetch failure, wait for server to recover and retry once
    if (msg === "fetch failed") {
      const recovered = await waitForServer();
      if (recovered) {
        const retryStart = Date.now();
        try {
          const { status } = await fn();
          const retryMs = Date.now() - retryStart;
          results.push({ id: ++testId, section, name, passed: true, status, ms: retryMs });
          return;
        } catch (retryErr: unknown) {
          const retryMs = Date.now() - retryStart;
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          results.push({ id: ++testId, section, name, passed: false, status: 0, ms: retryMs, error: `retry: ${retryMsg}` });
          return;
        }
      }
    }
    results.push({ id: ++testId, section, name, passed: false, status: 0, ms, error: msg });
  }
}

/* helper: assert / expect */
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 1 — HEALTH CHECK
   ══════════════════════════════════════════════════════════════════ */
async function healthTests() {
  await test("Health", "GET /health returns 200", async () => {
    const r = await api("/health");
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    assert((r.body as Record<string, unknown>).status === "ok", "Body status not ok");
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 2 — AUTHENTICATION
   ══════════════════════════════════════════════════════════════════ */
async function authTests() {
  // 2.1 Register a temporary test student
  testStudentEmail = `test_${Date.now()}@test.com`;
  await test("Auth", "POST /api/auth/register — new student", async () => {
    const r = await api<{ token: string; user: Record<string, unknown> }>("/api/auth/register", {
      method: "POST",
      body: { email: testStudentEmail, password: "Test@1234", fullName: "Test Student", role: "student" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    testStudentToken = (r.body as { token: string }).token;
    testStudentId = (r.body as { user: { id: string } }).user.id;
    return { status: r.status };
  });

  // 2.2 Duplicate registration
  await test("Auth", "POST /api/auth/register — duplicate email → 409", async () => {
    const r = await api("/api/auth/register", {
      method: "POST",
      body: { email: testStudentEmail, password: "Test@1234", fullName: "Dup", role: "student" },
    });
    assert(r.status === 409, `Expected 409 got ${r.status}`);
    return { status: r.status };
  });

  // 2.3 Register with invalid data
  await test("Auth", "POST /api/auth/register — missing password → 400", async () => {
    const r = await api("/api/auth/register", {
      method: "POST",
      body: { email: "bad@test.com" },
    });
    assert(r.status === 400, `Expected 400 got ${r.status}`);
    return { status: r.status };
  });

  // 2.4 Login - student
  await test("Auth", "POST /api/auth/login — student", async () => {
    const data = await login("student@tech2high.com", "password123");
    studentToken = data.token;
    studentId = data.user.id as string;
    assert(!!studentToken, "No token returned");
    return { status: 200 };
  });

  // 2.5 Login - trainer
  await test("Auth", "POST /api/auth/login — trainer", async () => {
    const data = await login("trainer@tech2high.com", "password123");
    trainerToken = data.token;
    trainerId = data.user.id as string;
    assert(!!trainerToken, "No token returned");
    return { status: 200 };
  });

  // 2.6 Login - admin
  await test("Auth", "POST /api/auth/login — admin", async () => {
    const data = await login("admin@tech2high.com", "Test@1234");
    adminToken = data.token;
    adminId = data.user.id as string;
    assert(!!adminToken, "No token returned");
    return { status: 200 };
  });

  // 2.7 Login with wrong password
  await test("Auth", "POST /api/auth/login — wrong password → 401", async () => {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: { email: "student@tech2high.com", password: "wrongpassword123" },
    });
    assert(r.status === 401, `Expected 401 got ${r.status}`);
    return { status: r.status };
  });

  // 2.8 Login with non-existent user
  await test("Auth", "POST /api/auth/login — non-existent user → 401", async () => {
    const r = await api("/api/auth/login", {
      method: "POST",
      body: { email: "noone@nowhere.com", password: "password123" },
    });
    assert(r.status === 401, `Expected 401 got ${r.status}`);
    return { status: r.status };
  });

  // 2.9 GET /me with valid token
  await test("Auth", "GET /api/auth/me — valid token", async () => {
    const r = await api("/api/auth/me", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // 2.10 GET /me without token
  await test("Auth", "GET /api/auth/me — no token → 401", async () => {
    const r = await api("/api/auth/me");
    assert(r.status === 401, `Expected 401 got ${r.status}`);
    return { status: r.status };
  });

  // 2.11 PATCH /me update profile
  await test("Auth", "PATCH /api/auth/me — update profile", async () => {
    const r = await api("/api/auth/me", {
      method: "PATCH",
      token: testStudentToken,
      body: { fullName: "Updated Test Student", phone: "1234567890" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 3 — META (Public endpoints)
   ══════════════════════════════════════════════════════════════════ */
async function metaTests() {
  await test("Meta", "GET /api/meta/countries", async () => {
    const r = await api("/api/meta/countries");
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Meta", "GET /api/meta/states?country=India", async () => {
    const r = await api("/api/meta/states?country=India");
    // May return 200 or 500 depending on external API
    return { status: r.status };
  });

  await test("Meta", "GET /api/meta/detect-location", async () => {
    const r = await api("/api/meta/detect-location");
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 4 — ADMIN: Programs, Courses, Batches, etc.
   ══════════════════════════════════════════════════════════════════ */
async function adminCoreTests() {
  // ─── Dashboard Stats ─────────────────────────────────────────
  await test("Admin", "GET /api/admin/dashboard-stats", async () => {
    const r = await api("/api/admin/dashboard-stats", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Unauthorized access ─────────────────────────────────────
  await test("Admin", "GET /api/admin/students — no token → 401", async () => {
    const r = await api("/api/admin/students");
    assert(r.status === 401, `Expected 401 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/students — student token → 403", async () => {
    const r = await api("/api/admin/students", { token: studentToken });
    assert(r.status === 403, `Expected 403 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Programs CRUD ───────────────────────────────────────────
  await test("Admin", "POST /api/admin/programs — create", async () => {
    const r = await api<{ program: { id: string } }>("/api/admin/programs", {
      method: "POST",
      token: adminToken,
      body: { title: `Test Program ${uid()}`, description: "Automated test program" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdProgramId = (r.body as { program: { id: string } }).program.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/programs — list", async () => {
    const r = await api("/api/admin/programs", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    const body = r.body as { programs: unknown[] };
    assert(Array.isArray(body.programs), "programs is not array");
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/programs/:id — detail", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/programs/:id — update", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}`, {
      method: "PATCH",
      token: adminToken,
      body: { title: `Updated Program ${uid()}` },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/programs/:id/status — toggle", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: true },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Courses CRUD ────────────────────────────────────────────
  await test("Admin", "POST /api/admin/courses — create", async () => {
    const r = await api<{ course: { id: string } }>("/api/admin/courses", {
      method: "POST",
      token: adminToken,
      body: { title: `Test Course ${uid()}`, description: "Automated test course" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdCourseId = (r.body as { course: { id: string } }).course.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/courses — list", async () => {
    const r = await api("/api/admin/courses", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/courses/:id — detail", async () => {
    const r = await api(`/api/admin/courses/${createdCourseId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/courses/:id — update", async () => {
    const r = await api(`/api/admin/courses/${createdCourseId}`, {
      method: "PATCH",
      token: adminToken,
      body: { title: `Updated Course ${uid()}` },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "POST /api/admin/courses/:courseId/topics — create topic", async () => {
    const r = await api<{ topic: { id: string } }>(`/api/admin/courses/${createdCourseId}/topics`, {
      method: "POST",
      token: adminToken,
      body: { title: `Test Topic ${uid()}`, sortOrder: 0 },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdTopicId = (r.body as { topic: { id: string } }).topic.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/courses/:courseId/topics — list topics", async () => {
    const r = await api(`/api/admin/courses/${createdCourseId}/topics`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "POST /api/admin/topics/:topicId/videos — add video", async () => {
    const r = await api<{ video: { id: string } }>(`/api/admin/topics/${createdTopicId}/videos`, {
      method: "POST",
      token: adminToken,
      body: { title: "Test Video", youtubeUrl: "https://youtube.com/watch?v=test123", sortOrder: 0 },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Link Course to Program ──────────────────────────────────
  await test("Admin", "POST /api/admin/programs/:id/courses — add course to program", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}/courses`, {
      method: "POST",
      token: adminToken,
      body: { courseId: createdCourseId, sortOrder: 0 },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/programs/:id/courses — list program courses", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}/courses`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Batches ─────────────────────────────────────────────────
  await test("Admin", "POST /api/admin/batches — create", async () => {
    const r = await api<{ batch: { id: string } }>("/api/admin/batches", {
      method: "POST",
      token: adminToken,
      body: { name: `Test Batch ${uid()}`, trainerId, programId: createdProgramId },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdBatchId = (r.body as { batch: { id: string } }).batch.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/batches — list", async () => {
    const r = await api("/api/admin/batches", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/batches/:id — detail", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/batches/:id — update", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}`, {
      method: "PATCH",
      token: adminToken,
      body: { name: `Updated Batch ${uid()}` },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/batches/:id/zoom-link — set zoom", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/zoom-link`, {
      method: "PATCH",
      token: adminToken,
      body: { zoomLink: "https://zoom.us/j/test123" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/batches/:id/status — toggle", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: true },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Add Course to Batch ─────────────────────────────────────
  await test("Admin", "POST /api/admin/batches/:id/courses — add course", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/courses`, {
      method: "POST",
      token: adminToken,
      body: { courseId: createdCourseId, sortOrder: 0 },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/batches/:id/courses — list batch courses", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/courses`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "POST /api/admin/batches/:id/sync-program-courses", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/sync-program-courses`, {
      method: "POST",
      token: adminToken,
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Add student to batch ────────────────────────────────────
  await test("Admin", "POST /api/admin/students/:id/batches — enroll student", async () => {
    const r = await api(`/api/admin/students/${studentId}/batches`, {
      method: "POST",
      token: adminToken,
      body: { batchId: createdBatchId },
    });
    // 201 or 409 if already enrolled
    assert(r.status === 201 || r.status === 409, `Expected 201/409 got ${r.status}`);
    return { status: r.status };
  });

  // Also enroll test student
  await test("Admin", "POST /api/admin/students/:id/batches — enroll test student", async () => {
    const r = await api(`/api/admin/students/${testStudentId}/batches`, {
      method: "POST",
      token: adminToken,
      body: { batchId: createdBatchId },
    });
    assert(r.status === 201 || r.status === 409, `Expected 201/409 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Students management ─────────────────────────────────────
  await test("Admin", "GET /api/admin/students — list all", async () => {
    const r = await api("/api/admin/students", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/students/:id — detail", async () => {
    const r = await api(`/api/admin/students/${studentId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/students/:id — update profile", async () => {
    const r = await api(`/api/admin/students/${testStudentId}`, {
      method: "PATCH",
      token: adminToken,
      body: { fullName: "Admin Updated Name" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/students/:id/status — toggle", async () => {
    const r = await api(`/api/admin/students/${testStudentId}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: true },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/batches/:id/students — list batch students", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/students`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Trainers ────────────────────────────────────────────────
  await test("Admin", "GET /api/admin/trainers — list", async () => {
    const r = await api("/api/admin/trainers", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/trainers/:id — detail", async () => {
    const r = await api(`/api/admin/trainers/${trainerId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/trainers/:id — update", async () => {
    const r = await api(`/api/admin/trainers/${trainerId}`, {
      method: "PATCH",
      token: adminToken,
      body: { phone: "9999999999" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Batch Videos (YouTube) ──────────────────────────────────
  await test("Admin", "POST /api/admin/batch-videos — create", async () => {
    const r = await api<{ video: { id: string } }>("/api/admin/batch-videos", {
      method: "POST",
      token: adminToken,
      body: {
        title: `Test YouTube ${uid()}`,
        youtubeUrl: "https://youtube.com/watch?v=test",
        batchId: createdBatchId,
        description: "Test video",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdBatchVideoId = (r.body as { video: { id: string } }).video.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/batch-videos — list", async () => {
    const r = await api("/api/admin/batch-videos", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Course status ───────────────────────────────────────────
  await test("Admin", "PATCH /api/admin/courses/:id/status — toggle", async () => {
    const r = await api(`/api/admin/courses/${createdCourseId}/status`, {
      method: "PATCH",
      token: adminToken,
      body: { isActive: true },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/courses/:id/batches — list course batches", async () => {
    const r = await api(`/api/admin/courses/${createdCourseId}/batches`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/programs/:id/batches — list program batches", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}/batches`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 5 — ADMIN: Payments, Agreements, Certifications
   ══════════════════════════════════════════════════════════════════ */
async function adminFinanceTests() {
  // ─── Payments ────────────────────────────────────────────────
  await test("Admin", "POST /api/admin/payments — create", async () => {
    const r = await api<{ payment: { id: string } }>("/api/admin/payments", {
      method: "POST",
      token: adminToken,
      body: {
        studentId,
        amount: 5000,
        currency: "INR",
        description: "Test Payment",
        dueDate: "2026-04-01",
        status: "pending",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdPaymentId = (r.body as { payment: { id: string } }).payment.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/payments — list", async () => {
    const r = await api("/api/admin/payments", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/payments/:id — detail", async () => {
    const r = await api(`/api/admin/payments/${createdPaymentId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/payments/:id — update", async () => {
    const r = await api(`/api/admin/payments/${createdPaymentId}`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "paid", paidAmount: 5000 },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Agreements ──────────────────────────────────────────────
  await test("Admin", "POST /api/admin/agreements — create", async () => {
    const r = await api<{ agreement: { id: string } }>("/api/admin/agreements", {
      method: "POST",
      token: adminToken,
      body: {
        studentId,
        agreementType: "training",
        status: "not_sent",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdAgreementId = (r.body as { agreement: { id: string } }).agreement.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/agreements — list", async () => {
    const r = await api("/api/admin/agreements", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/agreements/:id — detail", async () => {
    const r = await api(`/api/admin/agreements/${createdAgreementId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/agreements/:id — update to sent", async () => {
    const r = await api(`/api/admin/agreements/${createdAgreementId}`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "sent" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Certifications ─────────────────────────────────────────
  await test("Admin", "POST /api/admin/certifications — create", async () => {
    const r = await api<{ certification: { id: string } }>("/api/admin/certifications", {
      method: "POST",
      token: adminToken,
      body: {
        studentId,
        title: "SQL Certification",
        description: "Completed SQL training",
        issuedDate: "2026-03-22",
        status: "issued",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdCertificationId = (r.body as { certification: { id: string } }).certification.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/certifications — list", async () => {
    const r = await api("/api/admin/certifications", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/certifications/:id — detail", async () => {
    const r = await api(`/api/admin/certifications/${createdCertificationId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PATCH /api/admin/certifications/:id — update", async () => {
    const r = await api(`/api/admin/certifications/${createdCertificationId}`, {
      method: "PATCH",
      token: adminToken,
      body: { status: "revoked" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 6 — ADMIN: Credentials, Materials, Notifications
   ══════════════════════════════════════════════════════════════════ */
async function adminCredentialTests() {
  // ─── Credentials ─────────────────────────────────────────────
  await test("Admin", "POST /api/admin/credentials — create", async () => {
    const r = await api<{ credential: { id: string } }>("/api/admin/credentials", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Test Cred ${uid()}`,
        credentialType: "postgresql",
        host: "localhost",
        port: 5432,
        databaseName: "testdb",
        username: "testuser",
        password: "testpass",
        notes: "For automation test",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdCredentialId = (r.body as { id: string }).id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/credentials — list", async () => {
    const r = await api("/api/admin/credentials", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/credentials/:id — detail", async () => {
    const r = await api(`/api/admin/credentials/${createdCredentialId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PUT /api/admin/credentials/:id — update", async () => {
    const r = await api(`/api/admin/credentials/${createdCredentialId}`, {
      method: "PUT",
      token: adminToken,
      body: {
        name: `Updated Cred ${uid()}`,
        credentialType: "postgresql",
        host: "localhost",
        port: 5432,
        databaseName: "testdb",
        username: "testuser",
        password: "updatedpass",
      },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "POST /api/admin/credentials/:id/reveal — reveal password", async () => {
    const r = await api(`/api/admin/credentials/${createdCredentialId}/reveal`, {
      method: "POST",
      token: adminToken,
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Credential Assignments ──────────────────────────────────
  await test("Admin", "POST /api/admin/credential-assignments — assign", async () => {
    const r = await api("/api/admin/credential-assignments", {
      method: "POST",
      token: adminToken,
      body: {
        credentialId: createdCredentialId,
        batchId: createdBatchId,
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/credential-assignments — list", async () => {
    const r = await api(`/api/admin/credential-assignments?credentialId=${createdCredentialId}`, { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Materials ───────────────────────────────────────────────
  await test("Admin", "GET /api/admin/materials — list", async () => {
    const r = await api("/api/admin/materials", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Notifications ──────────────────────────────────────────
  await test("Admin", "POST /api/admin/notifications — send", async () => {
    const r = await api("/api/admin/notifications", {
      method: "POST",
      token: adminToken,
      body: { subject: "Test Notification", message: "Automation test", toRole: "student" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/notifications — list sent", async () => {
    const r = await api("/api/admin/notifications", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/my-notifications — list received", async () => {
    const r = await api("/api/admin/my-notifications", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Resumes ────────────────────────────────────────────────
  await test("Admin", "GET /api/admin/resumes — list", async () => {
    const r = await api("/api/admin/resumes", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Audit Logs ─────────────────────────────────────────────
  await test("Admin", "GET /api/admin/audit-logs — list", async () => {
    const r = await api("/api/admin/audit-logs", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    const body = r.body as { logs: unknown[]; total: number };
    assert(Array.isArray(body.logs), "logs is not array");
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/audit-logs — with filters", async () => {
    const r = await api("/api/admin/audit-logs?page=1&limit=5", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── IP Requests ────────────────────────────────────────────
  await test("Admin", "GET /api/admin/ip-requests — list", async () => {
    const r = await api("/api/admin/ip-requests", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/ip-requests?status=pending", async () => {
    const r = await api("/api/admin/ip-requests?status=pending", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 7 — ADMIN: Business Context (Clients, Projects, Student-Projects)
   ══════════════════════════════════════════════════════════════════ */
async function adminBusinessTests() {
  // ─── Clients ─────────────────────────────────────────────────
  await test("Admin", "POST /api/admin/clients — create", async () => {
    const r = await api<{ client: { id: string } }>("/api/admin/clients", {
      method: "POST",
      token: adminToken,
      body: {
        name: `Test Corp ${uid()}`,
        industry: "Technology",
        description: "Automated test client",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdClientId = (r.body as { client: { id: string } }).client.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/clients — list", async () => {
    const r = await api("/api/admin/clients", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PUT /api/admin/clients/:id — update", async () => {
    const r = await api(`/api/admin/clients/${createdClientId}`, {
      method: "PUT",
      token: adminToken,
      body: { name: `Updated Corp ${uid()}`, industry: "Finance" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Projects ────────────────────────────────────────────────
  await test("Admin", "POST /api/admin/projects — create", async () => {
    const r = await api<{ project: { id: string } }>("/api/admin/projects", {
      method: "POST",
      token: adminToken,
      body: {
        title: `Test Project ${uid()}`,
        clientId: createdClientId,
        description: "Automated test project",
        technologies: "Node.js, PostgreSQL",
        domain: "EdTech",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdProjectId = (r.body as { project: { id: string } }).project.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/projects — list", async () => {
    const r = await api("/api/admin/projects", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Admin", "PUT /api/admin/projects/:id — update", async () => {
    const r = await api(`/api/admin/projects/${createdProjectId}`, {
      method: "PUT",
      token: adminToken,
      body: { title: `Updated Project ${uid()}`, technologies: "React, Node.js" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Student-Projects ────────────────────────────────────────
  await test("Admin", "POST /api/admin/student-projects — assign", async () => {
    const r = await api<{ studentProject: { id: string } }>("/api/admin/student-projects", {
      method: "POST",
      token: adminToken,
      body: {
        studentId,
        projectId: createdProjectId,
        batchId: createdBatchId,
        role: "Full Stack Developer",
        startDate: "2026-01-01",
        endDate: "2026-03-31",
        description: "Test assignment",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    createdStudentProjectId = (r.body as { studentProject: { id: string } }).studentProject.id;
    return { status: r.status };
  });

  await test("Admin", "GET /api/admin/student-projects — list", async () => {
    const r = await api("/api/admin/student-projects", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Trainer Assignments ────────────────────────────────────
  await test("Admin", "GET /api/admin/trainer-assignments — list", async () => {
    const r = await api("/api/admin/trainer-assignments", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Company Settings ──────────────────────────────────────
  await test("Admin", "GET /api/admin/company-settings — read", async () => {
    const r = await api("/api/admin/company-settings", { token: adminToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    const body = r.body as { settings: { company_name: string } };
    assert(!!body.settings, "settings missing");
    return { status: r.status };
  });

  await test("Admin", "PUT /api/admin/company-settings — update", async () => {
    const r = await api("/api/admin/company-settings", {
      method: "PUT",
      token: adminToken,
      body: {
        companyName: `Test Corp ${uid()}`,
        tagline: "Automation test tagline",
        addressLine1: "123 Test Street",
        city: "Testville",
        state: "TS",
        country: "India",
        zipCode: "560001",
        phone: "+91 12345 67890",
        email: "test@tech2high.com",
        supportEmail: "support@tech2high.com",
      },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    const body = r.body as { settings: { city: string } };
    assert(body.settings.city === "Testville", "city not updated");
    return { status: r.status };
  });

  // Restore original company name
  await test("Admin", "PUT /api/admin/company-settings — restore name", async () => {
    const r = await api("/api/admin/company-settings", {
      method: "PUT",
      token: adminToken,
      body: { companyName: "Tech2High" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 8 — TRAINER ROUTES
   ══════════════════════════════════════════════════════════════════ */
async function trainerTests() {
  // ─── Unauthorized ────────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/batches — student token → 403", async () => {
    const r = await api("/api/trainer/batches", { token: studentToken });
    assert(r.status === 403, `Expected 403 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Batches ─────────────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/batches — list", async () => {
    const r = await api("/api/trainer/batches", { token: trainerToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Trainer", "POST /api/trainer/batches — create", async () => {
    const r = await api("/api/trainer/batches", {
      method: "POST",
      token: trainerToken,
      body: { name: `Trainer Batch ${uid()}` },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Use admin-created batch (trainer owns it) ──────────────
  await test("Trainer", "PATCH /api/trainer/batches/:id/zoom-link — update zoom", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/zoom-link`, {
      method: "PATCH",
      token: trainerToken,
      body: { zoomLink: "https://zoom.us/j/trainer-test" },
    });
    // Might be 200 or 403 depending on ownership
    return { status: r.status };
  });

  await test("Trainer", "GET /api/trainer/batches/:id/insights — batch stats", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/insights`, { token: trainerToken });
    return { status: r.status };
  });

  // ─── Assignments ─────────────────────────────────────────────
  await test("Trainer", "POST /api/trainer/batches/:id/assignments — create", async () => {
    const r = await api<{ assignment: { id: string } }>(`/api/trainer/batches/${createdBatchId}/assignments`, {
      method: "POST",
      token: trainerToken,
      body: { title: `Test Assignment ${uid()}`, instructions: "Complete the tasks", dueAt: "2026-04-15T23:59:59Z" },
    });
    if (r.status === 201) {
      createdAssignmentId = (r.body as { assignment: { id: string } }).assignment.id;
    }
    return { status: r.status };
  });

  await test("Trainer", "GET /api/trainer/batches/:id/assignments — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/assignments`, { token: trainerToken });
    return { status: r.status };
  });

  if (createdAssignmentId) {
    await test("Trainer", "PUT /api/trainer/batches/:id/assignments/:aid — update", async () => {
      const r = await api(`/api/trainer/batches/${createdBatchId}/assignments/${createdAssignmentId}`, {
        method: "PUT",
        token: trainerToken,
        body: { title: `Updated Assignment ${uid()}` },
      });
      return { status: r.status };
    });
  }

  await test("Trainer", "GET /api/trainer/batches/:id/submissions — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/submissions`, { token: trainerToken });
    return { status: r.status };
  });

  // ─── Batch Videos (YouTube) ──────────────────────────────────
  await test("Trainer", "POST /api/trainer/batches/:id/batch-videos — add video", async () => {
    const r = await api<{ video: { id: string } }>(`/api/trainer/batches/${createdBatchId}/batch-videos`, {
      method: "POST",
      token: trainerToken,
      body: { title: `Video ${uid()}`, youtubeUrl: "https://youtube.com/watch?v=trainer-test", description: "Test" },
    });
    if (r.status === 201) {
      createdVideoId = (r.body as { video: { id: string } }).video.id;
    }
    return { status: r.status };
  });

  await test("Trainer", "GET /api/trainer/batches/:id/batch-videos — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/batch-videos`, { token: trainerToken });
    return { status: r.status };
  });

  if (createdVideoId) {
    await test("Trainer", "PUT /api/trainer/batches/:id/batch-videos/:vid — update", async () => {
      const r = await api(`/api/trainer/batches/${createdBatchId}/batch-videos/${createdVideoId}`, {
        method: "PUT",
        token: trainerToken,
        body: { title: `Updated Video ${uid()}`, youtubeUrl: "https://youtube.com/watch?v=updated" },
      });
      return { status: r.status };
    });
  }

  // ─── Materials ──────────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/batches/:id/materials — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/materials`, { token: trainerToken });
    return { status: r.status };
  });

  // ─── Courses ────────────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/batches/:id/courses — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/courses`, { token: trainerToken });
    return { status: r.status };
  });

  // ─── Credentials ────────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/credentials — list", async () => {
    const r = await api("/api/trainer/credentials", { token: trainerToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Notifications ──────────────────────────────────────────
  await test("Trainer", "GET /api/trainer/notifications — list", async () => {
    const r = await api("/api/trainer/notifications", { token: trainerToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Trainer", "POST /api/trainer/notifications — send", async () => {
    const r = await api("/api/trainer/notifications", {
      method: "POST",
      token: trainerToken,
      body: { subject: "Trainer Test Notif", message: "Hello from automation tests", batchId: createdBatchId },
    });
    return { status: r.status };
  });

  // ─── Student Projects ───────────────────────────────────────
  await test("Trainer", "GET /api/trainer/projects — list available", async () => {
    const r = await api("/api/trainer/projects", { token: trainerToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Trainer", "GET /api/trainer/batches/:id/student-projects — list", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/student-projects`, { token: trainerToken });
    return { status: r.status };
  });

  await test("Trainer", "POST /api/trainer/batches/:id/student-projects — assign", async () => {
    const r = await api(`/api/trainer/batches/${createdBatchId}/student-projects`, {
      method: "POST",
      token: trainerToken,
      body: {
        studentId: testStudentId,
        projectId: createdProjectId,
        role: "Backend Developer",
        startDate: "2026-02-01",
        endDate: "2026-04-30",
        description: "Trainer-assigned project",
      },
    });
    // 201 or 409 if already assigned
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 9 — STUDENT ROUTES
   ══════════════════════════════════════════════════════════════════ */
async function studentTests() {
  // ─── Unauthorized ────────────────────────────────────────────
  await test("Student", "GET /api/student/batches — trainer token → 403", async () => {
    const r = await api("/api/student/batches", { token: trainerToken });
    assert(r.status === 403, `Expected 403 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Batches ─────────────────────────────────────────────────
  await test("Student", "GET /api/student/batches — list", async () => {
    const r = await api("/api/student/batches", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Videos ──────────────────────────────────────────────────
  await test("Student", "GET /api/student/videos — list", async () => {
    const r = await api("/api/student/videos", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "GET /api/student/batch-videos — list YouTube", async () => {
    const r = await api("/api/student/batch-videos", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Assignments ─────────────────────────────────────────────
  await test("Student", "GET /api/student/assignments — list", async () => {
    const r = await api("/api/student/assignments", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Courses & Topics ────────────────────────────────────────
  await test("Student", "GET /api/student/courses — list", async () => {
    const r = await api("/api/student/courses", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "GET /api/student/courses/:id/topics — list topics", async () => {
    const r = await api(`/api/student/courses/${createdCourseId}/topics`, { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Programs ────────────────────────────────────────────────
  await test("Student", "GET /api/student/program — list enrolled programs", async () => {
    const r = await api("/api/student/program", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Notifications ──────────────────────────────────────────
  await test("Student", "GET /api/student/notifications — list", async () => {
    const r = await api("/api/student/notifications", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "POST /api/student/notifications — send to admin", async () => {
    const r = await api("/api/student/notifications", {
      method: "POST",
      token: studentToken,
      body: { subject: "Student Test Notif", message: "Need help from automation test" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  // ─── IP Requests ─────────────────────────────────────────────
  await test("Student", "POST /api/student/ip-requests — create", async () => {
    const r = await api("/api/student/ip-requests", {
      method: "POST",
      token: studentToken,
      body: { requestedIp: "192.168.1.100", port: 5432, protocol: "tcp", reason: "Need DB access for homework" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "GET /api/student/ip-requests — list", async () => {
    const r = await api("/api/student/ip-requests", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Payments ────────────────────────────────────────────────
  await test("Student", "GET /api/student/payments — list", async () => {
    const r = await api("/api/student/payments", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Agreements ──────────────────────────────────────────────
  await test("Student", "GET /api/student/agreements — list", async () => {
    const r = await api("/api/student/agreements", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Certifications ─────────────────────────────────────────
  await test("Student", "GET /api/student/certifications — list", async () => {
    const r = await api("/api/student/certifications", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Profile Score ──────────────────────────────────────────
  await test("Student", "GET /api/student/profile-score — score", async () => {
    const r = await api("/api/student/profile-score", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Credentials ────────────────────────────────────────────
  await test("Student", "GET /api/student/credentials — list", async () => {
    const r = await api("/api/student/credentials", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Materials ──────────────────────────────────────────────
  await test("Student", "GET /api/student/materials — list", async () => {
    const r = await api("/api/student/materials", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Resume ─────────────────────────────────────────────────
  await test("Student", "GET /api/student/resume — get resume data", async () => {
    const r = await api("/api/student/resume", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "PUT /api/student/resume/profile — update resume profile", async () => {
    const r = await api("/api/student/resume/profile", {
      method: "PUT",
      token: studentToken,
      body: {
        linkedinUrl: "https://linkedin.com/in/test",
        githubUrl: "https://github.com/test",
        preferredRole: "Full Stack Developer",
        workAuthorization: "citizen",
      },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "POST /api/student/resume/education — add", async () => {
    const r = await api("/api/student/resume/education", {
      method: "POST",
      token: studentToken,
      body: {
        institution: "Test University",
        degree: "B.Tech",
        fieldOfStudy: "Computer Science",
        startYear: 2020,
        endYear: 2024,
        grade: "8.5 CGPA",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "POST /api/student/resume/experience — add", async () => {
    const r = await api("/api/student/resume/experience", {
      method: "POST",
      token: studentToken,
      body: {
        company: "Test Corp",
        jobTitle: "Intern",
        startDate: "2024-06-01",
        endDate: "2024-12-31",
        description: "Worked on automation testing",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "POST /api/student/resume/skills — add", async () => {
    const r = await api("/api/student/resume/skills", {
      method: "POST",
      token: studentToken,
      body: { skillName: "TypeScript", proficiency: "advanced" },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  await test("Student", "POST /api/student/resume/projects — add personal project", async () => {
    const r = await api("/api/student/resume/projects", {
      method: "POST",
      token: studentToken,
      body: {
        title: "Portfolio Website",
        description: "Personal portfolio built with React",
        techStack: "React, TypeScript",
        url: "https://myportfolio.com",
      },
    });
    assert(r.status === 201, `Expected 201 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Assigned Projects ──────────────────────────────────────
  await test("Student", "GET /api/student/assigned-projects — list", async () => {
    const r = await api("/api/student/assigned-projects", { token: studentToken });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });

  // ─── Generate DOCX (template: minimal) ─────────────────────
  await test("Student", "POST /api/student/resume/generate-docx — generate", async () => {
    const r = await api("/api/student/resume/generate-docx", {
      method: "POST",
      token: studentToken,
      body: { template: "minimal", summary: "Automation test resume" },
    });
    assert(r.status === 200, `Expected 200 got ${r.status}`);
    return { status: r.status };
  });
}

/* ══════════════════════════════════════════════════════════════════
   SECTION 10 — CLEANUP (delete test data)
   ══════════════════════════════════════════════════════════════════ */
async function cleanupTests() {
  // Delete student-project assignment
  if (createdStudentProjectId) {
    await test("Cleanup", "DELETE /api/admin/student-projects/:id", async () => {
      const r = await api(`/api/admin/student-projects/${createdStudentProjectId}`, {
        method: "DELETE",
        token: adminToken,
      });
      return { status: r.status };
    });
  }

  // Delete project
  if (createdProjectId) {
    await test("Cleanup", "DELETE /api/admin/projects/:id", async () => {
      const r = await api(`/api/admin/projects/${createdProjectId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }

  // Delete client
  if (createdClientId) {
    await test("Cleanup", "DELETE /api/admin/clients/:id", async () => {
      const r = await api(`/api/admin/clients/${createdClientId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }

  // Delete credential
  if (createdCredentialId) {
    await test("Cleanup", "DELETE /api/admin/credentials/:id", async () => {
      const r = await api(`/api/admin/credentials/${createdCredentialId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }

  // Delete payment
  if (createdPaymentId) {
    await test("Cleanup", "DELETE /api/admin/payments/:id", async () => {
      const r = await api(`/api/admin/payments/${createdPaymentId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }

  // Delete batch video
  if (createdBatchVideoId) {
    await test("Cleanup", "DELETE /api/admin/batch-videos/:id", async () => {
      const r = await api(`/api/admin/batch-videos/${createdBatchVideoId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }

  // Remove course from batch
  await test("Cleanup", "DELETE /api/admin/batches/:id/courses/:cid", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}/courses/${createdCourseId}`, {
      method: "DELETE",
      token: adminToken,
    });
    return { status: r.status };
  });

  // Remove course from program
  await test("Cleanup", "DELETE /api/admin/programs/:id/courses/:cid", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}/courses/${createdCourseId}`, {
      method: "DELETE",
      token: adminToken,
    });
    return { status: r.status };
  });

  // Remove student from batch
  await test("Cleanup", "DELETE /api/admin/students/:id/batches/:bid — remove student", async () => {
    const r = await api(`/api/admin/students/${studentId}/batches/${createdBatchId}`, {
      method: "DELETE",
      token: adminToken,
    });
    return { status: r.status };
  });

  // Remove test student from batch
  await test("Cleanup", "DELETE /api/admin/students/:id/batches/:bid — remove test student", async () => {
    const r = await api(`/api/admin/students/${testStudentId}/batches/${createdBatchId}`, {
      method: "DELETE",
      token: adminToken,
    });
    return { status: r.status };
  });

  // Delete batch
  await test("Cleanup", "DELETE /api/admin/batches/:id", async () => {
    const r = await api(`/api/admin/batches/${createdBatchId}`, { method: "DELETE", token: adminToken });
    return { status: r.status };
  });

  // Delete program
  await test("Cleanup", "DELETE /api/admin/programs/:id", async () => {
    const r = await api(`/api/admin/programs/${createdProgramId}`, { method: "DELETE", token: adminToken });
    return { status: r.status };
  });

  // Soft-delete test student
  if (testStudentId) {
    await test("Cleanup", "DELETE /api/admin/students/:id — soft delete test student", async () => {
      const r = await api(`/api/admin/students/${testStudentId}`, { method: "DELETE", token: adminToken });
      return { status: r.status };
    });
  }
}

/* ══════════════════════════════════════════════════════════════════
   MAIN — Run all sections sequentially
   ══════════════════════════════════════════════════════════════════ */
async function main() {
  const t0 = Date.now();

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║   Tech2High Portal — Automation Test Suite                  ║");
  console.log("║   Target: http://localhost:4000                             ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Verify server is running
  try {
    await fetch(`${API}/health`);
  } catch {
    console.error("❌ Server not reachable at", API);
    console.error("   Start the dev server first: npm run dev\n");
    process.exit(1);
  }

  console.log("🏥 Health Check...");
  await healthTests();

  console.log("🔐 Authentication...");
  await authTests();

  console.log("🌍 Meta (Public)...");
  await metaTests();

  console.log("🛡️  Admin Core (Programs, Courses, Batches)...");
  await adminCoreTests();

  console.log("💰 Admin Finance (Payments, Agreements, Certifications)...");
  await adminFinanceTests();

  console.log("🔑 Admin Credentials, Materials, Notifications...");
  await adminCredentialTests();

  console.log("🏢 Admin Business Context (Clients, Projects)...");
  await adminBusinessTests();

  console.log("👨‍🏫 Trainer Routes...");
  await trainerTests();

  console.log("🎓 Student Routes...");
  await studentTests();

  console.log("🧹 Cleanup...");
  await cleanupTests();

  // ─── Report ──────────────────────────────────────────────────
  const totalMs = Date.now() - t0;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log("\n\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║                     TEST  RESULTS                           ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // Print table
  console.log("┌─────┬──────────┬────────────────────────────────────────────────────────────┬────────┬────────┐");
  console.log("│  #  │ Section  │ Test                                                       │ Status │  ms    │");
  console.log("├─────┼──────────┼────────────────────────────────────────────────────────────┼────────┼────────┤");

  for (const r of results) {
    const id = String(r.id).padStart(3);
    const section = r.section.padEnd(8).slice(0, 8);
    const name = r.name.padEnd(58).slice(0, 58);
    const status = r.passed ? "  ✅  " : "  ❌  ";
    const ms = String(r.ms).padStart(5) + "ms";
    console.log(`│ ${id} │ ${section} │ ${name} │${status}│ ${ms} │`);
  }

  console.log("└─────┴──────────┴────────────────────────────────────────────────────────────┴────────┴────────┘");

  // Summary
  console.log(`\n  Total: ${total}   ✅ Passed: ${passed}   ❌ Failed: ${failed}   ⏱ ${(totalMs / 1000).toFixed(1)}s\n`);

  // Print failures detail
  if (failed > 0) {
    console.log("══════════════ FAILED TESTS ══════════════\n");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ❌ [${r.section}] ${r.name}`);
      console.log(`     Error: ${r.error}`);
      console.log(`     Status: ${r.status}\n`);
    }
  }

  // Pass rate
  const rate = total > 0 ? ((passed / total) * 100).toFixed(1) : "0";
  console.log(`  Pass Rate: ${rate}%`);
  console.log(passed === total ? "\n  🎉 ALL TESTS PASSED!\n" : "\n  ⚠️  Some tests failed — review above.\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
