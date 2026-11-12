// Owner check. Only the SHA-256 hash of the owner key is here, never the key itself.
// The key is 160 random bits, so the hash cannot be guessed back into a key.
import { sha256hex } from './crypto.js';
const OWNER_HASH = '1b5bd53e7c59f5243302a67f7516aaf8e7d45d996ec09c059a9086f8c77955ec';
export const normOwnerKey = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export async function isOwnerKey(k) { const n = normOwnerKey(k); return n.length === 32 && (await sha256hex(new TextEncoder().encode('uts-owner:' + n))) === OWNER_HASH; }
