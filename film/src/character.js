// Character rig: retargeted mocap clips, authored poses, two-bone IK, look-at,
// procedural facial morphs, shell-rendered hair/beard and day-by-day ageing.
import * as THREE from 'three';
import { clamp, lerp, noise1, fbm1 } from './util.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
const D2R = Math.PI / 180;

function qFromDeg(d) { return new THREE.Quaternion().setFromEuler(new THREE.Euler(d[0] * D2R, d[1] * D2R, d[2] * D2R, 'YXZ')); }

// ---------------------------------------------------------------------------
// Pose library. Rotations are degrees about CHARACTER axes at rest
// (+X = character's left, +Y = up, +Z = forward), applied relative to parent.
// Every pose inherits NEUTRAL for unspecified bones.
// ---------------------------------------------------------------------------
const NEUTRAL = {
  LeftArm: [4, 0, -24], RightArm: [4, 0, 24],
  LeftForeArm: [-10, 0, 0], RightForeArm: [-10, 0, 0],
  LeftHand: [0, 0, -6], RightHand: [0, 0, 6],
};
export const POSES = {
  neutral: { rot: {} },
  // sitting upright on a sofa / chair (seat height ~0.45)
  sit: {
    hips: [0, 0.50, -0.06],
    rot: {
      Hips: [-4, 0, 0], Spine: [-6, 0, 0], Spine1: [2, 0, 0], Neck: [6, 0, 0],
      LeftUpLeg: [-86, 0, -4], RightUpLeg: [-86, 0, 4], LeftLeg: [84, 0, 0], RightLeg: [84, 0, 0],
      LeftFoot: [4, 0, 0], RightFoot: [4, 0, 0],
      LeftArm: [-30, 0, -55], RightArm: [-30, 0, 55], LeftForeArm: [-50, 10, 0], RightForeArm: [-50, -10, 0],
      LeftHand: [10, 0, 0], RightHand: [10, 0, 0],
    },
  },
  // slumped over a table, forearms on table, head hanging
  sitSlump: {
    hips: [0, 0.50, -0.08],
    rot: {
      Hips: [6, 0, 0], Spine: [16, 0, 0], Spine1: [10, 0, 0], Spine2: [8, 0, 0], Neck: [14, 0, 0], Head: [16, 0, 0],
      LeftUpLeg: [-92, 0, -6], RightUpLeg: [-92, 0, 6], LeftLeg: [90, 0, 0], RightLeg: [90, 0, 0],
      LeftArm: [-62, 0, -52], RightArm: [-62, 0, 52], LeftForeArm: [-58, 30, 0], RightForeArm: [-58, -30, 0],
    },
  },
  // sitting on the floor, back against something, knees up
  floor: {
    hips: [0, 0.12, -0.05],
    rot: {
      Hips: [-14, 0, 0], Spine: [8, 0, 0], Spine1: [8, 0, 0], Neck: [6, 0, 0],
      LeftUpLeg: [-112, 0, -14], RightUpLeg: [-112, 0, 14], LeftLeg: [118, 0, 0], RightLeg: [118, 0, 0],
      LeftFoot: [-14, 0, 0], RightFoot: [-14, 0, 0],
      LeftArm: [-48, 0, -58], RightArm: [-48, 0, 58], LeftForeArm: [-60, 20, 0], RightForeArm: [-60, -20, 0],
    },
  },
  // deep crouch hiding, curled forward
  crouch: {
    hips: [0, 0.42, -0.12],
    rot: {
      Hips: [26, 0, 0], Spine: [18, 0, 0], Spine1: [12, 0, 0], Spine2: [6, 0, 0], Neck: [-18, 0, 0], Head: [-10, 0, 0],
      LeftUpLeg: [-118, 0, -10], RightUpLeg: [-118, 0, 10], LeftLeg: [128, 0, 0], RightLeg: [128, 0, 0],
      LeftFoot: [-22, 0, 0], RightFoot: [-22, 0, 0],
      LeftArm: [-40, 0, -60], RightArm: [-40, 0, 60], LeftForeArm: [-80, 20, 0], RightForeArm: [-80, -20, 0],
    },
  },
  // lying on the side (character space: rotate root), knees slightly bent
  lie: {
    hips: [0, 0.98, 0.0],
    rot: {
      Spine: [8, 0, 0], Spine1: [6, 0, 0], Neck: [6, 0, 0], Head: [4, 0, 0],
      LeftUpLeg: [-40, 0, -4], RightUpLeg: [-28, 0, 4], LeftLeg: [60, 0, 0], RightLeg: [44, 0, 0],
      LeftArm: [-70, 0, -40], RightArm: [-50, 0, 60], LeftForeArm: [-70, 0, 0], RightForeArm: [-60, 0, 0],
    },
  },
  // leaning forward pushing with both hands (hands set by IK)
  push: {
    hips: [0, 0.92, -0.10],
    rot: {
      Hips: [12, 0, 0], Spine: [10, 0, 0], Spine1: [6, 0, 0], Neck: [-10, 0, 0], Head: [-6, 0, 0],
      LeftUpLeg: [-20, 0, -4], RightUpLeg: [26, 0, 4], LeftLeg: [30, 0, 0], RightLeg: [14, 0, 0],
      LeftFoot: [-6, 0, 0], RightFoot: [-20, 0, 0],
    },
  },
  // tense stand, shoulders raised
  tense: {
    rot: {
      Spine1: [4, 0, 0], Neck: [8, 0, 0], Head: [-4, 0, 0],
      LeftShoulder: [0, 0, 6], RightShoulder: [0, 0, -6],
      LeftArm: [-10, 0, -48], RightArm: [-10, 0, 48], LeftForeArm: [-30, 0, 0], RightForeArm: [-30, 0, 0],
    },
  },
  // knees slightly bent, upper body hunched (exhaustion)
  tired: {
    hips: [0, 0.99, -0.02],
    rot: {
      Spine: [6, 0, 0], Spine1: [6, 0, 0], Spine2: [4, 0, 0], Neck: [10, 0, 0], Head: [8, 0, 0],
      LeftShoulder: [0, 0, -4], RightShoulder: [0, 0, 4],
      LeftUpLeg: [-6, 0, 0], RightUpLeg: [-6, 0, 0], LeftLeg: [8, 0, 0], RightLeg: [8, 0, 0],
    },
  },
};

