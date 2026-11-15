// Simple faceless toon characters with a joint hierarchy, procedural walk/run/idle,
// and first-person hands for POV shots.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, toon } from './toon.js';
import { clamp, lerp } from './util.js';

const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 6, 14);
const sph = (r) => new THREE.SphereGeometry(r, 24, 16);

export class Puppet {
  constructor(o = {}) {
    this.o = Object.assign({ skin: 0xf0c49c, shirt: 0x3d5a80, pants: 0x2b2d42, hair: 0x2b1d14, shoes: 0x1d1d1d, beard: false, hairStyle: 'short', scale: 1 }, o);
    const C = this.o;
    this.root = new THREE.Group();
    this.root.scale.setScalar(C.scale);
    const hips = this.hips = new THREE.Group(); hips.position.y = 0.92; this.root.add(hips);
    M(cap(0.15, 0.1), C.pants, { parent: hips, pos: [0, 0.02, 0], scale: [1.05, 1, 0.8] });
    // spine/torso
    const spine = this.spine = new THREE.Group(); spine.position.y = 0.08; hips.add(spine);
    M(cap(0.17, 0.3), C.shirt, { parent: spine, pos: [0, 0.27, 0], scale: [1.08, 1, 0.75] });
    const neck = this.neck = new THREE.Group(); neck.position.y = 0.55; spine.add(neck);
    M(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 12), C.skin, { parent: neck, pos: [0, 0.03, 0] });
    const head = this.head = new THREE.Group(); head.position.y = 0.09; neck.add(head);
    M(sph(0.125), C.skin, { parent: head, pos: [0, 0.12, 0.0], scale: [0.95, 1.1, 1.0] });
    // ears + nose (tiny, faceless style)
    M(sph(0.03), C.skin, { parent: head, pos: [0.118, 0.11, 0], scale: [0.5, 1, 0.8] });
    M(sph(0.03), C.skin, { parent: head, pos: [-0.118, 0.11, 0], scale: [0.5, 1, 0.8] });
    // hair
    if (C.hairStyle === 'bun') {
      M(sph(0.132), C.hair, { parent: head, pos: [0, 0.15, -0.01], scale: [1, 0.95, 1.05] }).geometry;
      M(sph(0.07), C.hair, { parent: head, pos: [0, 0.27, -0.06] });
    } else if (C.hairStyle === 'long') {
      M(sph(0.135), C.hair, { parent: head, pos: [0, 0.15, -0.015], scale: [1.02, 1, 1.06] });
      M(new RoundedBoxGeometry(0.27, 0.3, 0.12, 3, 0.05), C.hair, { parent: head, pos: [0, 0.02, -0.07] });
    } else if (C.hairStyle === 'none') {
      // bald / rotten
    } else {
      this.hairMesh = M(new THREE.SphereGeometry(0.131, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), C.hair, { parent: head, pos: [0, 0.135, -0.012], rot: [-0.35, 0, 0], scale: [1.02, 1.05, 1.06] });
    }
    // beard (grows): lower half-shell in front
    this.beard = M(new THREE.SphereGeometry(0.128, 24, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.52, Math.PI * 0.4), C.hair, { parent: head, pos: [0, 0.115, 0.005], scale: [1.0, 1.05, 1.05] });
    this.beard.material = toon(C.hair, { side: THREE.DoubleSide });
    this.beard.visible = false;
    // arms
    this.arm = {};
    for (const s of [1, -1]) {
      const sh = new THREE.Group(); sh.position.set(0.215 * s, 0.48, 0); spine.add(sh);
      M(sph(0.075), C.shirt, { parent: sh });
      const up = new THREE.Group(); sh.add(up);
      M(cap(0.058, 0.2), C.shirt, { parent: up, pos: [0, -0.14, 0] });
      const el = new THREE.Group(); el.position.y = -0.28; up.add(el);
      M(cap(0.05, 0.18), C.sleeve ?? C.shirt, { parent: el, pos: [0, -0.12, 0] });
      const hand = new THREE.Group(); hand.position.y = -0.26; el.add(hand);
      M(sph(0.055), C.skin, { parent: hand, pos: [0, -0.03, 0.005], scale: [0.9, 1.15, 0.7] });
      this.arm[s] = { sh, up, el, hand };
    }
    // legs
    this.leg = {};
    for (const s of [1, -1]) {
      const hp = new THREE.Group(); hp.position.set(0.095 * s, -0.02, 0); hips.add(hp);
      M(cap(0.075, 0.3), C.pants, { parent: hp, pos: [0, -0.2, 0] });
      const kn = new THREE.Group(); kn.position.y = -0.42; hp.add(kn);
      M(cap(0.063, 0.3), C.pants, { parent: kn, pos: [0, -0.2, 0] });
      const ft = new THREE.Group(); ft.position.y = -0.42; kn.add(ft);
      M(new RoundedBoxGeometry(0.11, 0.08, 0.25, 3, 0.035), C.shoes, { parent: ft, pos: [0, -0.04, 0.05] });
      this.leg[s] = { hp, kn, ft };
    }
    this.root.traverse((m) => { if (m.isMesh && m.name !== 'outline') { m.castShadow = true; } });
  }
  setBeard(k) {
    this.beard.visible = k > 0.02;
    const s = 0.94 + k * 0.14;
    this.beard.scale.set(s, 1.0 + k * 0.25, s);
    this.beard.position.y = 0.115 - k * 0.02;
  }
  // p: pose parameters (radians)
  pose(p) {
    const r = this.root;
    r.position.set(p.x || 0, p.y || 0, p.z || 0);
    r.rotation.set(0, p.yaw || 0, 0);
    let hipY = 0.92 + (p.hipY || 0);
    let spineX = p.spine || 0, spineZ = p.spineZ || 0, spineY = p.spineY || 0;
    const A = { 1: [p.armL?.[0] ?? 0.05, p.armL?.[1] ?? 0.12, p.armL?.[2] ?? -0.2, p.armL?.[3] ?? 0], [-1]: [p.armR?.[0] ?? 0.05, p.armR?.[1] ?? 0.12, p.armR?.[2] ?? -0.2, p.armR?.[3] ?? 0] };
    const Lg = { 1: [p.legL?.[0] ?? 0, p.legL?.[1] ?? 0, 0], [-1]: [p.legR?.[0] ?? 0, p.legR?.[1] ?? 0, 0] };
    // locomotion blend
    const w = p.walk || 0;
    if (w > 0) {
      const ph = p.phase || 0, run = p.run || 0;
      const sw = lerp(0.42, 0.85, run) * w;
      for (const s of [1, -1]) {
        const q = Math.sin(ph + (s > 0 ? 0 : Math.PI));
        Lg[s][0] += -q * sw;
        Lg[s][1] += Math.max(0, Math.sin(ph + (s > 0 ? 0 : Math.PI) - 1.2)) * lerp(0.7, 1.4, run) * w;
        A[s][0] += q * lerp(0.35, 0.9, run) * w * (p.armSwing ?? 1);
        A[s][2] += -lerp(0.15, 1.3, run) * w * (p.armSwing ?? 1);
      }
      hipY += -Math.abs(Math.sin(ph)) * lerp(0.025, 0.06, run) * w;
      spineX += lerp(0.04, 0.22, run) * w;
      spineY += Math.sin(ph) * 0.08 * w;
    }
    // sit / crouch: thighs forward, knees bent
    if (p.sit) {
      const k = p.sit;
      for (const s of [1, -1]) { Lg[s][0] += -1.5 * k; Lg[s][1] += 1.5 * k; }
      hipY = lerp(hipY, p.seatH ?? 0.5, k);
    }
    if (p.crouch) {
      const k = p.crouch;
      for (const s of [1, -1]) { Lg[s][0] += -1.9 * k; Lg[s][1] += 2.3 * k; }
      hipY = lerp(hipY, 0.42, k); spineX += 0.5 * k;
    }
    if (p.floor) { // sit on the floor, knees up
      const k = p.floor;
      for (const s of [1, -1]) { Lg[s][0] += -1.75 * k; Lg[s][1] += 2.1 * k; }
      hipY = lerp(hipY, 0.14, k); spineX += -0.1 * k;
    }
    this.hips.position.y = hipY;
    this.hips.position.z = p.hipZ || 0;
    this.hips.rotation.set(p.hipsX || 0, 0, p.hipsZ || 0);
    this.spine.rotation.set(spineX, spineY, spineZ);
    this.neck.rotation.set(p.neck || 0, 0, 0);
    this.head.rotation.set(p.headX || 0, p.headY || 0, p.headZ || 0, 'YXZ');
    for (const s of [1, -1]) {
      const a = this.arm[s], v = A[s];
      // v = [forward swing, outward, elbow bend(neg), twist]
      a.up.rotation.set(-v[0], v[3], v[1] * s, 'XZY');
      a.el.rotation.set(v[2], 0, 0);
      const l = this.leg[s], g = Lg[s];
      l.hp.rotation.set(g[0], 0, 0.04 * s);
      l.kn.rotation.set(g[1], 0, 0);
      l.ft.rotation.set(-g[0] - g[1] + (p.foot || 0), 0, 0);
    }
  }
  handWorld(s, out = new THREE.Vector3()) { return this.arm[s].hand.getWorldPosition(out); }
}

