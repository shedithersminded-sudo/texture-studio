// Owner authentication. The password never gets stored. It derives a key (PBKDF2, 310k rounds)
// that unwraps the random data key used to encrypt every record and image.
import * as db from './db.js';
import * as C from './crypto.js';
import * as S from './store.js';

let dataKey = null; let lastReauth = 0;
const norm = u => u.trim().toLowerCase();
export const getMeta = () => db.meta.get('auth');
export const isSetup = async () => !!(await getMeta());

export async function secEvent(msg, level = 'info') {
  const list = (await db.meta.get('secEvents')) || [];
  list.unshift({ ts: Date.now(), msg, level }); list.length = Math.min(list.length, 300);
  await db.meta.set('secEvents', list);
}
export const secEvents = async () => (await db.meta.get('secEvents')) || [];

export async function setup({ username, password, email, questions }) {
  if (await isSetup()) throw new Error('Setup has already been completed.');
  const key = await C.newDataKey();
  const userSalt = C.b64(C.rand(16));
  const codes = Array.from({ length: 8 }, C.recoveryCode);
  const meta = {
    v: 1, created: Date.now(), userSalt, userHash: await C.sha256(userSalt + norm(username)),
    pw: await C.lockWith(key, password),
    recovery: await Promise.all(codes.map(c => C.lockWith(key, c, 120000))),
    questions: null, totp: false, fails: 0, lockUntil: 0,
  };
  if (questions?.length) meta.questions = { list: questions.map(q => q.q), rec: await C.lockWith(key, answersSecret(questions.map(q => q.a))) };
  await db.meta.set('auth', meta);
  dataKey = key; S.setKey(key); await S.loadAll();
  const s = S.settings(); s.security.email = email || ''; s.owner = username.trim(); await S.save(s);
  await secEvent('Administrator account created'); await S.log('security', 'Administrator account created');
  lastReauth = Date.now();
  return codes;
}
const answersSecret = arr => arr.map(a => a.trim().toLowerCase().replace(/\s+/g, ' ')).join('|');

export async function login(username, password) {
  const m = await getMeta();
  if (m.lockUntil > Date.now()) throw new Error(`Too many attempts. Try again in ${Math.ceil((m.lockUntil - Date.now()) / 1000)} seconds.`);
  const userOk = (await C.sha256(m.userSalt + norm(username))) === m.userHash;
  let key = null;
  try { key = await C.openWith(m.pw, password); } catch { key = null; }
  if (!userOk || !key) {
    m.fails = (m.fails || 0) + 1;
    if (m.fails >= 5) { m.lockUntil = Date.now() + Math.min(30 * 60000, 60000 * 2 ** (m.fails - 5)); }
    await db.meta.set('auth', m); await secEvent(`Failed sign-in attempt (${m.fails} in a row)`, 'warn');
    throw new Error('Wrong username or password.' + (m.fails >= 3 ? ` ${m.fails} failed attempts.` : ''));
  }
  m.fails = 0; m.lockUntil = 0; await db.meta.set('auth', m);
  return key;
}
export async function finishLogin(key) {
  dataKey = key; S.setKey(key); await S.loadAll(); lastReauth = Date.now();
  await secEvent('Signed in'); await S.log('security', 'Signed in');
}
export const needsTotp = async () => !!(await getMeta()).totp;

export async function verifyPassword(password) {
  const m = await getMeta();
  try { await C.openWith(m.pw, password); lastReauth = Date.now(); return true; }
  catch { await secEvent('Failed re-authentication', 'warn'); return false; }
}
export const recentlyReauthed = () => Date.now() - lastReauth < (S.settings().security.reauthMin || 5) * 60000;

export async function changePassword(oldPw, newPw) {
  if (!(await verifyPassword(oldPw))) throw new Error('Current password is wrong.');
  const m = await getMeta(); m.pw = await C.lockWith(dataKey, newPw); await db.meta.set('auth', m);
  await secEvent('Password changed'); await S.log('security', 'Password changed');
}
export async function changeUsername(newName) {
  const m = await getMeta(); m.userHash = await C.sha256(m.userSalt + norm(newName)); await db.meta.set('auth', m);
  const s = S.settings(); s.owner = newName.trim(); await S.save(s); await secEvent('Username changed');
}
export async function regenerateCodes() {
  const codes = Array.from({ length: 8 }, C.recoveryCode); const m = await getMeta();
  m.recovery = await Promise.all(codes.map(c => C.lockWith(dataKey, c, 120000))); await db.meta.set('auth', m);
  await secEvent('Recovery codes regenerated'); return codes;
}
export async function setQuestions(qs) {
  const m = await getMeta();
  m.questions = qs?.length ? { list: qs.map(q => q.q), rec: await C.lockWith(dataKey, answersSecret(qs.map(q => q.a))) } : null;
  await db.meta.set('auth', m); await secEvent(qs?.length ? 'Security questions updated' : 'Security questions removed');
}
// Recovery: a code or the answers unwrap the data key, then the owner sets a new password.
export async function recoverWithCode(code) {
  const m = await getMeta(); const c = C.normCode(code);
  for (let i = 0; i < m.recovery.length; i++) {
    try { const key = await C.openWith(m.recovery[i], c); m.recovery.splice(i, 1); await db.meta.set('auth', m); await secEvent('Recovery code used', 'warn'); return key; } catch { }
  }
  await secEvent('Failed recovery attempt', 'warn'); throw new Error('That recovery code is not valid or was already used.');
}
export async function recoverWithAnswers(answers) {
  const m = await getMeta(); if (!m.questions) throw new Error('No security questions are set.');
  try { const key = await C.openWith(m.questions.rec, answersSecret(answers)); await secEvent('Recovered with security questions', 'warn'); return key; }
  catch { await secEvent('Failed security question recovery', 'warn'); throw new Error('Those answers do not match.'); }
}
export async function resetPasswordWithKey(key, newPw) {
  const m = await getMeta(); m.pw = await C.lockWith(key, newPw); m.fails = 0; m.lockUntil = 0; await db.meta.set('auth', m);
  await secEvent('Password reset through recovery', 'warn');
}
export async function setTotp(secret) {
  const m = await getMeta(); m.totp = !!secret; await db.meta.set('auth', m);
  const s = S.settings(); s.security.totpSecret = secret; await S.save(s);
  await secEvent(secret ? 'Two-factor sign-in enabled' : 'Two-factor sign-in disabled'); await S.log('security', secret ? 'Two-factor enabled' : 'Two-factor disabled');
}
export async function checkTotp(code) { const sec = S.settings().security.totpSecret; return sec ? C.verifyTotp(sec, code) : true; }
export const currentKey = () => dataKey;
export async function lock(reason = 'Signed out') {
  try { await secEvent(reason); await S.log('security', reason); } catch { }
  dataKey = null; S.setKey(null); location.hash = ''; location.reload();
}
