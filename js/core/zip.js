// ZIP writer and reader. Uses the browser's built-in deflate (CompressionStream).
export const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8, crc = 0) { crc = ~crc >>> 0; for (let i = 0; i < u8.length; i++) crc = CRC_TABLE[(crc ^ u8[i]) & 255] ^ (crc >>> 8); return ~crc >>> 0; }
export async function streamBytes(u8, ts) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ts)).arrayBuffer()); }
const te = new TextEncoder();

export class ZipWriter {
  constructor() { this.files = []; }
  async add(name, data, { compress = true } = {}) {
    if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
    else if (typeof data === 'string') data = te.encode(data);
    else if (data instanceof ArrayBuffer) data = new Uint8Array(data);
    const crc = crc32(data); let body = data, method = 0;
    // Already-compressed formats gain nothing from deflate.
    if (compress && data.length > 64 && !/\.(png|jpe?g|webp|zip)$/i.test(name)) {
      const d = await streamBytes(data, new CompressionStream('deflate-raw'));
      if (d.length < data.length) { body = d; method = 8; }
    }
    this.files.push({ name: te.encode(name.replace(/\\/g, '/')), crc, body, method, size: data.length, date: new Date() });
  }
  blob() {
    const parts = []; const central = []; let offset = 0;
    for (const f of this.files) {
      const dt = dosTime(f.date);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, f.method, true);
      lh.setUint16(10, dt.time, true); lh.setUint16(12, dt.date, true); lh.setUint32(14, f.crc, true);
      lh.setUint32(18, f.body.length, true); lh.setUint32(22, f.size, true); lh.setUint16(26, f.name.length, true);
      parts.push(lh, f.name, f.body);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, f.method, true);
      ch.setUint16(12, dt.time, true); ch.setUint16(14, dt.date, true); ch.setUint32(16, f.crc, true); ch.setUint32(20, f.body.length, true);
      ch.setUint32(24, f.size, true); ch.setUint16(28, f.name.length, true); ch.setUint32(42, offset, true);
      central.push(ch, f.name);
      offset += 30 + f.name.length + f.body.length;
    }
    const cdSize = central.reduce((a, p) => a + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, this.files.length, true); end.setUint16(10, this.files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  }
}
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

// Reads entries and verifies CRC of each one.
export async function readZip(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer()); const dv = new DataView(u8.buffer);
  let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Not a ZIP file.');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = new Map(); const td = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('ZIP directory is damaged.');
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = td.decode(u8.subarray(p + 46, p + 46 + nl));
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
    let data = u8.subarray(ds, ds + csize);
    if (method === 8) data = await streamBytes(data, new DecompressionStream('deflate-raw'));
    else if (method !== 0) throw new Error('Unsupported ZIP compression in ' + name);
    if (crc32(data) !== crc) throw new Error('Checksum failed for ' + name);
    out.set(name, data); p += 46 + nl + xl + cl;
  }
  return out;
}
