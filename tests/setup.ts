/**
 * Test setup – shared helpers for the Tech2High Portal API test suite.
 * Tests run against the live dev server on http://localhost:4000.
 */

export const API = "http://localhost:4000";

/* ── Shared state that accumulates across test files ─────────────── */
export const state: Record<string, string> = {};

/* ── Generic fetch helper with JSON parsing ──────────────────────── */
interface Res<T = unknown> {
  status: number;
  ok: boolean;
  body: T;
  headers: Headers;
}

export async function api<T = unknown>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    token?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<Res<T>> {
  const { method = "GET", body, token, headers = {} } = opts;
  const h: Record<string, string> = { ...headers };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (body && !h["Content-Type"]) h["Content-Type"] = "application/json";

  const res = await fetch(`${API}${path}`, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: res.status, ok: res.ok, body: parsed as T, headers: res.headers };
}

/* ── Auth helpers ────────────────────────────────────────────────── */
export async function login(
  email: string,
  password: string
): Promise<{ token: string; user: Record<string, unknown> }> {
  const res = await api<{ token: string; user: Record<string, unknown> }>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function register(data: {
  email: string;
  password: string;
  fullName: string;
  role?: string;
  phone?: string;
}): Promise<{ token: string; user: Record<string, unknown> }> {
  const res = await api<{ token: string; user: Record<string, unknown> }>("/api/auth/register", {
    method: "POST",
    body: data,
  });
  return res.body;
}

/* ── Unique-id generator for test data ───────────────────────────── */
let seq = 0;
export function uid(prefix = "test"): string {
  return `${prefix}_${Date.now()}_${++seq}`;
}

/* ── Test-result tracking ────────────────────────────────────────── */
export interface TestResult {
  name: string;
  passed: boolean;
  status?: number;
  error?: string;
  duration: number;
}

export const results: TestResult[] = [];

export function record(name: string, passed: boolean, extra?: { status?: number; error?: string; duration: number }) {
  results.push({ name, passed, ...extra, duration: extra?.duration ?? 0 });
}
