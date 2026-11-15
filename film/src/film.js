// Director: every frame is a pure function of time t (seconds).
import * as THREE from 'three';
import { World } from './world.js';
import { PovHands } from './people.js';
import { outlineUniforms } from './toon.js';
import { track, smooth, sramp, clamp, lerp, noise1, fbm1 } from './util.js';

const script = await (await fetch('./script.json')).json();
let lines = null;
try { lines = await (await fetch('./lines.json')).json(); } catch (e) { lines = null; }
const DE = await (await fetch('./de.json')).json();
const SC = Object.fromEntries(script.scenes.map((s) => [s.id, s]));
const abs = (id, u) => SC[id].start + u;
const flashes = script.flashes.map(([id, u]) => abs(id, u));

const params = new URLSearchParams(location.search);
const W = +(params.get('w') || 720), H = +(params.get('h') || 1280);
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('stage').appendChild(renderer.domElement);
outlineUniforms.uRes.value.set(W, H); outlineUniforms.uPx.value = 2.2 * W / 1080 * 1.4;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, W / H, 0.05, 2000);
scene.add(camera);
const world = new World(scene);
const hands = new PovHands(0xf1c27d, 0x4a5a6a); camera.add(hands.group);

// ---------------------------------------------------------------- helpers
const V3 = (a) => new THREE.Vector3(...a);
const kv = (u, keys) => track(keys, u);
function shake(t, a) { return [noise1(t * 9) * a, noise1(t * 8 + 4) * a, noise1(t * 7 + 9) * a]; }
function walkBob(u, a = 0.03, f = 9) { return Math.abs(Math.sin(u * f)) * a; }
const HANDS_REST = () => { hands.set(1, [-0.25, -0.42, -0.4], [0.3, 0, 0], 0.4, false); hands.set(-1, [0.25, -0.42, -0.4], [0.3, 0, 0], 0.4, false); };
function holdFlash(s, pos, rot, on) { // flashlight in hand s
  world.flashlight.visible = true;
  const h = hands.h[s];
  h.grip.add(world.flashlight); world.flashlight.position.set(0, 0.0, 0.02); world.flashlight.rotation.set(0, 0, 0);
  hands.set(s, pos, rot, 1.0, true);
  setFlash(on);
}
let flashOn = 0;
function setFlash(on) {
  flashOn = on;
  world.beam.visible = on > 0; world.beam.material.opacity = 0.07 * on; world.lens.material.color.setHex(on > 0 ? 0xfff6d0 : 0x444444);
  world.flash.intensity = on * 40;
  world.flashlight.updateMatrixWorld(true);
  world.flashlight.getWorldPosition(world.flash.position);
  const d = new THREE.Vector3(0, 0, -1).applyQuaternion(world.flashlight.getWorldQuaternion(new THREE.Quaternion()));
  world.flash.target.position.copy(world.flash.position).add(d);
  world.flash.target.updateMatrixWorld();
}
function heroFlash(on) { // flashlight in hero's right hand (third person)
  const hand = world.hero.arm[-1].hand;
  hand.add(world.flashlight); world.flashlight.position.set(0, -0.06, 0.03); world.flashlight.rotation.set(Math.PI / 2, 0, 0);
  world.flashlight.visible = true; setFlash(on);
}

