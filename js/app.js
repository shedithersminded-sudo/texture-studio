import { h, $, clear, icon, toast, modal, fmtBytes, onTasks, debounce } from './core/ui.js';
import * as S from './core/store.js';
import * as A from './core/auth.js';
import { NAV, HIDDEN, nav } from './core/nav.js';
import { passwordScore, base32, rand } from './core/crypto.js';
import { autoBackupTick } from './core/backup.js';

const root = document.getElementById('app');
window.addEventListener('error', e => { if (S.hasKey()) S.err('Unhandled error', e.error || e.message); });
window.addEventListener('unhandledrejection', e => { if (S.hasKey()) S.err('Unhandled promise', e.reason); });

function applyLook() {
  const s = S.settings(), d = document.documentElement;
  d.dataset.theme = s.theme; d.style.setProperty('--accent', s.accent);
  const c = parseInt(s.accent.slice(1), 16), lum = ((c >> 16 & 255) * .299 + (c >> 8 & 255) * .587 + (c & 255) * .114);
  d.style.setProperty('--accent-ink', lum > 150 ? '#0d0e11' : '#ffffff');
  document.body.classList.toggle('beginner', s.mode === 'beginner');
}
export { applyLook };

// ====================== AUTH SCREENS ======================
function meter(inp) {
  const bar = h('i'); const m = h('div', { class: 'meter' }, bar); const lbl = h('div', { class: 'small muted' });
  inp.addEventListener('input', () => { const s = passwordScore(inp.value); bar.style.width = (s + 1) * 20 + '%'; bar.style.background = ['#ef6262', '#ef6262', '#e7ad47', '#47c28a', '#47c28a'][s]; lbl.textContent = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][s]; });
  return [m, lbl];
}
function authBox(...kids) { clear(root); root.append(h('div', { class: 'auth' }, h('div', { class: 'box' }, h('div', { class: 'brand' }, h('div', { class: 'logo' }), h('span', null, 'Ultimate Texture Studio')), ...kids))); }

