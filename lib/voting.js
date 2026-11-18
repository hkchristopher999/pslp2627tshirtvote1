/**
 * Vercel + Neon 持久化投票後端。
 * 所有密碼、DATABASE_URL 和 session key 只在伺服器端使用，絕不傳至瀏覽器。
 */
import crypto from 'node:crypto';
import { neon } from '@neondatabase/serverless';

export const CLASSES = ['PNA','PNB','PNC','PND','K1A','K1B','K1C','K1D','K2A','K2B','K2C','K2D','K2E','K2F','K3A','K3B','K3C','K3D'];
const NUM_WORKS = 16;
const MAX_VOTES = 99999;
const SESSION_SECONDS = 8 * 60 * 60;
const PASSWORD_SUFFIX = process.env.VOTE_PASSWORD_SUFFIX || '111111';
let sql;
let schemaPromise;

function settingsOk() {
  if (!process.env.DATABASE_URL) throw new SetupError('尚未連接資料庫：請在 Vercel Storage / Marketplace 安裝 Neon 並確認 DATABASE_URL。');
  if (!process.env.VOTE_SESSION_SECRET || process.env.VOTE_SESSION_SECRET.length < 32) {
    throw new SetupError('尚未設定 VOTE_SESSION_SECRET（至少 32 個隨機字元）。');
  }
}
export class SetupError extends Error { constructor(message) { super(message); this.name = 'SetupError'; } }
function db() { settingsOk(); return sql ||= neon(process.env.DATABASE_URL); }