const RETARGET_CHAIN = [
  ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Spine2', 'Neck'], ['Neck', 'Head'], ['Head', 'HeadTop_End'],
  ['LeftShoulder', 'LeftArm'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['LeftHand', 'LeftHandMiddle1'],
  ['RightShoulder', 'RightArm'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['RightHand', 'RightHandMiddle1'],
  ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['LeftFoot', 'LeftToeBase'],
  ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot'], ['RightFoot', 'RightToeBase'],
];

export class Rig {
  constructor(root) {
    this.root = root;
    this.bones = {};
    this.list = [];
    root.traverse((o) => { if (o.isBone) { this.bones[o.name] = o; this.list.push(o); } });
    const saveP = root.position.clone(), saveQ = root.quaternion.clone();
    root.position.set(0, 0, 0); root.quaternion.identity(); root.updateMatrixWorld(true);
    this.bindLocal = {}; this.bindW = {}; this.bindPos = {};
    for (const b of this.list) {
      this.bindLocal[b.name] = b.quaternion.clone();
      this.bindW[b.name] = b.getWorldQuaternion(new THREE.Quaternion());
      this.bindPos[b.name] = b.getWorldPosition(new THREE.Vector3());
    }
    this.hipsBind = this.bones.Hips.position.clone();
    root.position.copy(saveP); root.quaternion.copy(saveQ);
    this.poseCache = {};
    for (const k in POSES) this.poseCache[k] = this.buildPose(POSES[k]);
    this.clips = {};
    this.local = {}; for (const b of this.list) this.local[b.name] = new THREE.Quaternion();
    this.hips = new THREE.Vector3();
  }
  // delta (char-space at rest) -> local quaternion
  deltaLocal(name, deg) {
    const W = this.bindW[name];
    const d = qFromDeg(deg);
    return this.bindLocal[name].clone().multiply(W.clone().invert().multiply(d).multiply(W));
  }
  deltaOnly(name, deg) {
    const W = this.bindW[name];
    return W.clone().invert().multiply(qFromDeg(deg)).multiply(W);
  }
  buildPose(p) {
    const out = { q: {}, hips: p.hips ? new THREE.Vector3(...p.hips) : this.hipsBind.clone() };
    const rot = Object.assign({}, NEUTRAL, p.rot || {});
    for (const b of this.list) out.q[b.name] = rot[b.name] ? this.deltaLocal(b.name, rot[b.name]) : this.bindLocal[b.name].clone();
    return out;
  }
  // Retarget a clip from a source mixamo rig by matching bone directions.
  bakeClip(name, srcRoot, clip, opts = {}) {
    const fps = 30, frames = Math.max(2, Math.round(clip.duration * fps));
    const mixer = new THREE.AnimationMixer(srcRoot);
    const action = mixer.clipAction(clip); action.play();
    const sb = {}; srcRoot.traverse((o) => { if (o.isBone) sb[o.name.replace('mixamorig', '')] = o; });
    const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.flip ? Math.PI : 0);
    srcRoot.updateMatrixWorld(true);
    const srcInv = new THREE.Matrix4().copy(srcRoot.matrixWorld).invert();
    // source bind (frame 0 of TPose not available -> use rest via mixer stop)
    const sp = (bone) => bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(srcInv).applyQuaternion(flip);
    action.stop(); srcRoot.updateMatrixWorld(true);
    const srcHipsBindQ = srcRoot.quaternion.clone().invert().multiply(sb.Hips.getWorldQuaternion(new THREE.Quaternion()));
    const srcHipsY = sp(sb.Hips).y;
    action.play();
    const scale = this.hipsBind.y / srcHipsY;
    const data = [];
    // temporary target rig evaluation on a detached clone of bind data
    for (let f = 0; f < frames; f++) {
      mixer.setTime((f / fps));
      srcRoot.updateMatrixWorld(true);
      const local = {}; for (const b of this.list) local[b.name] = this.bindLocal[b.name].clone();
      // hips orientation delta in flipped char space
      const sh = srcRoot.quaternion.clone().invert().multiply(sb.Hips.getWorldQuaternion(new THREE.Quaternion()));
      const dq = flip.clone().multiply(sh.multiply(srcHipsBindQ.clone().invert())).multiply(flip.clone().invert());
      local.Hips = this.armatureQ().invert().multiply(dq.multiply(this.bindW.Hips));
      const hp = sp(sb.Hips).multiplyScalar(scale);
      const hips = new THREE.Vector3(opts.inPlace ? 0 : hp.x, hp.y, opts.inPlace ? 0 : hp.z);
      // forward kinematics on target in char space
      const W = {}, P = {};
      const fk = (bone) => {
        const pn = bone.parent && bone.parent.isBone ? bone.parent.name : null;
        const pw = pn ? W[pn] : this.armatureQ();
        W[bone.name] = pw.clone().multiply(local[bone.name]);
        const lp = bone.name === 'Hips' ? hips.clone() : bone.position.clone();
        P[bone.name] = pn ? lp.applyQuaternion(pw).add(P[pn]) : lp.applyQuaternion(this.armatureQ());
        for (const c of bone.children) if (c.isBone) fk(c);
      };
      fk(this.bones.Hips);
      for (const [a, c] of RETARGET_CHAIN) {
        if (!sb[a] || !sb[c] || !this.bones[a] || !this.bones[c]) continue;
        const want = sp(sb[c]).sub(sp(sb[a])).normalize();
        const have = P[c].clone().sub(P[a]).normalize();
        const r = new THREE.Quaternion().setFromUnitVectors(have, want);
        const bone = this.bones[a];
        const pn = bone.parent && bone.parent.isBone ? bone.parent.name : null;
        const pw = pn ? W[pn] : this.armatureQ();
        const nw = r.multiply(W[a]);
        local[a] = pw.clone().invert().multiply(nw);
        fk(bone);
      }
      data.push({ q: local, hips });
    }
    action.stop();
    this.clips[name] = { fps, frames, data, duration: frames / fps };
  }
  armatureQ() { const p = this.bones.Hips.parent; return p && !p.isBone ? p.quaternion.clone() : new THREE.Quaternion(); }
  parentWInv() { return this.armatureQ().invert(); }

  sampleClip(name, t, outLocal, outHips) {
    const c = this.clips[name];
    const ft = ((t * c.fps) % c.frames + c.frames) % c.frames;
    const f0 = Math.floor(ft), f1 = (f0 + 1) % c.frames, u = ft - f0;
    const A = c.data[f0], B = c.data[f1];
    for (const b of this.list) outLocal[b.name].slerpQuaternions(A.q[b.name], B.q[b.name], u);
    outHips.lerpVectors(A.hips, B.hips, u);
  }

  // ---- main evaluation -------------------------------------------------------
  // st = { pos:[x,y,z], yaw, clip:{name,t,w}, clip2:{...}, poses:[[name,w],...], add:{Bone:[deg]}, ... }
  evaluate(st) {
    const L = this.local;
    const tmpL = this._tmpL || (this._tmpL = Object.fromEntries(this.list.map((b) => [b.name, new THREE.Quaternion()])));
    const tmpH = this._tmpH || (this._tmpH = new THREE.Vector3());
    // base
    const neutral = this.poseCache.neutral;
    for (const b of this.list) L[b.name].copy(neutral.q[b.name]);
    this.hips.copy(neutral.hips);
    if (st.clip && st.clip.w > 0) {
      this.sampleClip(st.clip.name, st.clip.t, tmpL, tmpH);
      for (const b of this.list) L[b.name].slerp(tmpL[b.name], st.clip.w);
      this.hips.lerp(tmpH, st.clip.w);
    }
    if (st.clip2 && st.clip2.w > 0) {
      this.sampleClip(st.clip2.name, st.clip2.t, tmpL, tmpH);
      for (const b of this.list) L[b.name].slerp(tmpL[b.name], st.clip2.w);
      this.hips.lerp(tmpH, st.clip2.w);
    }
    for (const [name, w] of st.poses || []) {
      if (w <= 0.001) continue;
      const P = this.poseCache[name];
      for (const b of this.list) L[b.name].slerp(P.q[b.name], w);
      this.hips.lerp(P.hips, w);
    }
    // additive rotations
    if (st.add) for (const k in st.add) { if (this.bones[k]) L[k].multiply(this.deltaOnly(k, st.add[k])); }
    if (st.hipsAdd) this.hips.add(_v.set(...st.hipsAdd));
    // write to bones
    for (const b of this.list) b.quaternion.copy(L[b.name]);
    this.bones.Hips.position.copy(this.hips);
    this.root.position.set(...st.pos);
    this.root.rotation.set(st.pitch || 0, st.yaw || 0, st.roll || 0, 'YXZ');
    this.root.updateMatrixWorld(true);
    // look at (neck+head share)
    if (st.look && st.lookW > 0) this.lookAt(new THREE.Vector3(...st.look), st.lookW);
    if (st.ikL && st.ikL.w > 0) this.ik('Left', st.ikL);
    if (st.ikR && st.ikR.w > 0) this.ik('Right', st.ikR);
    if (st.eyes) this.eyesAt(new THREE.Vector3(...st.eyes));
    else this.eyesAt(null);
  }

  rotateWorld(bone, r) {
    bone.parent.getWorldQuaternion(_q);
    _q2.copy(_q).invert().multiply(r).multiply(_q);
    bone.quaternion.premultiply(_q2);
    bone.updateMatrixWorld(true);
  }
  forwardOf(name, out) {
    const b = this.bones[name];
    b.getWorldQuaternion(_q3);
    const W = this.bindW[name];
    // bone's rest "forward" = char +Z expressed in bone frame
    out.set(0, 0, 1).applyQuaternion(W.clone().invert()).applyQuaternion(_q3);
    return out;
  }
  lookAt(target, w) {
    const parts = [['Neck', 0.35], ['Head', 0.65]];
    for (const [n, f] of parts) {
      const b = this.bones[n];
      const p = b.getWorldPosition(_v);
      const want = _v2.copy(target).sub(p).normalize();
      const have = this.forwardOf(n, _v3);
      const full = new THREE.Quaternion().setFromUnitVectors(have, want);
      // clamp
      const ang = 2 * Math.acos(clamp(Math.abs(full.w), 0, 1));
      const lim = 70 * D2R;
      const k = ang > lim ? lim / ang : 1;
      const r = new THREE.Quaternion().slerp(full, f * w * k);
      this.rotateWorld(b, r);
    }
  }
  eyesAt(target) {
    for (const n of ['LeftEye', 'RightEye']) {
      const b = this.bones[n]; if (!b) continue;
      b.quaternion.copy(this.bindLocal[n]);
      b.updateMatrixWorld(true);
      if (!target) continue;
      const p = b.getWorldPosition(_v);
      const want = _v2.copy(target).sub(p).normalize();
      const have = this.forwardOf(n, _v3);
      const full = new THREE.Quaternion().setFromUnitVectors(have, want);
      const ang = 2 * Math.acos(clamp(Math.abs(full.w), 0, 1));
      const lim = 28 * D2R; const k = ang > lim ? lim / ang : 1;
      this.rotateWorld(b, new THREE.Quaternion().slerp(full, k));
    }
  }
  // two-bone IK: {target:[x,y,z], pole:[x,y,z], w, handRot?:Quaternion(world)}
  ik(side, o) {
    const A = this.bones[side + 'Arm'], B = this.bones[side + 'ForeArm'], C = this.bones[side + 'Hand'];
    const a = A.getWorldPosition(new THREE.Vector3()), b = B.getWorldPosition(new THREE.Vector3()), c = C.getWorldPosition(new THREE.Vector3());
    const tFull = new THREE.Vector3(...o.target);
    const t = c.clone().lerp(tFull, o.w);
    const lab = a.distanceTo(b), lbc = b.distanceTo(c);
    let lat = clamp(a.distanceTo(t), 0.02, lab + lbc - 0.002);
    const dir = t.clone().sub(a).normalize();
    const x = (lab * lab - lbc * lbc + lat * lat) / (2 * lat);
    const h = Math.sqrt(Math.max(0, lab * lab - x * x));
    const pole = o.pole ? new THREE.Vector3(...o.pole) : b.clone();
    const bend = pole.sub(a); bend.sub(dir.clone().multiplyScalar(bend.dot(dir)));
    if (bend.lengthSq() < 1e-8) bend.set(0, -1, 0); bend.normalize();
    const elbow = a.clone().add(dir.clone().multiplyScalar(x)).add(bend.multiplyScalar(h));
    this.rotateWorld(A, new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), elbow.clone().sub(a).normalize()));
    const b2 = B.getWorldPosition(new THREE.Vector3()), c2 = C.getWorldPosition(new THREE.Vector3());
    const tt = a.clone().add(dir.multiplyScalar(lat));
    this.rotateWorld(B, new THREE.Quaternion().setFromUnitVectors(c2.clone().sub(b2).normalize(), tt.sub(b2).normalize()));
    if (o.handRot) {
      // handRot: desired world rotation delta relative to char rest (array deg in char axes, applied in world via root yaw)
      const rootQ = this.root.getWorldQuaternion(new THREE.Quaternion());
      const want = rootQ.clone().multiply(qFromDeg(o.handRot)).multiply(this.bindW[side + 'Hand']);
      C.parent.getWorldQuaternion(_q);
      const cur = C.quaternion.clone();
      const tgt = _q.clone().invert().multiply(want);
      C.quaternion.copy(cur.slerp(tgt, o.w));
      C.updateMatrixWorld(true);
    }
    if (o.grip !== undefined) this.grip(side, o.grip);
  }
  grip(side, g) {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) {
      const b = this.bones[side + 'Hand' + f + i]; if (!b) continue;
      b.quaternion.copy(this.bindLocal[b.name]).multiply(this.deltaOnly(b.name, [g * (i === 1 ? 55 : 70), 0, 0]));
    }
    for (let i = 1; i <= 3; i++) {
      const b = this.bones[side + 'HandThumb' + i]; if (!b) continue;
      b.quaternion.copy(this.bindLocal[b.name]).multiply(this.deltaOnly(b.name, [g * 20, (side === 'Left' ? -1 : 1) * g * 25, 0]));
    }
    this.bones[side + 'Hand'].updateMatrixWorld(true);
  }
  worldPos(name) { return this.bones[name].getWorldPosition(new THREE.Vector3()); }
}