function setupScreen() {
  const u = h('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' }), p = h('input', { type: 'password', autocomplete: 'new-password' }), p2 = h('input', { type: 'password', autocomplete: 'new-password' });
  const email = h('input', { type: 'email', placeholder: 'Optional' }); const err = h('div', { class: 'err' });
  const useQ = h('input', { type: 'checkbox' }); const qs = [0, 1].map(i => ({ q: h('input', { type: 'text', placeholder: ['e.g. First pet name?', 'e.g. City you grew up in?'][i] }), a: h('input', { type: 'text', placeholder: 'Answer' }) }));
  const qBox = h('div', { hidden: true }, qs.map((q, i) => h('div', { class: 'g2' }, h('div', { class: 'f' }, h('label', null, 'Question ' + (i + 1)), q.q), h('div', { class: 'f' }, h('label', null, 'Answer'), q.a))));
  useQ.onchange = () => qBox.hidden = !useQ.checked;
  const btn = h('button', { class: 'btn pri', style: { width: '100%', justifyContent: 'center' } }, 'Create administrator account');
  btn.onclick = async () => {
    err.textContent = '';
    if (u.value.trim().length < 3) return err.textContent = 'Username needs at least 3 characters.';
    if (p.value.length < 10) return err.textContent = 'Password needs at least 10 characters.';
    if (passwordScore(p.value) < 2) return err.textContent = 'Password is too weak. Mix upper and lower case, numbers or symbols.';
    if (p.value !== p2.value) return err.textContent = 'Passwords do not match.';
    let questions = null; if (useQ.checked) { questions = qs.map(q => ({ q: q.q.value.trim(), a: q.a.value })); if (questions.some(q => !q.q || q.a.trim().length < 2)) return err.textContent = 'Fill in both questions and answers, or turn them off.'; }
    btn.disabled = true; btn.textContent = 'Creating secure account...';
    try { const codes = await A.setup({ username: u.value, password: p.value, email: email.value, questions }); showCodes(codes, () => startStudio()); }
    catch (e) { err.textContent = e.message; btn.disabled = false; btn.textContent = 'Create administrator account'; }
  };
  authBox(h('h2', null, 'First-time setup'), h('p', { class: 'muted' }, 'Create the owner account for this studio. There is no public sign-up. This screen will not appear again.'),
    h('div', { class: 'f' }, h('label', null, 'Administrator username'), u),
    h('div', { class: 'f' }, h('label', null, 'Password (10+ characters)'), p, ...meter(p)),
    h('div', { class: 'f' }, h('label', null, 'Confirm password'), p2),
    h('div', { class: 'f' }, h('label', null, 'Recovery email'), email, h('div', { class: 'small dim' }, 'Kept for your records. This app has no mail server, so recovery uses codes or questions.')),
    h('label', { class: 'chk' }, useQ, 'Also allow recovery with security questions'), qBox, err, btn,
    h('p', { class: 'small dim', style: { marginTop: '12px' } }, 'Your password is never stored. It unlocks an encryption key that protects all studio data in this browser.'));
}
function showCodes(codes, next) {
  const ok = h('input', { type: 'checkbox' }); const go = h('button', { class: 'btn pri', disabled: true, style: { width: '100%', justifyContent: 'center' } }, 'Continue to studio');
  ok.onchange = () => go.disabled = !ok.checked; go.onclick = next;
  const txt = 'Ultimate Texture Studio recovery codes\nEach code works once.\n\n' + codes.join('\n');
  authBox(h('h2', null, 'Save your recovery codes'), h('p', { class: 'muted' }, 'If you forget your password, one of these codes lets you set a new one. Without them your data cannot be recovered. Store them somewhere safe and offline.'),
    h('div', { class: 'codes' }, codes.map(c => h('div', null, c))),
    h('div', { class: 'row', style: { margin: '12px 0' } }, h('button', { class: 'btn', onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([txt])), download: 'texture-studio-recovery-codes.txt' }); a.click(); } }, icon('download'), 'Download'), h('button', { class: 'btn', onclick: () => { navigator.clipboard.writeText(txt); toast('Copied'); } }, icon('copy'), 'Copy')),
    h('label', { class: 'chk' }, ok, 'I saved my recovery codes'), go);
}
async function loginScreen(msg) {
  const remembered = localStorage.getItem('uts-remember') || '';
  const u = h('input', { type: 'text', value: remembered, autocomplete: 'off', spellcheck: 'false' }), p = h('input', { type: 'password', autocomplete: 'current-password' });
  const rem = h('input', { type: 'checkbox', checked: !!remembered }); const err = h('div', { class: 'err' }, msg || '');
  const btn = h('button', { class: 'btn pri', style: { width: '100%', justifyContent: 'center' } }, icon('lock'), 'Sign in');
  const submit = async () => {
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Checking...';
    try {
      const key = await A.login(u.value, p.value);
      if (rem.checked) localStorage.setItem('uts-remember', u.value.trim()); else localStorage.removeItem('uts-remember');
      sessionStorage.setItem('uts-remembered', rem.checked ? '1' : '');
      if (await A.needsTotp()) return totpScreen(key);
      await A.finishLogin(key); startStudio();
    } catch (e) { err.textContent = e.message; btn.disabled = false; btn.replaceChildren(icon('lock'), 'Sign in'); }
  };
  btn.onclick = submit; p.onkeydown = e => { if (e.key === 'Enter') submit(); };
  authBox(h('h2', null, 'Private studio'), h('p', { class: 'muted' }, 'Sign in as the owner to continue.'),
    h('div', { class: 'f' }, h('label', null, 'Username'), u), h('div', { class: 'f' }, h('label', null, 'Password'), p),
    h('label', { class: 'chk' }, rem, 'Remember this device', h('span', { class: 'tip', 'data-tip': 'Remembers your username and uses the longer idle timeout from Settings. Your password and data key are never saved.' }, '?')),
    err, btn, h('div', { style: { marginTop: '14px', textAlign: 'center' } }, h('a', { href: '#', onclick: e => { e.preventDefault(); recoveryScreen(); } }, 'Forgot password?')));
  (remembered ? p : u).focus();
}
async function totpScreen(key) {
  const c = h('input', { type: 'text', inputmode: 'numeric', maxlength: 6, placeholder: '123456' }); const err = h('div', { class: 'err' });
  const go = async () => {
    S.setKey(key); await S.loadAll();
    if (await A.checkTotp(c.value)) { await A.finishLogin(key); startStudio(); }
    else { S.setKey(null); await A.secEvent('Wrong two-factor code', 'warn'); err.textContent = 'That code is not valid.'; }
  };
  c.onkeydown = e => { if (e.key === 'Enter') go(); };
  authBox(h('h2', null, 'Two-factor code'), h('p', { class: 'muted' }, 'Enter the 6-digit code from your authenticator app.'), h('div', { class: 'f' }, c), err, h('button', { class: 'btn pri', onclick: go }, 'Verify'));
  c.focus();
}
async function recoveryScreen() {
  const m = await A.getMeta(); const err = h('div', { class: 'err' }); const body = h('div');
  const code = h('input', { type: 'text', placeholder: 'XXXXX-XXXXX-XXXXX' });
  const answers = (m.questions?.list || []).map(q => ({ q, a: h('input', { type: 'text' }) }));
  const np = h('input', { type: 'password' }), np2 = h('input', { type: 'password' });
  const finish = async getKey => {
    err.textContent = '';
    if (np.value.length < 10 || passwordScore(np.value) < 2) return err.textContent = 'Choose a stronger new password (10+ characters, mixed).';
    if (np.value !== np2.value) return err.textContent = 'Passwords do not match.';
    try { const key = await getKey(); await A.resetPasswordWithKey(key, np.value); await A.finishLogin(key); toast('Password reset. Generate new recovery codes in Admin, Security.', 'ok', 6000); startStudio(); }
    catch (e) { err.textContent = e.message; }
  };
  const pw = [h('div', { class: 'f' }, h('label', null, 'New password'), np, ...meter(np)), h('div', { class: 'f' }, h('label', null, 'Confirm new password'), np2)];
  body.append(h('h3', null, 'Use a recovery code'), h('div', { class: 'f' }, code));
  if (answers.length) body.append(h('div', { class: 'hr' }), h('h3', null, 'Or answer your security questions'), answers.map(x => h('div', { class: 'f' }, h('label', null, x.q), x.a)));
  body.append(h('div', { class: 'hr' }), ...pw, err,
    h('div', { class: 'row' }, h('button', { class: 'btn pri', onclick: () => finish(() => code.value.trim() ? A.recoverWithCode(code.value) : A.recoverWithAnswers(answers.map(x => x.a.value))) }, 'Reset password'), h('button', { class: 'btn ghost', onclick: () => loginScreen() }, 'Back')));
  authBox(h('h2', null, 'Recover access'), h('p', { class: 'muted' }, 'A recovery code or your security answers can unlock the studio so you can set a new password.'), body);
}

