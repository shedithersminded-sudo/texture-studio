import { generate } from '../core/procedural.js';
self.onmessage = e => {
  const { id, params } = e.data;
  try {
    const r = generate(params, p => self.postMessage({ id, progress: p }));
    self.postMessage({ id, done: true, result: r }, [r.rgba.buffer, r.height.buffer, r.rough.buffer, r.metal.buffer, r.emis.buffer]);
  } catch (err) { self.postMessage({ id, error: String(err?.message || err) }); }
};