// ---------------------------------------------------------------------------
// Face morphs generated from the head geometry (bind space)
// ---------------------------------------------------------------------------
const EYE_L = new THREE.Vector3(0.0304, 1.7257, 0.0906), EYE_R = new THREE.Vector3(-0.0299, 1.7257, 0.0906);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function addFaceMorphs(head) {
  const g = head.geometry;
  const pos = g.attributes.position;
  const n = pos.count;
  const mk = () => new Float32Array(n * 3);
  const T = { blinkL: mk(), blinkR: mk(), wideL: mk(), wideR: mk(), browUp: mk(), browDown: mk(), frown: mk(), squint: mk(), sneer: mk(), lipPress: mk() };
  const v = new THREE.Vector3();
  const rotAbout = (arr, i, c, ang, w) => {
    if (w <= 0) return;
    const r = v.clone().sub(c);
    const ca = Math.cos(ang * w), sa = Math.sin(ang * w);
    const y = r.y * ca - r.z * sa, z = r.y * sa + r.z * ca;
    arr[i * 3 + 1] += y - r.y; arr[i * 3 + 2] += z - r.z;
  };
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, i);
    for (const [E, s] of [[EYE_L, 'L'], [EYE_R, 'R']]) {
      const dx = Math.abs(v.x - E.x), dy = v.y - E.y, front = sstep(E.z - 0.012, E.z - 0.002, v.z);
      const hx = 1 - sstep(0.012, 0.024, dx);
      // upper lid
      const up = hx * front * (dy > -0.003 ? 1 - sstep(0.007, 0.019, dy) : 0) * sstep(-0.003, 0.0015, dy);
      rotAbout(T['blink' + s], i, E, 0.80, up);
      rotAbout(T['wide' + s], i, E, -0.22, up);
      // lower lid comes up slightly in a blink and in a squint
      const lo = hx * front * (dy < 0.0 ? 1 - sstep(0.006, 0.016, -dy) : 0) * sstep(0.0035, -0.0015, dy);
      rotAbout(T['blink' + s], i, E, -0.16, lo);
      rotAbout(T.squint, i, E, -0.28, lo);
      rotAbout(T.squint, i, E, 0.12, up);
    }
    // brows
    const ax = Math.abs(v.x);
    const browBand = Math.exp(-Math.pow((v.y - 1.749) / 0.012, 2)) * sstep(0.06, 0.08, v.z) * (1 - sstep(0.05, 0.065, ax));
    const inner = 1 - sstep(0.004, 0.04, ax);
    T.browUp[i * 3 + 1] += 0.0042 * browBand * (0.35 + 0.65 * inner);
    T.browUp[i * 3 + 2] += 0.0008 * browBand;
    T.browDown[i * 3 + 1] -= 0.0032 * browBand * (0.4 + 0.6 * inner);
    T.browDown[i * 3 + 0] -= Math.sign(v.x) * 0.0018 * browBand * inner;
    T.browDown[i * 3 + 2] += 0.0012 * browBand * inner;
    // mouth corners
    for (const sx of [1, -1]) {
      const d = Math.hypot(v.x - sx * 0.0255, (v.y - 1.651) * 1.2);
      const w = Math.exp(-Math.pow(d / 0.011, 2)) * sstep(0.08, 0.1, v.z);
      T.frown[i * 3 + 1] -= 0.0034 * w; T.frown[i * 3 + 0] -= sx * 0.0008 * w;
      T.lipPress[i * 3 + 0] += sx * 0.001 * w;
    }
    // nose wrinkle / sneer (disgust/fear)
    const nw = Math.exp(-Math.pow(Math.hypot(ax - 0.014, v.y - 1.688) / 0.01, 2)) * sstep(0.1, 0.12, v.z);
    T.sneer[i * 3 + 1] += 0.0022 * nw;
    // lip press: lips thin
    const lip = Math.exp(-Math.pow((v.y - 1.651) / 0.006, 2)) * (1 - sstep(0.02, 0.03, ax)) * sstep(0.1, 0.12, v.z);
    T.lipPress[i * 3 + 1] += (v.y > 1.651 ? -1 : 1) * 0.0016 * lip;
  }
  const names = Object.keys(T);
  for (const k of names) {
    g.morphAttributes.position.push(new THREE.Float32BufferAttribute(T[k], 3));
    head.morphTargetDictionary[k] = head.morphTargetInfluences.length;
    head.morphTargetInfluences.push(0);
  }
  if (g.morphAttributes.normal) {
    for (const k of names) g.morphAttributes.normal.push(new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  }
}

