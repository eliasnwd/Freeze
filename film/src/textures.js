// Procedural PBR textures generated on canvases (no external image assets needed).
import * as THREE from 'three';
import { rng } from './util.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// value noise on canvas
function noiseField(w, h, scale, seed, oct = 4) {
  const R = rng(seed);
  const gw = Math.ceil(w / scale) + 2, gh = Math.ceil(h / scale) + 2;
  const out = new Float32Array(w * h);
  let amp = 1, total = 0, sc = scale;
  for (let o = 0; o < oct; o++) {
    const gx = Math.ceil(w / sc) + 2, gy = Math.ceil(h / sc) + 2;
    const g = new Float32Array(gx * gy); for (let i = 0; i < g.length; i++) g[i] = R();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const fx = x / sc, fy = y / sc, ix = Math.floor(fx), iy = Math.floor(fy);
      let u = fx - ix, v = fy - iy; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v);
      const a = g[iy * gx + ix], b = g[iy * gx + ix + 1], c = g[(iy + 1) * gx + ix], d = g[(iy + 1) * gx + ix + 1];
      out[y * w + x] += amp * ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v);
    }
    total += amp; amp *= 0.5; sc = Math.max(1, sc / 2);
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function heightToNormal(hf, w, h, strength) {
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const l = hf[y * w + ((x - 1 + w) % w)], r = hf[y * w + ((x + 1) % w)];
    const u = hf[((y - 1 + h) % h) * w + x], d = hf[((y + 1) % h) * w + x];
    let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4;
    img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, repeat = [1, 1], srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function woodFloor() {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const R = rng(7);
  const grain = noiseField(W, H, 64, 3, 5);
  const img = ctx.createImageData(W, H);
  const hf = new Float32Array(W * H);
  const plankH = 64; // 8 planks per tile
  const offs = []; const tones = [];
  for (let i = 0; i < 8; i++) { offs.push(R() * W); tones.push(0.75 + R() * 0.35); }
  for (let y = 0; y < H; y++) {
    const p = Math.floor(y / plankH), py = y % plankH;
    for (let x = 0; x < W; x++) {
      const xx = (x + offs[p]) % W;
      const seam = (py < 1 || xx % 256 < 1.5) ? 0.45 : 1;
      const g = grain[y * W + Math.floor(xx * 0.25 + y * 0) % W];
      const ring = 0.5 + 0.5 * Math.sin((y * 0.9 + g * 40 + p * 13) * 0.6);
      const v = tones[p] * (0.78 + 0.22 * ring) * (0.85 + 0.3 * grain[(y * W + xx) % (W * H)]) * seam;
      const i = (y * W + x) * 4;
      img.data[i] = 150 * v; img.data[i + 1] = 104 * v; img.data[i + 2] = 68 * v; img.data[i + 3] = 255;
      hf[y * W + x] = seam < 1 ? 0 : 0.5 + ring * 0.05;
    }
  }
  ctx.putImageData(img, 0, 0);
  const n = heightToNormal(hf, W, H, 3.0);
  return { map: tex(c, [3, 3]), normalMap: tex(n, [3, 3], false) };
}

export function plaster(color = [228, 224, 216], seed = 11) {
  const W = 256, H = 256;
  const nf = noiseField(W, H, 32, seed, 5);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = 0.93 + nf[i] * 0.1;
    img.data[i * 4] = color[0] * v; img.data[i * 4 + 1] = color[1] * v; img.data[i * 4 + 2] = color[2] * v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const n = heightToNormal(nf, W, H, 1.2);
  return { map: tex(c, [4, 2]), normalMap: tex(n, [4, 2], false) };
}

export function fabric(color = [90, 92, 96], seed = 5) {
  const W = 256, H = 256;
  const nf = noiseField(W, H, 16, seed, 3);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  const hf = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6) * 0.5 + 0.5);
    const v = 0.82 + weave * 0.12 + nf[y * W + x] * 0.12;
    const i = (y * W + x) * 4;
    img.data[i] = color[0] * v; img.data[i + 1] = color[1] * v; img.data[i + 2] = color[2] * v; img.data[i + 3] = 255;
    hf[y * W + x] = weave;
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, [6, 6]), normalMap: tex(heightToNormal(hf, W, H, 1.5), [6, 6], false) };
}

export function concrete(seed = 21, base = [150, 148, 144]) {
  const W = 256, H = 256;
  const nf = noiseField(W, H, 48, seed, 6);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = 0.75 + nf[i] * 0.45;
    img.data[i * 4] = base[0] * v; img.data[i * 4 + 1] = base[1] * v; img.data[i * 4 + 2] = base[2] * v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, [2, 2]), normalMap: tex(heightToNormal(nf, W, H, 2.5), [2, 2], false) };
}

export function asphalt() {
  const W = 512, H = 512;
  const nf = noiseField(W, H, 8, 41, 4);
  const c = canvas(W, H), ctx = c.getContext('2d'), img = ctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = 0.55 + nf[i] * 0.5;
    img.data[i * 4] = 62 * v; img.data[i * 4 + 1] = 62 * v; img.data[i * 4 + 2] = 64 * v; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { map: tex(c, [1, 1]) };
}

// Street texture tile: road with lane markings, crosswalk
export function roadTile() {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext('2d');
  const a = asphalt().map.image;
  ctx.drawImage(a, 0, 0);
  ctx.fillStyle = 'rgba(230,230,220,0.85)';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, H / 2 - 3, 34, 6);
  ctx.fillStyle = 'rgba(220,190,60,0.8)';
  ctx.fillRect(0, 40, W, 5); ctx.fillRect(0, H - 45, W, 5);
  return tex(c, [1, 1]);
}

// glowing TV / screen content is drawn live (see apartment.js)
export function makeCanvasTexture(w, h) {
  const c = canvas(w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return { canvas: c, ctx: c.getContext('2d'), tex: t };
}

// soft radial sprite for smoke / glows
export function smokeSprite(seed = 3) {
  const W = 128;
  const nf = noiseField(W, W, 24, seed, 4);
  const c = canvas(W, W), ctx = c.getContext('2d'), img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2), dy = (y - W / 2) / (W / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const a = Math.max(0, 1 - r) ** 1.5 * (0.45 + nf[y * W + x] * 0.9);
    const i = (y * W + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function glowSprite() {
  const W = 64, c = canvas(W, W), ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// label for food cans / bottles
export function labelTexture(colorA, colorB, text) {
  const c = canvas(256, 128), ctx = c.getContext('2d');
  ctx.fillStyle = colorA; ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = colorB; ctx.fillRect(0, 40, 256, 48);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(text, 128, 76);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