// ---------------------------------------------------------------- scenes
// each returns { cam:{pos,look,fov,roll}, st:{world state}, hero:pose|null, woman, zombie, pov:bool }
const S = {};
S.intro = (u) => {
  const p = kv(u, [[0, [60, 70, -160]], [14, [4, 3, -20], smooth]]);
  const l = kv(u, [[0, [0, -10, 0]], [14, [0.5, 1.3, -2], smooth]]);
  return { cam: { pos: p, look: l, fov: 55 }, st: { sky: 'sunset', cityLights: 0.5, traffic: 'flow', power: 1, tv: 1, tvMode: 'show' },
    hero: { x: 0.75, z: 0.6, yaw: Math.PI / 2, sit: 1, armL: [0.6, 0.1, -1.0], armR: [0.6, 0.1, -1.0] } };
};
S.day1 = (u) => {
  const st = { sky: 'sunset', cityLights: 0.55, traffic: u < 40 ? 'flow' : 'chaos', power: 1, tv: 1, tvMode: u < 10.4 ? 'show' : 'news', smoke: u > 40 ? 0.4 : 0, panic: u > 40 ? 1 : 0, walkers: u > 44 ? 1 : 0 };
  if (u < 34) { // POV on the sofa watching TV
    const push = sramp(u, 11, 30);
    const pos = [lerp(0.8, 1.6, push), 1.15, 0.6];
    HANDS_REST();
    // remote control in right hand, bowl in left at start
    hands.set(-1, [0.2, -0.33, -0.42], [0.5, -0.2, 0], 0.8, true);
    hands.set(1, [-0.24, -0.38, -0.45], [0.4, 0.2, 0], 0.3, u < 12);
    return { cam: { pos, look: [5.6, 1.3 - push * 0.05, 0.6], fov: 58 }, st, pov: true };
  }
  if (u < 41) { // stand up, walk to window
    const k = sramp(u, 34, 41);
    const p = [lerp(1.0, 0.6, k), lerp(1.2, 1.65, sramp(u, 34, 35.5)) - walkBob(u) * (u > 35.5 ? 1 : 0), lerp(0.6, -3.5, sramp(u, 35.2, 41))];
    const look = [lerp(5.6, 0.6, sramp(u, 34.5, 36.5)), lerp(1.3, 0.2, sramp(u, 39, 41)), lerp(0.6, -12, sramp(u, 34.5, 36.5))];
    HANDS_REST();
    return { cam: { pos: p, look, fov: 62 }, st, pov: true };
  }
  if (u < 52.5) { // look down at the street, crash, people
    st.crash = u < 46.2 ? (u - 46.2) / 6 : (u - 46.2) / 2;
    const lk = kv(u, [[41, [1, -80, -18]], [46, [-4, -80, -16]], [52.5, [3, -80, -19]]]);
    hands.set(1, [-0.3, -0.25, -0.5], [0.0, 0.2, 0], 0.1, true); hands.set(-1, [0.3, -0.25, -0.5], [0.0, -0.2, 0], 0.1, true);
    return { cam: { pos: [0.6, 1.75, -6.3], look: lk, fov: lerp(55, 38, sramp(u, 41, 52)) }, st, pov: true };
  }
  if (u < 61) { // helicopter passes right over, camera tilts up
    const k = (u - 52.5) / 8.5;
    st.heli = { pos: [lerp(-60, 70, k), 9 + Math.sin(k * 3) * 2, -14], yaw: Math.PI / 2, pitch: 0.18, beam: false };
    st.crash = 1;
    const sh = shake(u, 0.01 * Math.sin(k * Math.PI));
    HANDS_REST();
    return { cam: { pos: [0.6 + sh[0], 1.65 + sh[1], -3.55], look: [st.heli.pos[0] * 0.7, lerp(-10, 8, sramp(u, 52.5, 56)), -14], fov: 60 }, st, pov: true };
  }
  // third person: him at the window, hands on head, slow push in
  st.crash = 1;
  const hero = { x: 0.6, z: -3.45, yaw: Math.PI, armL: [2.3, 0.7, -2.2], armR: [2.3, 0.7, -2.2], headX: 0.35, spine: 0.08 };
  const pos = kv(u, [[61, [-1.4, 1.5, -2.6]], [66, [-0.6, 1.55, -3.0]]]);
  return { cam: { pos, look: [0.6, 1.5, -3.6], fov: 45 }, st, hero };
};
S.day3 = (u) => {
  const st = { sky: 'morning', cityLights: 0, traffic: 'chaos', power: 1, smoke: 0.6, walkers: 1 };
  if (u < 23) { // fridge POV, counting
    st.fridgeOpen = kv(u, [[6, 0], [8, 1.7]]);
    const pos = kv(u, [[0, [-2.0, 1.65, 1.5]], [6, [-3.35, 1.62, 1.85]]]);
    const look = kv(u, [[0, [-4.5, 1.2, 1.9]], [10, [-4.55, 0.85, 1.9]], [17, [-4.55, 1.2, 1.9]]]);
    HANDS_REST();
    if (u > 6 && u < 8) hands.set(1, [-0.15, -0.15, -0.5], [0, 0.5, 0], 0.9, true);
    if (u >= 11.5 && u < 20) { // finger pointing along bottles, then cans
      const k = clamp((u - 12) / 4.5);
      const z = u < 17.2 ? lerp(-0.22, 0.24, k) : lerp(-0.12, 0.2, clamp((u - 17.3) / 2));
      const y = u < 17.2 ? -0.3 : -0.12;
      hands.set(-1, [z * 0.9, y, -0.55], [0, -0.1, 0], 0.7, true);
    }
    return { cam: { pos, look, fov: 60 }, st, pov: true };
  }
  if (u < 31) { // walk down hallway, lock door
    st.bolt = u < 26 ? 0 : 1; st.dresser = 0;
    const pos = [2.8, 1.62 - walkBob(u) * (u < 25.5 ? 1 : 0), lerp(3.5, 7.3, sramp(u, 23, 25.5))];
    HANDS_REST();
    if (u > 25.4) hands.set(-1, [lerp(0.15, 0.1, sramp(u, 25.5, 26)), -0.12, -0.42], [0, 0, (u > 26 ? 1 : 0) * 1.4 + (u > 27.5 ? -1 : 0) * 0.5], 0.8, true);
    return { cam: { pos, look: [2.8, 1.2, 8.1], fov: 60 }, st, pov: true };
  }
  // pushing the dresser (third person)
  const dk = st.dresser = sramp(u, 32.5, 39.6);
  const dp = new THREE.Vector3(lerp(3.4, 2.82, dk), 0, lerp(6.0, 7.65, dk));
  const dir = new THREE.Vector3(-0.33, 0, 0.94).normalize();
  const hp = dp.clone().sub(dir.clone().multiplyScalar(0.72));
  const pushing = u > 32.3 && u < 39.8;
  const hero = { x: hp.x, z: hp.z, yaw: Math.atan2(dir.x, dir.z), walk: pushing ? 0.7 : 0, phase: u * 5, spine: pushing ? 0.45 : 0.2, armL: [1.3, 0.15, -0.3], armR: [1.3, 0.15, -0.3], headX: -0.2, armSwing: 0 };
  if (u > 40) { hero.spine = 0.3 + Math.sin(u * 4) * 0.04; hero.headX = 0.3; hero.armL = [1.2, 0.1, -0.5]; hero.armR = [1.2, 0.1, -0.5]; }
  const sh = u > 39.6 && u < 40.3 ? shake(u, 0.03) : [0, 0, 0];
  const pos = kv(u, [[31, [2.6, 1.0, 4.0]], [50, [2.4, 1.3, 4.6]]]);
  return { cam: { pos: [pos[0] + sh[0], pos[1] + sh[1], pos[2]], look: [2.9, 0.9, 7.2], fov: 55 }, st, hero };
};
S.day7 = (u) => {
  const st = { sky: 'night', cityLights: lerp(0.5, 0.0, sramp(u, 15, 24)), traffic: 'park', smoke: 0.5, walkers: 1 };
  const fl = u > 14 && u < 15.2 ? ((u * 13) % 1 > 0.5 ? 1 : 0.2) : 1;
  st.power = u < 15 ? fl : 0; st.tv = u < 15 ? 1 : 0; st.tvMode = 'static';
  if (u < 27) { // wide, from behind the sofa toward window
    const pos = kv(u, [[0, [-2.0, 1.7, 3.2]], [27, [-1.2, 1.5, 2.2]]]);
    return { cam: { pos, look: [1.5, 1.0, -4], fov: 52 }, st, hero: { x: 0.75, z: 0.6, yaw: Math.PI / 2, sit: 1, armL: [0.6, 0.1, -1.0], armR: [0.6, 0.1, -1.0], headY: u > 15.5 ? -0.9 : 0, headX: u > 15.5 ? -0.1 : 0 } };
  }
  // POV on the floor with flashlight
  const look = kv(u, [[27, [0, 0.6, -3]], [31, [-4.5, 1.0, 0]], [35, [1.5, 1.3, 4]], [40, [2.8, 1.1, 7.5]], [50, [2.8, 1.0, 7.9]]]);
  const pos = kv(u, [[27, [-0.4, 0.95, 0.0]], [50, [-0.4, 0.9, 0.2]]]);
  const tr = u > 36 ? shake(u * 2, 0.004) : [0, 0, 0];
  HANDS_REST();
  holdFlash(-1, [0.16 + tr[0], -0.25 + tr[1], -0.45], [0.05, 0, 0], u > 27 ? 1 : 0);
  return { cam: { pos, look, fov: 62 }, st, pov: true };
};
S.day12 = (u) => {
  const st = { sky: 'night', cityLights: 0, power: 0, traffic: 'park', smoke: 0.4, dresser: 1, feet: u > 9 && u < 30, stairLight: u > 9 && u < 30 };
  const bang = Math.max(...[31, 32, 33.2].map((b) => (u > b && u < b + 0.4) ? 1 - (u - b) / 0.4 : 0));
  st.doorShake = bang * Math.sin(u * 60); st.dresserShake = bang * Math.sin(u * 50);
  if (u < 36) { // slow dolly down the hallway toward the door
    const pos = kv(u, [[0, [2.8, 1.5, 2.0]], [30, [2.8, 1.3, 6.4]], [36, [2.8, 1.25, 6.7]]]);
    const sh = shake(u, bang * 0.03);
    world.flashlight.visible = false; setFlash(0);
    return { cam: { pos: [pos[0] + sh[0], pos[1] + sh[1], pos[2]], look: [2.8, 0.9, 8.0], fov: lerp(55, 40, sramp(u, 0, 30)) }, st, ambientMoon: 1 };
  }
  // POV hiding behind sofa, hand over mouth
  HANDS_REST();
  const br = Math.sin(u * 2.2) * 0.01;
  hands.set(1, [0.0, -0.12 + br, -0.22], [0.2, 0.3, -0.9], 0.3, u > 40 && u < 48);
  return { cam: { pos: [-0.15, 0.82 + br, -0.1], look: [2.8, 1.0, 4.5], fov: 58 }, st, pov: true };
};
S.day17 = (u) => {
  const fl = Math.max(0, ...flashes.map((f) => { const d = abs('day17', u) - f; return d > 0 && d < 0.5 ? (1 - d / 0.5) * (d < 0.1 || (d > 0.18 && d < 0.26) ? 1 : 0.4) : 0; }));
  const st = { sky: 'storm', cityLights: 0, power: 0, rain: 1, traffic: 'park', smoke: 0.8, flash: fl, walkers: 1 };
  if (u < 23) { // POV at the table, bottle in hands
    world.lastBottle.visible = false;
    HANDS_REST();
    const tw = Math.sin(u * 0.8) * 0.3;
    hands.set(1, [-0.08, -0.22, -0.42], [0.2, 0.6 + tw * 0.2, 0], 0.9, true);
    hands.set(-1, [0.1, -0.24, -0.42], [0.2, -0.5, 0], 0.9, true);
    const b = world.bottles[0];
    hands.h[1].grip.add(b); b.position.set(0.06, 0.02, 0.03); b.rotation.set(0, 0, tw); b.scale.setScalar(1);
    return { cam: { pos: [-2.6, 1.3, 0.25], look: kv(u, [[0, [-2.4, 0.85, 1.4]], [12, [-2.2, 1.0, -3.5]], [23, [-2.3, 0.95, -4]]]), fov: 55 }, st, pov: true };
  }
  if (u < 32) { // bathroom tap: a few drops
    HANDS_REST();
    hands.set(-1, [0.05, -0.2, -0.5], [0.4, 0, u > 24 ? 1.2 : 0], 0.8, true);
    return { cam: { pos: [-3.3, 1.55, 3.0], look: [-3.2, 0.9, 3.7], fov: 50 }, st, pov: true };
  }
  // third person slumped at table, window with storm behind
  world.lastBottle.visible = true;
  const hero = { x: -2.6, z: 0.45, yaw: 0, sit: 1, seatH: 0.5, spine: 0.55, headX: 0.45, armL: [1.3, 0.25, -1.1], armR: [1.3, 0.25, -1.3] };
  const ang = lerp(0.3, -0.3, sramp(u, 32, 50));
  return { cam: { pos: [-2.6 + Math.sin(ang) * 2.4, 1.3, 0.8 + Math.cos(ang) * 2.4], look: [-2.6, 0.95, 0.6], fov: 48 }, st, hero };
};
S.day23 = (u) => {
  const st = { sky: 'overcast', cityLights: 0, power: 0, traffic: 'park', smoke: 0.7, walkers: 1, slide: sramp(u, 17.5, 19) };
  // woman across the street
  const wk = sramp(u, 7, 10);
  let woman = { x: lerp(-2.4, -1.2, wk), z: -23.4 + wk * 0.6, yaw: 0, walk: u > 7 && u < 10 ? 1 : 0, phase: u * 6 };
  if (u > 12 && u < 44) { // waving / signals
    const wv = Math.sin(u * 7);
    woman.armR = u < 30 ? [2.7, 0.4 + wv * 0.35, -0.3] : u < 38 ? [1.2, 0.2, -0.2] : [2.4, 0.2, -0.4];
    woman.armL = u > 30 && u < 34 ? [1.4, 0.1, -0.1] : u >= 34 && u < 39 ? [2.0, 0.2, -1.4] : undefined;
  }
  let zombie = null;
  if (u > 37) {
    const zk = sramp(u, 38, 44.5);
    zombie = { x: lerp(-2.4, -1.5, zk), z: -23.5 + zk * 0.8, yaw: 0.2, walk: 1, phase: u * 3, spine: 0.35, armL: [1.5, 0.1, -0.1], armR: [1.4, 0.1, -0.2], armSwing: 0.2, headZ: 0.3 };
  }
  if (u > 43) { woman.yaw = Math.PI * sramp(u, 43, 43.6); woman.armL = [1.8, 0.3, -1.6]; woman.armR = [1.8, 0.3, -1.6]; }
  if (u > 44.5) { // both fall out of view behind the railing
    const fk = sramp(u, 44.5, 45.6);
    woman.y = -1.6 * fk; woman.spine = -0.8 * fk; zombie.y = -1.4 * fk; zombie.spine = 0.9 * fk;
  }
  if (u > 47) { woman = null; zombie = null; }
  if (u < 50) {
    const out = sramp(u, 18.5, 21);
    const pos = [2.0 + shake(u, 0.002)[0], 1.62, lerp(-3.5, -5.3, out)];
    const fov = u < 12 ? lerp(60, 30, sramp(u, 6, 12)) : (u > 42 ? lerp(30, 40, sramp(u, 42, 43)) : 30);
    HANDS_REST();
    if (u > 17 && u < 19.3) hands.set(-1, [0.2, -0.1, -0.45], [0, -0.3, 0], 0.1, true);
    if (u > 20 && u < 26) hands.set(-1, [0.3, 0.05 + Math.sin(u * 8) * 0.06, -0.55], [-0.3, 0, Math.sin(u * 8) * 0.3], 0.0, true);
    if (u > 32 && u < 38) { hands.set(-1, [0.22, -0.1, -0.5], [0, 0, 0.3], 0.3, true); hands.set(1, [-0.22, -0.1, -0.5], [0, 0, -0.3], 0.3, true); }
    if (u > 42 && u < 47) { const f = Math.sin(u * 14) * 0.08; hands.set(-1, [0.3, 0.1 + f, -0.5], [-0.4, 0, 0.5], 0, true); hands.set(1, [-0.3, 0.1 - f, -0.5], [-0.4, 0, -0.5], 0, true); }
    if (u >= 47) { hands.set(-1, [0.07, -0.05, -0.28], [0.3, 0.4, 0.9], 0.2, true); hands.set(1, [-0.07, -0.05, -0.28], [0.3, -0.4, -0.9], 0.2, true); }
    const sh = u > 42 && u < 47 ? shake(u, 0.012) : [0, 0, 0];
    return { cam: { pos: [pos[0] + sh[0], pos[1] + sh[1], pos[2]], look: [-1.4, 1.0, -23], fov }, st, pov: true, woman, zombie };
  }
  // reverse shot from across the street: him alone on the balcony
  const hero = { x: 2.0, z: -5.2, yaw: Math.PI, armL: [0.2, 0.15, -0.3], armR: [0.2, 0.15, -0.3], headX: 0.25, spine: 0.15 };
  const pos = kv(u, [[50, [-1.5, 1.8, -21]], [65, [-3, 3.5, -26]]]);
  return { cam: { pos, look: [2.0, 1.2, -5], fov: lerp(22, 30, sramp(u, 50, 65)) }, st, hero };
};
S.day27 = (u) => {
  const st = { sky: 'night', cityLights: 0, power: 0, traffic: 'park', smoke: 0.4, fires: true, walkers: 1 };
  world.radio.position.set(-0.6, 0, -3.15); world.radio.rotation.y = 0;
  world.radioLed.material.color.setHex(u > 8 ? 0xff2020 : 0x330000);
  world.dial.rotation.y = u > 8 && u < 14 ? u * 3 : 0;
  if (u < 36) { // POV sitting on the floor in front of the radio
    HANDS_REST();
    holdFlash(1, [-0.25, -0.33, -0.4], [-0.5, 0.25, 0], 0.6);
    if (u > 8 && u < 14) hands.set(-1, [0.09, -0.38, -0.55], [0.6, 0, u * 2], 0.7, true);
    const pos = kv(u, [[0, [-0.6, 0.95, -2.4]], [36, [-0.6, 0.85, -2.6]]]);
    return { cam: { pos, look: kv(u, [[0, [-0.6, 0.15, -3.15]], [30, [-0.6, 0.2, -3.15]], [36, [-0.4, 0.8, -4.5]]]), fov: 55 }, st, pov: true };
  }
  // standing at window, moonlight, hopeful
  world.flashlight.visible = false; setFlash(0);
  const hero = { x: -0.2, z: -3.5, yaw: Math.PI, headX: -0.1, armL: [0.25, 0.1, -0.3], armR: [0.25, 0.1, -0.3] };
  const a = lerp(-0.8, -0.2, sramp(u, 36, 50));
  return { cam: { pos: [-0.2 + Math.sin(a) * 2.2, 1.5, -3.5 + Math.cos(a) * 2.2], look: [-0.2, 1.5, -3.8], fov: 50 }, st, hero };
};
S.day30 = (u) => {
  const st = { sky: 'dawn', cityLights: 0, power: 0, traffic: 'park', smoke: 0.9, walkers: 1 };
  const hk = clamp((u - 13) / 50);
  st.heli = { pos: [lerp(-160, -10, hk), lerp(90, 14, hk * hk), lerp(-380, -60, smooth(hk))], yaw: lerp(1.3, 0.05, sramp(u, 55, 66)), pitch: 0.1, roll: lerp(0.0, -0.25, sramp(u, 55, 60)), beam: u > 30 };
  if (u < 18) { // waking on the mattress
    const sit = sramp(u, 9, 13);
    const pos = [-1.8, lerp(0.35, 1.0, sit), lerp(-1.75, -1.95, sit)];
    const look = kv(u, [[0, [-1.8, 2.8, -1.9]], [9, [-1.6, 2.8, -2.2]], [13, [-1.3, 1.2, -4.5]], [18, [-0.8, 1.5, -5]]]);
    HANDS_REST();
    const lid = u < 4 ? (Math.sin(u * 2) > 0.3 ? 1 : 0.15) : 0;
    return { cam: { pos, look, fov: 62, lid: Math.max(lid, 1 - sramp(u, 0, 2.5)) }, st, pov: true };
  }
  if (u < 22) { // run to the window
    const k = sramp(u, 18, 21.5);
    HANDS_REST();
    return { cam: { pos: [lerp(-1.6, 0.4, k), 1.62 - walkBob(u, 0.05, 13), lerp(-2.0, -3.55, k)], look: [-20, 15, -200], fov: 62 }, st, pov: true };
  }
  if (u < 52) { // signalling with the flashlight
    const on = ((u > 26 && u < 27) || (u > 28 && u < 41) || (u > 42 && u < 48.9) || u > 49.8) ? (Math.floor(u * 3) % 2 ? 1 : 0.15) : 0;
    HANDS_REST();
    const wv = Math.sin(u * 5) * 0.1;
    holdFlash(-1, [0.24 + wv, -0.16 + Math.abs(wv), -0.45], [0.35, -0.2, 0], u > 25.5 ? on : 0);
    if (u > 28 && u < 37) hands.set(1, [-0.3, 0.1 + Math.sin(u * 9) * 0.07, -0.55], [-0.3, 0, -0.4], 0, true);
    const look = [st.heli.pos[0] * 0.8, st.heli.pos[1] * 0.6 + 2, st.heli.pos[2]];
    return { cam: { pos: [0.4, 1.62, -3.6], look, fov: lerp(55, 40, sramp(u, 22, 50)) }, st, pov: true };
  }
  // final pull-out through the window revealing the city
  world.flashlight.visible = false; setFlash(0);
  const on = Math.floor(u * 3) % 2 ? 1 : 0.1;
  const hero = { x: 0.4, z: -3.6, yaw: Math.PI, armR: [2.6, 0.3, -0.2], armL: [2.0, 0.6, -0.8], headX: -0.3 };
  const k = sramp(u, 52, 75);
  const pos = kv(u, [[52, [0.6, 1.7, -2.0]], [56, [0.6, 1.9, -7.0]], [64, [8, 10, -40]], [75, [30, 45, -150]]]);
  const look = kv(u, [[52, [0.4, 1.5, -3.6]], [60, [0.4, 1.0, -3.6]], [75, [-5, -5, -60]]]);
  return { cam: { pos, look, fov: lerp(50, 60, k) }, st, hero, heroFlash: on };
};
S.end = (u) => ({ cam: { pos: [30, 45, -150], look: [-5, -5, -60], fov: 60 }, st: { sky: 'dawn', smoke: 0.9, power: 0 } });