// ---------------------------------------------------------------------------
// Shader helpers (bind-space masks for scalp / beard / under-eye)
// ---------------------------------------------------------------------------
const GLSL_MASKS = /* glsl */`
float hsh(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hsh(i),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float scalpMask(vec3 p){
  float hy = mix(1.786, 1.655, smoothstep(0.07, -0.045, p.z));
  float ear = smoothstep(0.062,0.072,abs(p.x)) * smoothstep(0.055,0.03,p.z) * smoothstep(-0.05,-0.025,p.z);
  hy = max(hy, mix(hy, 1.752, ear));
  // temples recede a bit
  hy += 0.006*smoothstep(0.035,0.06,abs(p.x))*smoothstep(0.04,0.09,p.z);
  float m = smoothstep(hy-0.003, hy+0.009, p.y + 0.004*(vnoise(p*260.0)-0.5));
  return m;
}
float beardMask(vec3 p){
  float ax = abs(p.x);
  float yb = mix(1.671, 1.698, smoothstep(0.03, 0.07, ax)) + 0.003*(vnoise(p*300.0)-0.5);
  float m = smoothstep(yb+0.004, yb-0.006, p.y);
  m *= smoothstep(1.585, 1.605, p.y + 0.06*smoothstep(0.05,0.0,ax)*0.0) ;
  m *= smoothstep(0.012, 0.04, p.z + 0.03*smoothstep(0.03,0.07,ax)*0.0);
  // sideburn up to scalp near ears
  float sb = smoothstep(0.058,0.068,ax)*smoothstep(0.0,0.02,p.z)*smoothstep(0.065,0.045,p.z)*smoothstep(1.76,1.73,p.y)*smoothstep(1.66,1.68,p.y);
  m = max(m, sb);
  // keep lips clean
  float lip = smoothstep(1.0, 0.75, length(vec2(p.x/0.03, (p.y-1.6505)/0.0105)));
  m *= 1.0 - lip;
  // throat / under chin falloff
  m *= smoothstep(1.58, 1.62, p.y + (p.z-0.05)*0.6);
  return clamp(m,0.0,1.0);
}
float underEye(vec3 p){
  float d = min(length(vec2((p.x-0.031)/1.25, p.y-1.7125)), length(vec2((p.x+0.031)/1.25, p.y-1.7125)));
  return exp(-pow(d/0.0085,2.0)) * smoothstep(0.08,0.1,p.z);
}
`;

