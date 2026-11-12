// All crypto uses the browser's Web Crypto API. Nothing is sent anywhere.
const te = new TextEncoder();
export const rand = n => crypto.getRandomValues(new Uint8Array(n));
export function b64(buf) { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export async function sha256(data) { const d = typeof data === 'string' ? te.encode(data) : data; return b64(await crypto.subtle.digest('SHA-256', d)); }
export async function sha256hex(buf) { const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf)); return [...d].map(b => b.toString(16).padStart(2, '0')).join(''); }

export const PBKDF2_ITER = 310000;
export async function deriveKEK(secret, salt, iterations = PBKDF2_ITER) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
export const newDataKey = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
export async function wrapKey(dataKey, kek) { const iv = rand(12); const w = await crypto.subtle.wrapKey('raw', dataKey, kek, { name: 'AES-GCM', iv }); return { iv: b64(iv), w: b64(w) }; }
export function unwrapKey(obj, kek) {
  return crypto.subtle.unwrapKey('raw', unb64(obj.w), kek, { name: 'AES-GCM', iv: unb64(obj.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
// wrap the data key with a secret (password, recovery code, answers). Returns a storable record.
export async function lockWith(dataKey, secret, iterations = PBKDF2_ITER) {
  const salt = rand(16); const kek = await deriveKEK(secret, salt, iterations);
  return { salt: b64(salt), iter: iterations, ...(await wrapKey(dataKey, kek)) };
}
export async function openWith(rec, secret) { const kek = await deriveKEK(secret, unb64(rec.salt), rec.iter); return unwrapKey(rec, kek); }

export async function encrypt(key, data) { const iv = rand(12); const out = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data); return { iv, data: out }; }
export const decrypt = (key, iv, data) => crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);

export function recoveryCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const r = rand(15); let s = '';
  for (let i = 0; i < 15; i++) { s += A[r[i] % 32]; if (i % 5 === 4 && i < 14) s += '-'; }
  return s;
}
export const normCode = c => c.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/(.{5})(?=.)/g, '$1-');

// ---- TOTP (RFC 6238) for optional two-factor ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) out += B32[(val << (5 - bits)) & 31]; return out; }
export function unbase32(s) { s = s.toUpperCase().replace(/[^A-Z2-7]/g, ''); let bits = 0, val = 0; const out = []; for (const c of s) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
export async function totp(secretB32, t = Date.now()) {
  const ctr = Math.floor(t / 30000); const buf = new ArrayBuffer(8); const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(ctr / 4294967296)); dv.setUint32(4, ctr >>> 0);
  const k = await crypto.subtle.importKey('raw', unbase32(secretB32), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const hm = new Uint8Array(await crypto.subtle.sign('HMAC', k, buf)); const o = hm[19] & 15;
  const code = (((hm[o] & 127) << 24) | (hm[o + 1] << 16) | (hm[o + 2] << 8) | hm[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
export async function verifyTotp(secret, code) {
  code = String(code).replace(/\D/g, ''); const now = Date.now();
  for (const d of [0, -30000, 30000]) if (await totp(secret, now + d) === code) return true;
  return false;
}
export function passwordScore(p) {
  let s = 0; if (p.length >= 10) s++; if (p.length >= 14) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}
