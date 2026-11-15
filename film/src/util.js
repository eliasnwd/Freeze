// Shared math / timeline helpers. Everything in the film is a pure function of time t.
import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const smoother = (t) => { t = clamp(t); return t * t * t * (t * (t * 6 - 15) + 10); };
export const easeInOut = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const ramp = (t, a, b) => clamp((t - a) / (b - a));
export const sramp = (t, a, b) => smooth((t - a) / (b - a));
// bump: rises a->b, holds, falls c->d
export const window4 = (t, a, b, c, d) => Math.min(sramp(t, a, b), 1 - sramp(t, c, d));

// deterministic hash / noise
export function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function noise1(x) { const i = Math.floor(x), f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u) * 2 - 1; }
export function fbm1(x, o = 3) { let v = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { v += a * noise1(x * f + i * 17.3); f *= 2.03; a *= 0.5; } return v; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e9) / 1e9; }; }

// Keyframe track: keys = [[t, value], ...], value number | array. ease per segment optional [t, v, easeFn]
export function track(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0] = keys[i], [t1, v1, e] = keys[i + 1];
    if (t <= t1) {
      const u = (e || smooth)((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((x, j) => lerp(x, v1[j], u));
      return lerp(v0, v1, u);
    }
  }
  return keys[keys.length - 1][1];
}
export const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// Catmull-Rom path through points, parameter u in [0,1]
export function pathAt(points, u) {
  const c = new THREE.CatmullRomCurve3(points.map(V), false, 'centripetal');
  return c.getPoint(clamp(u));
}