// hair shell material
function hairMaterial(skeletonMat, layer, uniforms) {
  const m = new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.55, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLayer = { value: layer };
    sh.uniforms.uHair = uniforms.uHair; sh.uniforms.uBeard = uniforms.uBeard; sh.uniforms.uMess = uniforms.uMess;
    sh.uniforms.uHairCol = uniforms.uHairCol;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uLayer, uHair, uBeard, uMess; varying vec3 vBase; varying float vMask; varying float vIsBeard;\n${GLSL_MASKS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vBase = position;
        float sm = scalpMask(position); float bm = beardMask(position);
        float len = max(sm*uHair, bm*uBeard);
        vIsBeard = bm*uBeard > sm*uHair ? 1.0 : 0.0;
        vMask = len;
        vec3 n = normalize(normal);
        vec3 comb = normalize(vec3(0.0,-0.35,-0.6) + vec3(vnoise(position*90.0)-0.5, vnoise(position*90.0+7.0)-0.5, 0.0)*uMess*1.6);
        if (vIsBeard > 0.5) comb = vec3(0.0,-1.0,0.15);
        float h = len*uLayer;
        transformed += n*h*0.85 + comb*h*0.55*uLayer + vec3(0.0,-1.0,0.0)*h*h*6.0;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uLayer, uMess; uniform vec3 uHairCol; varying vec3 vBase; varying float vMask; varying float vIsBeard;\n${GLSL_MASKS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vMask < 0.0012) discard;
        float freq = vIsBeard > 0.5 ? 1500.0 : 1050.0;
        vec3 q = vBase*freq;
        vec3 cell = floor(q); vec3 f = fract(q)-0.5;
        float r = hsh(cell);
        float r2 = hsh(cell+13.1);
        float dens = vIsBeard > 0.5 ? 0.42 : 0.86;
        float rad = 0.62*(1.0 - uLayer*mix(0.65,0.95,r2));
        if (r > dens || length(f) > rad) discard;
        if (uLayer > 0.12 && hsh(cell+3.7) < uLayer*0.55) discard;
        float shade = mix(0.30, 1.0, pow(uLayer,0.7));
        diffuseColor.rgb = uHairCol * shade * mix(0.75,1.25,r2);`);
  };
  m.customProgramCacheKey = () => 'hair' + layer;
  return m;
}

// skin: stubble darkening, fatigue, pallor, dirt
function patchSkin(mat, U) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBase = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBase; uniform float uStubble, uFatigue, uPallor, uDirt, uSweat, uIsHead;\n${GLSL_MASKS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bp = vBase;
        if (uIsHead > 0.5) {
          float bm = beardMask(bp);
          float dots = step(0.55, hsh(floor(bp*1500.0)));
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.55,0.5,0.48), bm*uStubble*(0.55+0.45*dots));
          float sm = scalpMask(bp);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09,0.065,0.05), sm*0.92);
          float ue = underEye(bp);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.52,0.42,0.5), ue*uFatigue);
          // red-rimmed eyes
          float rim = exp(-pow(min(length(vec2(bp.x-0.0304,(bp.y-1.7257)*1.6)),length(vec2(bp.x+0.0299,(bp.y-1.7257)*1.6)))/0.017,2.0))*smoothstep(0.09,0.105,bp.z);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.08,0.82,0.82), rim*uFatigue*0.6);
        }
        float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum)*vec3(0.98,0.97,0.9), uPallor*0.55);
        float dn = vnoise(bp*140.0)*0.5 + vnoise(bp*420.0)*0.5;
        diffuseColor.rgb *= 1.0 - uDirt*0.18*smoothstep(0.55,0.9,dn);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.85,0.8,0.74), uDirt*0.35);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, uSweat);');
  };
  mat.customProgramCacheKey = () => 'skin' + U.uIsHead.value;
}

// clothes recolor: keep fabric luminance detail from the original texture
function patchCloth(mat, color, U, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCol = { value: new THREE.Color(color) };
    sh.uniforms.uGrime = U.uGrime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBase;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBase = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBase; uniform vec3 uCol; uniform float uGrime;\n${GLSL_MASKS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float lum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));
        float det = clamp(0.55 + (lum-0.45)*0.9, 0.25, 1.2);
        vec3 c = uCol * det * (0.92 + 0.16*vnoise(vBase*900.0));
        float dn = vnoise(vBase*18.0)*0.55 + vnoise(vBase*70.0)*0.3 + vnoise(vBase*260.0)*0.15;
        c *= 1.0 - uGrime*0.5*smoothstep(0.42,0.78,dn);
        c = mix(c, c*vec3(0.85,0.78,0.65), uGrime*0.5*smoothstep(0.5,0.7,vnoise(vBase*9.0+3.0)));
        diffuseColor.rgb = c;`);
  };
  mat.customProgramCacheKey = () => 'cloth' + key;
  mat.roughness = 0.92; mat.metalness = 0;
}