// ---------------------------------------------------------------- overlay
const elTitle = document.getElementById('title'), elSub = document.getElementById('sub'), elHead = document.getElementById('head');
const elCap = document.getElementById('cap'), elFade = document.getElementById('fade'), elBig = document.getElementById('big'), elLid = document.getElementById('lid');
function deSub(t) {
  if (!lines) return '';
  for (const L of lines) if (t >= L.t && t <= L.t + L.d + 0.25) return DE[L.text] || '';
  return '';
}
function captions(t) {
  if (!lines) return '';
  for (const L of lines) {
    if (t < L.t || t > L.t + L.d + 0.25) continue;
    for (const c of L.chunks) if (t >= c.t && t < c.t + c.d + (c === L.chunks[L.chunks.length - 1] ? 0.25 : 0)) return c.text;
  }
  return '';
}

export function renderAt(t) {
  const sc = script.scenes.find((s) => t >= s.start && t < s.end) || script.scenes[script.scenes.length - 1];
  const u = t - sc.start;
  world.flashlight.visible = false; world.flashlight.removeFromParent(); scene.add(world.flashlight); setFlash(0);
  for (const b of world.bottles) if (b.parent !== world.fridge) { world.fridge.add(b); }
  world.bottles.forEach((b, i) => { b.position.set(0.27, 0.69, -0.28 + i * 0.11); b.rotation.set(0, 0, 0); });
  HANDS_REST();
  const r = S[sc.id](u);
  const st = Object.assign({ day: sc.day }, r.st);
  // camera
  camera.position.set(...r.cam.pos); camera.lookAt(V3(r.cam.look)); camera.fov = r.cam.fov; camera.updateProjectionMatrix();
  st.cam = camera.position;
  camera.updateMatrixWorld(true);
  world.update(t, st);
  world.drawTV(t, st.tvMode || 'off');
  world.tvScreen.visible = (st.power ?? 1) > 0.3 && !!st.tv;
  // hero
  const hero = world.hero;
  hero.setBeard(clamp((sc.day - 4) / 26));
  if (r.hero) { hero.root.visible = true; hero.pose(Object.assign({}, r.hero, { phase: r.hero.phase ?? 0 })); hero.root.updateMatrixWorld(true); }
  else hero.root.visible = false;
  if (r.heroFlash !== undefined) heroFlash(r.heroFlash);
  hero.hairMesh.scale.set(1.02 + sc.day * 0.003, 1.05 + sc.day * 0.004, 1.06 + sc.day * 0.003);
  for (const [k, p] of [['woman', world.woman], ['zombie', world.zombie]]) {
    if (r[k]) { p.root.visible = true; p.pose(r[k]); } else p.root.visible = false;
  }
  hands.group.visible = !!r.pov;
  scene.updateMatrixWorld(true); if (world.flashlight.visible) setFlash(flashOn);
  // overlay text
  const showHead = !!sc.title;
  elHead.style.opacity = showHead ? clamp(u / 0.4) : 0;
  elHead.style.transform = `scale(${showHead ? 0.9 + 0.1 * smooth(u / 0.4) : 1})`;
  elTitle.textContent = sc.title || ''; elSub.textContent = sc.sub || '';
  elCap.textContent = captions(t);
  elCap.style.opacity = elCap.textContent ? 1 : 0;
  const elDe = document.getElementById('de'); elDe.textContent = deSub(t); elDe.style.opacity = elDe.textContent ? 1 : 0;
  // big titles
  let big = '';
  if (sc.id === 'intro' && u > 1 && u < 13) big = '<div class="b1">30 DAYS</div><div class="b2">FLOOR 25</div>';
  if (sc.id === 'end' && u > 1.5) big = '<div class="b3">DAY 30 –<br>DID HE SURVIVE?</div>';
  elBig.innerHTML = big;
  elBig.style.opacity = sc.id === 'intro' ? Math.min(sramp(u, 1, 2.5), 1 - sramp(u, 11.5, 13)) : sramp(u, 1.5, 3);
  // fades between scenes
  const fin = 1 - sramp(u, 0, 0.6), fout = sramp(u, sc.end - sc.start - 0.6, sc.end - sc.start);
  elFade.style.opacity = sc.id === 'end' ? 1 : Math.max(sc.id === 'intro' ? 1 - sramp(u, 0, 1.5) : fin, fout);
  elLid.style.opacity = r.cam.lid || 0;
  renderer.render(scene, camera);
}

window.renderAt = renderAt;
window.filmDuration = script.scenes[script.scenes.length - 1].end;
await document.fonts.ready;
renderAt(0);
window.ready = true;

// realtime playback (browser): click to start, synced to the soundtrack
if (!params.has('render')) {
  const audio = new Audio('./audio/soundtrack.mp3');
  const start = document.getElementById('play');
  start.style.display = 'flex';
  start.onclick = () => {
    start.style.display = 'none'; audio.play().catch(() => {});
    const t0 = performance.now();
    const loop = () => { const t = audio.currentTime > 0 ? audio.currentTime : (performance.now() - t0) / 1000; renderAt(t); if (t < window.filmDuration) requestAnimationFrame(loop); };
    loop();
  };
  const fit = () => { const s = Math.min(innerWidth / W, innerHeight / H); document.getElementById('frame').style.transform = `scale(${s})`; };
  addEventListener('resize', fit); fit();
}