// ====================== SHELL ======================
let shell, mainEl, crumbsEl, statusMsg, statusTasks, statusStore, idleTimer, lastAct = Date.now();
function startStudio() {
  applyLook(); const s = S.settings();
  const navEl = h('nav', { class: 'nav' });
  for (const [id, label, ic, grp] of NAV) { if (grp) navEl.append(h('div', { class: 'grp' }, grp)); navEl.append(h('a', { href: '#/' + id, 'data-id': id, title: label }, icon(ic), h('span', null, label))); }
  crumbsEl = h('div', { class: 'crumbs' });
  const tb = (ic, title, fn, id) => h('button', { class: 'btn ghost icon', title, id, onclick: fn }, icon(ic));
  const search = globalSearch();
  statusMsg = h('span', null, 'Ready'); statusTasks = h('span'); statusStore = h('span');
  shell = h('div', { class: 'shell' + (s.sidebarCollapsed ? ' collapsed' : '') },
    h('aside', { class: 'side' }, h('div', { class: 'brand' }, h('div', { class: 'logo' }), h('span', null, 'Texture Studio')), navEl,
      h('div', { class: 'foot' }, h('a', { href: '#', class: 'btn ghost', style: { width: '100%' }, onclick: e => { e.preventDefault(); shell.classList.toggle('collapsed'); S.saveSettings({ sidebarCollapsed: shell.classList.contains('collapsed') }); } }, icon('menu'), h('span', null, 'Collapse')))),
    h('header', { class: 'top' }, crumbsEl, search,
      h('div', { class: 'tools' },
        tb('save', 'Save (Ctrl+S)', () => nav.ctrl?.save?.(), 'tb-save'), tb('undo', 'Undo (Ctrl+Z)', () => nav.ctrl?.undo?.(), 'tb-undo'), tb('redo', 'Redo (Ctrl+Y)', () => nav.ctrl?.redo?.(), 'tb-redo'),
        tb('download', 'Export Center', () => nav.go('export', nav.ctrl?.exportArg?.() || '')), tb('help', 'Help Center', () => nav.go('help', nav.current)), tb('settings', 'Settings', () => nav.go('settings')),
        tb('lock', 'Lock and sign out', () => lockNow('Signed out')))),
    mainEl = h('main', { class: 'main' }),
    h('footer', { class: 'status' }, statusMsg, h('span', { class: 'grow' }), statusTasks, statusStore, h('span', null, 'Data: this browser, encrypted')));
  clear(root); root.append(shell);
  nav._status = m => { statusMsg.textContent = m; };
  nav._top = refreshTop; nav._crumbs = parts => { clear(crumbsEl); parts.forEach((p, i) => { if (i) crumbsEl.append(icon('right')); crumbsEl.append(i === parts.length - 1 ? h('b', null, p) : h('span', null, p)); }); };
  onTasks(list => { clear(statusTasks); const run = list.filter(t => t.state === 'running'); const fail = list.find(t => t.state === 'failed'); if (run.length) statusTasks.append(h('span', null, run[0].label + ' ' + Math.round(run[0].p * 100) + '%' + (run.length > 1 ? ` (+${run.length - 1})` : ''))); else if (fail) statusTasks.append(h('span', { style: { color: 'var(--bad)' } }, fail.label + ' failed')); });
  updateStorage(); setInterval(updateStorage, 60000);
  window.addEventListener('hashchange', route);
  document.addEventListener('keydown', keys);
  ['pointerdown', 'keydown', 'wheel', 'pointermove'].forEach(ev => document.addEventListener(ev, () => { lastAct = Date.now(); }, { passive: true }));
  clearInterval(idleTimer); idleTimer = setInterval(checkIdle, 15000);
  setInterval(() => autoBackupTick().catch(e => S.err('Automatic backup', e)), 10 * 60000); setTimeout(() => autoBackupTick().catch(() => { }), 20000);
  route();
}
async function updateStorage() { try { const e = await navigator.storage.estimate(); statusStore.textContent = 'Storage ' + fmtBytes(e.usage) + ' of ' + fmtBytes(e.quota); } catch { } }
function refreshTop() {
  const c = nav.ctrl; const set = (id, ok) => { const b = document.getElementById(id); if (b) b.disabled = !ok; };
  set('tb-save', !!c?.save); set('tb-undo', !!c?.undo && (c.canUndo ? c.canUndo() : true)); set('tb-redo', !!c?.redo && (c.canRedo ? c.canRedo() : true));
}
function keys(e) {
  const mod = e.ctrlKey || e.metaKey; if (!mod) return; const k = e.key.toLowerCase();
  const typing = /input|textarea|select/i.test(document.activeElement?.tagName);
  if (k === 's') { e.preventDefault(); nav.ctrl?.save?.(); }
  else if (!typing && k === 'z' && !e.shiftKey) { e.preventDefault(); nav.ctrl?.undo?.(); }
  else if (!typing && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); nav.ctrl?.redo?.(); }
  else if (k === 'k') { e.preventDefault(); $('.gsearch input')?.focus(); }
}
async function checkIdle() {
  const s = S.settings(); const mins = sessionStorage.getItem('uts-remembered') ? s.rememberIdleMin : s.idleMin;
  if (mins > 0 && Date.now() - lastAct > mins * 60000) lockNow('Session expired after inactivity');
}
async function lockNow(reason) { try { await nav.ctrl?.autosave?.(); } catch { } await A.lock(reason); }