// ---------------------------------------------------------------------------
export class Actor {
  constructor(gltf, opts = {}) {
    this.root = gltf.scene;
    this.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
    const hw = this.root.getObjectByName('Wolf3D_Headwear'); if (hw) hw.visible = false;
    const bd = this.root.getObjectByName('Wolf3D_Beard'); if (bd) bd.visible = false;
    this.head = this.root.getObjectByName('Wolf3D_Head');
    this.teeth = this.root.getObjectByName('Wolf3D_Teeth');
    this.rig = new Rig(this.root);
    addFaceMorphs(this.head);
    this.U = {
      uStubble: { value: 0.1 }, uFatigue: { value: 0 }, uPallor: { value: 0 }, uDirt: { value: 0 }, uSweat: { value: 0 },
      uGrime: { value: 0 },
    };
    const headU = Object.assign({}, this.U, { uIsHead: { value: 1 } });
    const bodyU = Object.assign({}, this.U, { uIsHead: { value: 0 } });
    this.head.material = this.head.material.clone(); patchSkin(this.head.material, headU);
    const body = this.root.getObjectByName('Wolf3D_Body');
    if (body) { body.material = body.material.clone(); patchSkin(body.material, bodyU); }
    const cols = opts.clothes || { top: 0x2a2d31, bottom: 0x1f2a3a, shoes: 0x1a1816 };
    const top = this.root.getObjectByName('Wolf3D_Outfit_Top'); if (top) { top.material = top.material.clone(); patchCloth(top.material, cols.top, this.U, 't' + (opts.key || '')); }
    const bot = this.root.getObjectByName('Wolf3D_Outfit_Bottom'); if (bot) { bot.material = bot.material.clone(); patchCloth(bot.material, cols.bottom, this.U, 'b' + (opts.key || '')); }
    const sho = this.root.getObjectByName('Wolf3D_Outfit_Footwear'); if (sho) { sho.material = sho.material.clone(); patchCloth(sho.material, cols.shoes, this.U, 's' + (opts.key || '')); }
    if (this.head.material) { this.head.material.roughness = 0.62; }
    // hair shells
    this.HU = { uHair: { value: 0.009 }, uBeard: { value: 0.0 }, uMess: { value: 0.0 }, uHairCol: { value: new THREE.Color(opts.hairColor || 0x20160f) } };
    this.shells = [];
    const N = opts.shells ?? 14;
    for (let i = 0; i < N; i++) {
      const layer = (i + 1) / N;
      const m = new THREE.SkinnedMesh(this.head.geometry, hairMaterial(null, layer, this.HU));
      m.morphTargetInfluences = this.head.morphTargetInfluences; m.morphTargetDictionary = this.head.morphTargetDictionary;
      m.bind(this.head.skeleton, this.head.bindMatrix);
      m.castShadow = i % 4 === 0; m.receiveShadow = true; m.frustumCulled = false;
      this.head.parent.add(m);
      this.shells.push(m);
    }
    this.face = {};
  }
  setLook(day) {
    // day 1..30 -> appearance
    const k = clamp((day - 1) / 29);
    this.HU.uHair.value = lerp(0.0085, 0.019, k);
    this.HU.uBeard.value = day < 7 ? 0 : lerp(0.0012, 0.0072, clamp((day - 7) / 23));
    this.HU.uMess.value = clamp((day - 2) / 18);
    this.U.uStubble.value = clamp(0.08 + day * 0.08);
    this.U.uFatigue.value = clamp((day - 2) / 20) * 0.95;
    this.U.uPallor.value = clamp((day - 8) / 22) * 0.75;
    this.U.uDirt.value = clamp((day - 6) / 24) * 0.8;
    this.U.uGrime.value = clamp((day - 3) / 25);
    this.U.uSweat.value = 0.15;
  }
  // face: {blink, browUp, browDown, frown, smile, jaw, wide, squint, sneer, press}
  setFace(f) {
    const d = this.head.morphTargetDictionary, I = this.head.morphTargetInfluences;
    const set = (k, v) => { if (d[k] !== undefined) I[d[k]] = clamp(v || 0); };
    set('blinkL', Math.max(f.blink || 0, f.blinkL || 0)); set('blinkR', Math.max(f.blink || 0, f.blinkR || 0));
    set('wideL', f.wide); set('wideR', f.wide);
    set('browUp', f.browUp); set('browDown', f.browDown); set('frown', f.frown); set('squint', f.squint);
    set('sneer', f.sneer); set('lipPress', f.press);
    set('mouthOpen', f.jaw); set('mouthSmile', f.smile);
    if (this.teeth) {
      const td = this.teeth.morphTargetDictionary, ti = this.teeth.morphTargetInfluences;
      if (td && td.mouthOpen !== undefined) ti[td.mouthOpen] = clamp(f.jaw || 0);
      if (td && td.mouthSmile !== undefined) ti[td.mouthSmile] = clamp(f.smile || 0);
    }
  }
}