// 第一次執行時自動建立兩個資料表，不需手動跑 SQL。
export async function ensureSchema() {
  const query = db();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await query`
        CREATE TABLE IF NOT EXISTS class_votes (
          class_id TEXT PRIMARY KEY,
          votes JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
      await query`
        CREATE TABLE IF NOT EXISTS vote_login_attempts (
          attempt_key TEXT PRIMARY KEY,
          failures INTEGER NOT NULL DEFAULT 0,
          window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )`;
    })().catch(e => { schemaPromise = null; throw e; });
  }
  return schemaPromise;
}

const tokenSignature = message => crypto.createHmac('sha256', process.env.VOTE_SESSION_SECRET).update(message).digest('base64url');
const isHttps = req => req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket?.encrypted);
const cookieName = req => isHttps(req) ? '__Host-classvote' : 'classvote';
export function setAuthCookie(req, res, value, seconds = SESSION_SECONDS) {
  res.setHeader('Set-Cookie', `${cookieName(req)}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Strict${isHttps(req)?'; Secure':''}`);
}
export function issueSession(classId) {
  settingsOk();
  const payload = Buffer.from(JSON.stringify({ classId, expiry: Date.now() + SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${tokenSignature(payload)}`;
}
export function getSession(req) {
  const value = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${cookieName(req)}=`));
  if (!value) return null;
  settingsOk();
  const [payload, signature, extra] = value.slice(cookieName(req).length + 1).split('.');
  if (!payload || !signature || extra) return null;
  try {
    const expected = Buffer.from(tokenSignature(payload));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return null;
    const token = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!CLASSES.includes(token.classId) || !Number.isFinite(token.expiry) || token.expiry < Date.now()) return null;
    return token.classId;
  } catch { return null; }
}
export function secureEquals(a,b) {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha,hb);
}
export function validLogin(classId, password) {
  return CLASSES.includes(classId) && typeof password === 'string' && password.length <= 200 && secureEquals(password, classId + PASSWORD_SUFFIX);
}
export function validVotes(votes) {
  return Array.isArray(votes) && votes.length === NUM_WORKS && votes.every(x => Number.isInteger(x) && x >= 0 && x <= MAX_VOTES);
}
export function requestBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(String(req.body || '{}')); }
  catch { throw new HttpError(400,'傳送的資料不是有效 JSON'); }
}
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    const host = String(req.headers.host || '').toLowerCase();
    if (parsed.host.toLowerCase() === host && ['http:', 'https:'].includes(parsed.protocol)) return;
  } catch {}
  throw new HttpError(403, '來源不符，請重新開啟網站。');
}
export function send(res, status, data) {
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  return res.status(status).json(data);
}
export function method(req, allowed) {
  if (req.method !== allowed) throw new HttpError(405, '不支援的請求方式');
}
export function reportError(res,error) {
  if (error instanceof HttpError) return send(res,error.status,{error:error.message});
  if (error instanceof SetupError) return send(res,503,{error:error.message});
  console.error('Voting API failure:',error);
  return send(res,500,{error:'資料庫連接或伺服器處理失敗。請檢查 Vercel Functions Logs，以及 Neon DATABASE_URL 設定。'});
}
export async function classRecord(classId) {
  await ensureSchema();
  const rows = await db()`SELECT class_id, votes, updated_at FROM class_votes WHERE class_id = ${classId}`;
  const record = rows[0];
  if (!record) return { authenticated: true, classId, votes: null, updatedAt: null };
  const votes = typeof record.votes === 'string' ? JSON.parse(record.votes) : record.votes;
  return { authenticated: true, classId, votes, updatedAt: record.updated_at };
}
export async function saveVotes(classId, votes) {
  await ensureSchema();
  const rows = await db()`
    INSERT INTO class_votes(class_id, votes, updated_at)
    VALUES (${classId}, ${JSON.stringify(votes)}::jsonb, NOW())
    ON CONFLICT (class_id) DO UPDATE
      SET votes = EXCLUDED.votes, updated_at = NOW()
    RETURNING votes, updated_at`;
  return { ok: true, classId, votes, updatedAt: rows[0].updated_at };
}
export async function summary() {
  await ensureSchema();
  const rows = await db()`SELECT class_id, votes, updated_at FROM class_votes`;
  const totals = Array(NUM_WORKS).fill(0);
  const classes = Object.fromEntries(CLASSES.map(c => [c,{submitted:false,updatedAt:null}]));
  let submittedClasses=0;
  for (const row of rows) {
    if (!CLASSES.includes(row.class_id)) continue;
    const votes = typeof row.votes === 'string' ? JSON.parse(row.votes) : row.votes;
    if (!validVotes(votes)) continue;
    submittedClasses++;
    classes[row.class_id] = { submitted: true, updatedAt: row.updated_at };
    votes.forEach((n,i)=>totals[i]+=n);
  }
  return { totals, grandTotal: totals.reduce((a,b)=>a+b,0), submittedClasses, classes };
}
const attemptKey = (req,classId) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
  return crypto.createHash('sha256').update(`${ip}:${classId}`).digest('hex');
};
export async function checkLoginAllowed(req, classId) {
  await ensureSchema();
  const key=attemptKey(req,classId);
  const rows=await db()`SELECT failures,window_start FROM vote_login_attempts WHERE attempt_key=${key}`;
  if (rows.length && Date.now() - new Date(rows[0].window_start).getTime() < 15*60*1000 && rows[0].failures >= 8) {
    throw new HttpError(429,'登入失敗次數過多，請 15 分鐘後再試');
  }
  return key;
}
export async function logLoginFailure(key) {
  await db()`
    INSERT INTO vote_login_attempts (attempt_key,failures,window_start) VALUES (${key},1,NOW())
    ON CONFLICT (attempt_key) DO UPDATE SET
    failures=CASE WHEN vote_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN 1 ELSE vote_login_attempts.failures + 1 END,
    window_start=CASE WHEN vote_login_attempts.window_start < NOW() - INTERVAL '15 minutes' THEN NOW() ELSE vote_login_attempts.window_start END`;
}
export async function clearLoginFailures(key) {
  await db()`DELETE FROM vote_login_attempts WHERE attempt_key=${key}`;
}