// First-person hands, parented to the camera.
export class PovHands {
  constructor(skin = 0xf0c49c, sleeve = 0x4a5a6a) {
    this.group = new THREE.Group();
    this.h = {};
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      const sl = M(new THREE.CylinderGeometry(0.06, 0.075, 0.5, 18), sleeve, { parent: g, pos: [0, 0, 0.25], rot: [Math.PI / 2, 0, 0] });
      sl.userData.sleeve = true;
      const cuff = M(new THREE.CylinderGeometry(0.062, 0.062, 0.03, 18), 0x2f3a45, { parent: g, pos: [0, 0, 0.015], rot: [Math.PI / 2, 0, 0] });
      const hand = new THREE.Group(); hand.position.z = -0.05; g.add(hand);
      M(new RoundedBoxGeometry(0.1, 0.045, 0.11, 4, 0.02), skin, { parent: hand, pos: [0, 0, -0.03] });
      // fingers block + thumb
      const fing = new THREE.Group(); fing.position.set(0, 0, -0.085); hand.add(fing);
      M(new RoundedBoxGeometry(0.095, 0.035, 0.07, 4, 0.016), skin, { parent: fing, pos: [0, 0, -0.03] });
      const th = M(new THREE.CapsuleGeometry(0.016, 0.04, 4, 8), skin, { parent: hand, pos: [0.055 * -s, 0.005, -0.04], rot: [Math.PI / 2, 0, 0.5 * s] });
      const grip = new THREE.Group(); grip.position.set(0, 0.0, -0.09); hand.add(grip);
      this.group.add(g);
      this.h[s] = { g, hand, fing, th, grip };
    }
  }
  // pos (camera space), rot euler, curl (0 open .. 1 fist)
  set(s, pos, rot = [0, 0, 0], curl = 0.2, visible = true) {
    const h = this.h[s];
    h.g.visible = visible;
    h.g.position.set(...pos);
    h.g.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
    h.fing.rotation.x = curl * 1.5;
  }
}