// natural blinking: returns blink amount for time t (seed per actor)
export function blinkAt(t, rate = 0.28, seed = 0) {
  // blinks roughly every 1/rate seconds with jitter
  const period = 1 / rate;
  const i = Math.floor((t + seed) / period);
  const off = (Math.sin(i * 91.7 + seed) * 0.5 + 0.5) * period * 0.6;
  const tb = i * period + off - seed;
  const d = t - tb;
  if (d < 0 || d > 0.2) return 0;
  return d < 0.07 ? d / 0.07 : 1 - (d - 0.07) / 0.13;
}

export function breathing(t, rate = 0.25, amp = 1) {
  const s = Math.sin(t * rate * Math.PI * 2);
  return { Spine1: [-1.2 * s * amp, 0, 0], Spine2: [-1.6 * s * amp, 0, 0], LeftShoulder: [0, 0, 0.8 * s * amp], RightShoulder: [0, 0, -0.8 * s * amp], Neck: [1.0 * s * amp, 0, 0] };
}

export function mergeAdd(...objs) {
  const out = {};
  for (const o of objs) for (const k in o) { const a = out[k] || [0, 0, 0]; out[k] = [a[0] + o[k][0], a[1] + o[k][1], a[2] + o[k][2]]; }
  return out;
}

export function idleSway(t, amp = 1, seed = 0) {
  return {
    Spine: [fbm1(t * 0.3 + seed) * 1.5 * amp, fbm1(t * 0.25 + seed + 4) * 2 * amp, fbm1(t * 0.2 + seed + 9) * 1.2 * amp],
    Head: [fbm1(t * 0.4 + seed + 2) * 2.5 * amp, fbm1(t * 0.35 + seed + 6) * 4 * amp, 0],
  };
}
export function tremble(t, amp = 1) {
  return {
    LeftHand: [noise1(t * 23) * 3 * amp, 0, noise1(t * 19 + 3) * 3 * amp],
    RightHand: [noise1(t * 21 + 5) * 3 * amp, 0, noise1(t * 25 + 8) * 3 * amp],
    Head: [noise1(t * 17 + 2) * 0.8 * amp, noise1(t * 15 + 9) * 0.8 * amp, 0],
  };
}