const loaded = {};
async function route() {
  const [, id = 'dashboard', ...rest] = (location.hash || '#/dashboard').split('/'); const arg = rest.length ? decodeURIComponent(rest.join('/')) : null;
  const def = [...NAV, ...HIDDEN].find(n => n[0] === id) || NAV[0];
  if (nav.ctrl?.leave && !(await nav.ctrl.leave())) { history.replaceState(null, '', '#/' + nav.current + (nav.arg ? '/' + encodeURIComponent(nav.arg) : '')); return; }
  if (def[0] === 'admin' && !A.recentlyReauthed()) { if (!(await reauth())) { history.replaceState(null, '', '#/' + (nav.current || 'dashboard')); return; } }
  try { await nav.ctrl?.autosave?.(); } catch (e) { S.err('Autosave on leave', e); }
  try { nav.ctrl?.destroy?.(); } catch { }
  nav.ctrl = null; nav.current = def[0]; nav.arg = arg;
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('on', a.dataset.id === def[0]));
  nav.crumbs('Studio', def[1]); clear(mainEl); mainEl.scrollTop = 0;
  const ld = h('div', { class: 'loading' }), msg = h('div', { class: 'loading-msg' }, 'Loading ' + def[1] + '...');
  mainEl.append(ld); const mt = setTimeout(() => { if (ld.isConnected && !mainEl.innerText.trim()) mainEl.append(msg); }, 250);
  try {
    const mod = loaded[def[0]] ||= await import('./sections/' + def[0] + '.js');
    nav.ctrl = (await mod.default(mainEl, arg)) || null;
  } catch (e) { S.err('Could not open ' + def[1], e); mainEl.append(h('div', { class: 'page' }, h('div', { class: 'callout bad' }, 'This section failed to load: ' + e.message))); }
  clearTimeout(mt); ld.remove(); msg.remove();
  refreshTop();
}
async function reauth() {
  const p = h('input', { type: 'password', style: { width: '100%' } }); const err = h('div', { class: 'small', style: { color: 'var(--bad)' } });
  return modal({
    title: 'Confirm it is you', body: h('div', null, h('p', { class: 'muted' }, 'The Admin Panel contains security and storage controls. Enter your password to continue.'), p, err),
    actions: [{ label: 'Cancel', value: false }, { label: 'Unlock admin', cls: 'pri', run: async () => { if (await A.verifyPassword(p.value)) return true; err.textContent = 'Wrong password.'; return false; } }],
  });
}

// ====================== GLOBAL SEARCH ======================
function globalSearch() {
  const inp = h('input', { type: 'search', placeholder: 'Search everything (Ctrl+K)' }); const res = h('div', { class: 'gres', hidden: true });
  const run = debounce(async () => {
    const q = inp.value.trim().toLowerCase(); clear(res); if (q.length < 2) { res.hidden = true; return; }
    const hit = (...f) => f.some(x => String(x || '').toLowerCase().includes(q)); const rows = [];
    for (const p of S.all('project', p => hit(p.name, p.description, p.tags?.join(' ')))) rows.push(['Project', p.name, () => nav.go('projects', p.id)]);
    for (const t of S.liveTextures(t => hit(t.name, t.description, t.category, t.tags?.join(' '), t.format))) rows.push(['Texture', t.name + ' ' + t.width + 'x' + t.height, () => nav.go('library', t.id)]);
    for (const m of S.all('material', m => hit(m.name, m.category))) rows.push(['Material', m.name, () => nav.go('pbr', m.id)]);
    for (const p of S.all('product', p => hit(p.name, p.description, p.category))) rows.push(['Product', p.name, () => nav.go('business', 'product:' + p.id)]);
    for (const p of S.all('preset', p => hit(p.name, p.kind))) rows.push(['Preset', p.name, () => nav.go('presets', p.id)]);
    const { COURSES } = await import('./content/academy-content.js'); for (const c of COURSES) for (const l of c.lessons) if (hit(l.title, l.summary, l.body)) rows.push(['Lesson', l.title, () => nav.go('academy', l.id)]);
    const { ARTICLES } = await import('./content/help-content.js'); for (const a of ARTICLES) if (hit(a.title, a.body)) rows.push(['Help', a.title, () => nav.go('help', a.id)]);
    for (const [id, label] of NAV) if (hit(label)) rows.push(['Section', label, () => nav.go(id)]);
    if (!rows.length) res.append(h('div', { class: 'row muted' }, 'No results'));
    rows.slice(0, 40).forEach(([k, t, go]) => res.append(h('div', { class: 'row', onmousedown: e => { e.preventDefault(); go(); res.hidden = true; inp.value = ''; } }, h('span', { class: 'k' }, k), t)));
    res.hidden = false;
  }, 150);
  inp.oninput = run; inp.onblur = () => setTimeout(() => res.hidden = true, 150); inp.onfocus = () => { if (inp.value.length > 1) run(); };
  inp.onkeydown = e => { if (e.key === 'Enter') res.querySelector('.row')?.dispatchEvent(new MouseEvent('mousedown')); if (e.key === 'Escape') inp.blur(); };
  return h('div', { class: 'gsearch' }, icon('search'), inp, res);
}

// ====================== BOOT ======================
(async () => {
  if (!window.crypto?.subtle || !window.indexedDB) { root.innerHTML = '<div class="boot">This browser lacks Web Crypto or IndexedDB. Use a current Chrome, Edge or Firefox over http://localhost.</div>'; return; }
  try { await navigator.storage?.persist?.(); } catch { }
  if (!(await A.isSetup())) setupScreen(); else loginScreen();
})();
export { base32, rand };
