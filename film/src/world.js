// Apartment (floor 25, y=0), our tower, the street, the opposite tower, the city, sky, weather, vehicles.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M, toon } from './toon.js';
import { Puppet } from './people.js';
import { rng, clamp, lerp, hash } from './util.js';

const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const RB = (w, h, d, r = 0.03) => new RoundedBoxGeometry(w, h, d, 3, r);
const GY = -80; // street level

function windowsTex(cols, rows, lit) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = lit ? '#000' : '#fff'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const on = lit ? (hash(i * 7 + j * 13) > 0.45) : true;
    x.fillStyle = lit ? (on ? '#ffd27a' : '#000') : '#2c3440';
    x.fillRect(i * 128 / cols + 3, j * 256 / rows + 4, 128 / cols - 6, 256 / rows - 9);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class World {
  constructor(scene) {
    this.scene = scene; const S = scene;
    this.R = rng(5);
    // ---------- lights
    this.hemi = new THREE.HemisphereLight(0xdfe8ff, 0x8a7a66, 1.2); S.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.2); this.sun.position.set(-30, 40, -60); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024); const sc = this.sun.shadow.camera; sc.left = -12; sc.right = 12; sc.top = 12; sc.bottom = -12; sc.near = 1; sc.far = 200; this.sun.shadow.bias = -0.0008;
    S.add(this.sun); S.add(this.sun.target); this.sun.target.position.set(0, 0, 2);
    this.lamp = new THREE.PointLight(0xffc98a, 0, 14, 1.5); this.lamp.position.set(0.5, 2.3, 1); S.add(this.lamp);
    this.lamp2 = new THREE.PointLight(0xffc98a, 0, 10, 1.5); this.lamp2.position.set(-3, 2.3, 1.5); S.add(this.lamp2);
    this.tvLight = new THREE.PointLight(0x88aaff, 0, 6, 1.5); this.tvLight.position.set(4.6, 1.3, 0.6); S.add(this.tvLight);
    this.flash = new THREE.SpotLight(0xfff4dd, 0, 18, 0.42, 0.5, 1.2); this.flash.castShadow = true; this.flash.shadow.mapSize.set(512, 512); S.add(this.flash); S.add(this.flash.target);
    this.fridgeLight = new THREE.PointLight(0xdfefff, 0, 3, 2); this.fridgeLight.position.set(-4.3, 1.2, 1.8); S.add(this.fridgeLight);
    // ---------- sky dome
    this.skyU = { top: { value: new THREE.Color() }, bot: { value: new THREE.Color() } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 p; void main(){ p=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, bot; varying vec3 p; void main(){ float h=clamp(normalize(p).y*2.2+0.15,0.0,1.0); gl_FragColor=vec4(mix(bot,top,h),1.0); }',
    }));
    sky.frustumCulled = false; S.add(sky); this.sky = sky;
    const sp = []; for (let i = 0; i < 500; i++) { const a = this.R() * 6.28, e = 0.15 + this.R() * 1.3; sp.push(Math.cos(a) * Math.cos(e) * 800, Math.sin(e) * 800, Math.sin(a) * Math.cos(e) * 800); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, opacity: 0 })); S.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(22, 32), new THREE.MeshBasicMaterial({ color: 0xf4f1dc, transparent: true, fog: false })); this.moon.position.set(-250, 260, -700); this.moon.lookAt(0, 0, 0); S.add(this.moon);
    S.fog = new THREE.Fog(0xaabbcc, 150, 850);
    this.buildApartment();
    this.buildCity();
    this.buildActors();
    this.buildFx();
  }

  // =========================== APARTMENT ===========================
  buildApartment() {
    const S = this.scene, A = this.apt = new THREE.Group(); S.add(A);
    const wall = 0xe9e0cc, H = 2.8;
    const W = (x, y, z, w, h, d, c = wall) => M(B(w, h, d), c, { parent: A, pos: [x, y, z] });
    M(B(11, 0.1, 12.6), 0xc29467, { parent: A, pos: [0.25, -0.05, 2.1] }); // floor
    for (let i = -5; i <= 5.4; i += 0.6) M(B(0.012, 0.002, 12.6), 0x9d7550, { parent: A, pos: [i, 0.001, 2.1], outline: false });
    M(B(11, 0.1, 12.6), 0xf3efe6, { parent: A, pos: [0.25, H + 0.05, 2.1], outline: false }); // ceiling
    for (const [x, z] of [[-2.5, -1.5], [2.5, -1.5], [-2.5, 1.8], [2.5, 1.8], [2.8, 5.8]]) M(B(1.3, 0.04, 0.3), 0xffffff, { parent: A, pos: [x, H - 0.03, z], mat: { emissive: 0xffffff, emissiveIntensity: 0.4 } });
    W(-5.25, H / 2, 0, 0.2, H, 8); W(5.75, H / 2, 0, 0.2, H, 8); // side walls
    W(-1.6, H / 2, 4.1, 7.4, H, 0.2); W(4.7, H / 2, 4.1, 2.1, H, 0.2); W(2.8, 2.5, 4.1, 1.6, 0.6, 0.2); // back wall with hall opening x 2..3.6
    W(1.9, H / 2, 6.1, 0.2, H, 4); W(3.7, H / 2, 6.1, 0.2, H, 4); W(2.8, H / 2, 8.15, 2, H, 0.2); // hallway
    // window wall z=-4: frame + glass
    for (let x = -5.15; x <= 5.7; x += 1.55) M(B(0.09, H, 0.12), 0x3a3f47, { parent: A, pos: [x, H / 2, -4] });
    M(B(11, 0.1, 0.14), 0x3a3f47, { parent: A, pos: [0.25, 0.05, -4] }); M(B(11, 0.12, 0.14), 0x3a3f47, { parent: A, pos: [0.25, H - 0.06, -4] });
    this.glassMat = new THREE.MeshBasicMaterial({ color: 0xbfd8ea, transparent: true, opacity: 0.12, depthWrite: false });
    this.glass = [];
    for (let x = -5.15; x < 5.6; x += 1.55) { const g = new THREE.Mesh(new THREE.PlaneGeometry(1.5, H), this.glassMat); g.position.set(x + 0.775, H / 2, -4); A.add(g); this.glass.push(g); }
    this.slideDoor = this.glass[4]; this.slideX = this.slideDoor.position.x;
    this.tape = new THREE.Group(); A.add(this.tape);
    for (const i of [0, 1, 6]) for (const s of [1, -1]) M(B(0.07, 3.1, 0.01), 0xd6c48e, { parent: this.tape, pos: [this.glass[i].position.x, H / 2, -3.95], rot: [0, 0, s * 0.5], outline: false });
    // balcony
    M(B(11, 0.25, 1.9), 0x9a9a98, { parent: A, pos: [0.25, -0.12, -4.95] });
    for (let x = -5.2; x <= 5.7; x += 0.25) M(B(0.03, 1.0, 0.03), 0x2e3238, { parent: A, pos: [x, 0.5, -5.85], outline: false });
    M(B(11, 0.06, 0.08), 0x2e3238, { parent: A, pos: [0.25, 1.02, -5.85] });
    // ---- living room furniture
    const sofa = this.sofa = new THREE.Group(); sofa.position.set(0.6, 0, 0.6); A.add(sofa);
    M(RB(0.95, 0.42, 2.3, 0.08), 0x5b6f86, { parent: sofa, pos: [0, 0.21, 0] });
    M(RB(0.28, 0.55, 2.3, 0.1), 0x5b6f86, { parent: sofa, pos: [-0.36, 0.65, 0] });
    for (const z of [-1.1, 1.1]) M(RB(0.95, 0.6, 0.22, 0.08), 0x51647a, { parent: sofa, pos: [0, 0.3, z] });
    for (const z of [-0.5, 0.5]) M(RB(0.6, 0.14, 0.98, 0.06), 0x6b8098, { parent: sofa, pos: [0.12, 0.46, z] });
    M(RB(0.6, 0.04, 1.1), 0x8d6a48, { parent: A, pos: [2.4, 0.42, 0.6] }); M(B(0.5, 0.4, 0.9), 0x6e5238, { parent: A, pos: [2.4, 0.2, 0.6] });
    M(B(2.8, 0.01, 2.2), 0xb75d4a, { parent: A, pos: [2.2, 0.006, 0.6], outline: false });
    // TV
    M(B(0.4, 0.5, 1.9), 0x5a4330, { parent: A, pos: [5.4, 0.25, 0.6] });
    M(B(0.06, 0.85, 1.5), 0x111111, { parent: A, pos: [5.6, 1.4, 0.6] });
    const tvc = document.createElement('canvas'); tvc.width = 320; tvc.height = 180; this.tvCtx = tvc.getContext('2d');
    this.tvTex = new THREE.CanvasTexture(tvc); this.tvTex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.78), new THREE.MeshBasicMaterial({ map: this.tvTex })); scr.position.set(5.565, 1.4, 0.6); scr.rotation.y = -Math.PI / 2; A.add(scr); this.tvScreen = scr;
    // lamp, shelf, plant
    M(new THREE.CylinderGeometry(0.02, 0.02, 1.5), 0x222222, { parent: A, pos: [0.2, 0.75, -1.2] });
    this.shade = M(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 20), 0xf3e2c0, { parent: A, pos: [0.2, 1.55, -1.2], mat: { emissive: 0xffc070, emissiveIntensity: 0, unique: true } });
    M(B(0.4, 2.0, 1.4), 0x7a5a3c, { parent: A, pos: [-4.95, 1.0, -2.3] });
    for (let i = 0; i < 18; i++) M(B(0.3, 0.25 + this.R() * 0.08, 0.07), new THREE.Color().setHSL(this.R(), 0.45, 0.45).getHex(), { parent: A, pos: [-4.85, 0.2 + Math.floor(i / 6) * 0.6 + 0.13, -2.85 + (i % 6) * 0.2], outline: false });
    M(new THREE.CylinderGeometry(0.2, 0.15, 0.4), 0xc9744a, { parent: A, pos: [5.2, 0.2, -3.3] });
    this.plant = M(new THREE.IcosahedronGeometry(0.42, 1), 0x4f9a4a, { parent: A, pos: [5.2, 0.8, -3.3], scale: [1, 1.3, 1] });
    // tally marks wall x=-5.15
    const tc = document.createElement('canvas'); tc.width = 512; tc.height = 256; this.tallyCtx = tc.getContext('2d'); this.tallyTex = new THREE.CanvasTexture(tc);
    const tm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ map: this.tallyTex, transparent: true })); tm.position.set(-5.14, 1.6, -0.6); tm.rotation.y = Math.PI / 2; A.add(tm); this.tallyDay = -1;
    // ---- kitchen (corner x<-2, z>1)
    M(B(3.2, 0.9, 0.65), 0xf4f1ea, { parent: A, pos: [-3.5, 0.45, 3.65] }); M(B(3.25, 0.05, 0.7), 0x404040, { parent: A, pos: [-3.5, 0.92, 3.63] });
    M(B(3.2, 0.7, 0.4), 0xf4f1ea, { parent: A, pos: [-3.5, 2.0, 3.8] });
    M(B(0.5, 0.02, 0.4), 0xaaaaaa, { parent: A, pos: [-3.2, 0.95, 3.6] });
    // fridge against wall x=-5.15, front faces +X
    const fr = this.fridge = new THREE.Group(); fr.position.set(-4.75, 0, 1.9); A.add(fr);
    M(RB(0.5, 1.9, 0.8), 0xd8dde2, { parent: fr, pos: [-0.1, 0.95, 0] });
    for (const z of [-0.38, 0.38]) M(B(0.22, 1.9, 0.04), 0xd8dde2, { parent: fr, pos: [0.25, 0.95, z] });
    for (const y of [0.03, 1.87]) M(B(0.22, 0.06, 0.8), 0xd8dde2, { parent: fr, pos: [0.25, y, 0] });
    M(B(0.02, 1.8, 0.74), 0xc9d3dc, { parent: fr, pos: [0.16, 0.95, 0], mat: { emissive: 0xdfefff, emissiveIntensity: 0.0, unique: true } }).name = 'inner';
    this.fridgeInner = fr.getObjectByName('inner');
    for (const y of [0.55, 1.0, 1.45]) M(B(0.2, 0.015, 0.72), 0xe8eef2, { parent: fr, pos: [0.26, y, 0], outline: false });
    this.fdoor = new THREE.Group(); this.fdoor.position.set(0.36, 0, -0.4); fr.add(this.fdoor);
    M(RB(0.06, 1.88, 0.8), 0xc9cfd6, { parent: this.fdoor, pos: [0.03, 0.95, 0.4] });
    M(B(0.04, 0.5, 0.04), 0x777777, { parent: this.fdoor, pos: [0.08, 1.15, 0.72] });
    this.bottles = [];
    const bg = new THREE.CylinderGeometry(0.035, 0.035, 0.24, 14);
    for (let i = 0; i < 6; i++) { const b = M(bg, 0x7fc4ec, { parent: fr, pos: [0.27, 0.69, -0.28 + i * 0.11], mat: { transparent: true, opacity: 0.85 } }); M(new THREE.CylinderGeometry(0.016, 0.016, 0.03), 0x1f5fbf, { parent: b, pos: [0, 0.13, 0] }); this.bottles.push(b); }
    this.cans = [];
    const cg = new THREE.CylinderGeometry(0.04, 0.04, 0.11, 14);
    for (let i = 0; i < 4; i++) this.cans.push(M(cg, [0xc0392b, 0xc0392b, 0x2e86c1, 0x27ae60][i], { parent: fr, pos: [0.27, 1.07, -0.2 + i * 0.13] }));
    // kitchen table + chairs + last bottle
    const tb = this.table = new THREE.Group(); tb.position.set(-2.6, 0, 1.2); A.add(tb);
    M(RB(1.3, 0.05, 0.85), 0xa77b52, { parent: tb, pos: [0, 0.76, 0] });
    for (const [x, z] of [[-0.58, -0.35], [0.58, -0.35], [-0.58, 0.35], [0.58, 0.35]]) M(B(0.05, 0.75, 0.05), 0x333333, { parent: tb, pos: [x, 0.37, z], outline: false });
    this.chairs = [];
    for (const z of [-0.75, 0.75]) {
      const c = new THREE.Group(); c.position.set(-2.6, 0, 1.2 + z); c.rotation.y = z < 0 ? 0 : Math.PI; A.add(c); this.chairs.push(c);
      M(RB(0.45, 0.05, 0.45), 0xa77b52, { parent: c, pos: [0, 0.47, 0] }); M(RB(0.45, 0.45, 0.05), 0xa77b52, { parent: c, pos: [0, 0.72, -0.21] });
      for (const [x, zz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) M(B(0.04, 0.47, 0.04), 0x333333, { parent: c, pos: [x, 0.23, zz], outline: false });
    }
    this.lastBottle = M(bg, 0x7fc4ec, { parent: A, pos: [-2.6, 0.9, 1.0], mat: { transparent: true, opacity: 0.8 } });
    // hallway: front door at z=8.05 (faces -z), dresser
    this.door = new THREE.Group(); this.door.position.set(2.35, 0, 8.03); A.add(this.door);
    M(RB(0.92, 2.08, 0.07, 0.01), 0x6b4a32, { parent: this.door, pos: [0.46, 1.04, 0] });
    M(B(0.12, 0.04, 0.05), 0xc9c9c9, { parent: this.door, pos: [0.8, 1.02, -0.06] });
    this.bolt = M(B(0.03, 0.08, 0.03), 0xc9c9c9, { parent: this.door, pos: [0.8, 1.3, -0.06] });
    M(B(1.1, 0.06, 0.12), 0xffffff, { parent: A, pos: [2.81, 2.12, 8.03] });
    this.underDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.02), new THREE.MeshBasicMaterial({ color: 0xe8f0d0 })); this.underDoor.position.set(2.8, 0.01, 7.98); this.underDoor.rotation.y = Math.PI; A.add(this.underDoor);
    this.feetShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.025), new THREE.MeshBasicMaterial({ color: 0x000000 })); this.feetShadow.position.set(2.8, 0.011, 7.975); this.feetShadow.rotation.y = Math.PI; A.add(this.feetShadow);
    const dr = this.dresser = new THREE.Group(); A.add(dr);
    M(RB(1.1, 1.25, 0.5, 0.02), 0x6a4a30, { parent: dr, pos: [0, 0.625, 0] });
    for (let i = 0; i < 3; i++) { M(B(1.0, 0.33, 0.02), 0x7f5a3a, { parent: dr, pos: [0, 0.25 + i * 0.38, 0.26] }); M(B(0.16, 0.03, 0.03), 0xd0d0d0, { parent: dr, pos: [0, 0.27 + i * 0.38, 0.28], outline: false }); }
    M(B(0.3, 0.3, 0.25), 0xc49a6c, { parent: dr, pos: [-0.3, 1.4, 0] });
    // bedroom & bathroom glimpses through doors
    M(B(1.7, 0.45, 2.1), 0xf0ece4, { parent: A, pos: [5.0, 0.22, 6.0] }); M(B(1.72, 0.12, 1.4), 0x4a6fa5, { parent: A, pos: [5.0, 0.5, 5.7] });
    // mess (later days)
    this.mess = new THREE.Group(); A.add(this.mess);
    for (let i = 0; i < 22; i++) M(B(0.21, 0.004, 0.29), 0xf2efe6, { parent: this.mess, pos: [-3.5 + this.R() * 8, 0.004, -3 + this.R() * 6.5], rot: [0, this.R() * 6, 0], outline: false });
    for (let i = 0; i < 12; i++) M(cg, 0x9aa1a8, { parent: this.mess, pos: [-3.5 + this.R() * 7, 0.04, -2.5 + this.R() * 5], rot: [Math.PI / 2, 0, this.R() * 6] });
    for (let i = 0; i < 7; i++) M(bg, 0xbfe2f5, { parent: this.mess, pos: [-2 + this.R() * 4, 0.035, -2.4 + this.R() * 3], rot: [Math.PI / 2, 0, this.R() * 6], mat: { transparent: true, opacity: 0.5 } });
    this.mattress = M(RB(0.95, 0.18, 1.95, 0.06), 0xdcd5c8, { parent: this.mess, pos: [-1.8, 0.09, -2.4], rot: [0, 0.15, 0] });
    M(RB(0.9, 0.06, 1.2, 0.03), 0x4a6fa5, { parent: this.mess, pos: [-1.75, 0.2, -2.1], rot: [0.05, 0.3, 0.04] });
    // props: flashlight, radio
    this.flashlight = new THREE.Group();
    M(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 12), 0x222222, { parent: this.flashlight, rot: [Math.PI / 2, 0, 0] });
    M(new THREE.CylinderGeometry(0.035, 0.024, 0.06, 14), 0x333333, { parent: this.flashlight, pos: [0, 0, -0.11], rot: [Math.PI / 2, 0, 0] });
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d0 })); this.lens.position.z = -0.142; this.lens.rotation.y = Math.PI; this.flashlight.add(this.lens);
    const cone = new THREE.ConeGeometry(0.9, 5, 24, 1, true); cone.translate(0, -2.5, 0); cone.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.beam.position.z = -0.14; this.beam.rotation.y = Math.PI; this.flashlight.add(this.beam);
    S.add(this.flashlight);
    this.radio = new THREE.Group(); A.add(this.radio);
    M(RB(0.36, 0.2, 0.12, 0.03), 0x8a2c2c, { parent: this.radio, pos: [0, 0.1, 0] });
    M(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 18), 0x222222, { parent: this.radio, pos: [-0.09, 0.1, 0.06], rot: [Math.PI / 2, 0, 0] });
    this.dial = M(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), 0xdddddd, { parent: this.radio, pos: [0.1, 0.12, 0.065], rot: [Math.PI / 2, 0, 0] });
    M(new THREE.CylinderGeometry(0.005, 0.005, 0.45), 0xcccccc, { parent: this.radio, pos: [0.15, 0.4, 0], rot: [0, 0, -0.3] });
    this.radioLed = new THREE.Mesh(new THREE.CircleGeometry(0.01, 10), new THREE.MeshBasicMaterial({ color: 0x330000 })); this.radioLed.position.set(0.05, 0.16, 0.061); this.radio.add(this.radioLed);
  }

  // =========================== CITY ===========================
  buildCity() {
    const S = this.scene, C = this.city = new THREE.Group(); S.add(C);
    const R = rng(11);
    this.winDay = windowsTex(4, 8, false); this.winLit = windowsTex(4, 8, true);
    M(B(3000, 1, 3000), 0x6f7378, { parent: C, pos: [0, GY - 0.5, 0], outline: false });
    M(B(400, 0.05, 10), 0x3c3f44, { parent: C, pos: [0, GY + 0.03, -14], outline: false }); // street
    for (let x = -200; x < 200; x += 6) M(B(3, 0.02, 0.25), 0xf2f2f2, { parent: C, pos: [x, GY + 0.07, -14], outline: false });
    M(B(400, 0.3, 4), 0xa9a9a6, { parent: C, pos: [0, GY + 0.15, -7] }); M(B(400, 0.3, 4), 0xa9a9a6, { parent: C, pos: [0, GY + 0.15, -21] });
    // street lamps
    this.lampPosts = [];
    for (let x = -60; x <= 60; x += 15) { const g = new THREE.Group(); g.position.set(x, GY, -9.3); C.add(g); M(new THREE.CylinderGeometry(0.1, 0.12, 6), 0x2d3035, { parent: g, pos: [0, 3, 0] }); M(B(1.2, 0.15, 0.3), 0x2d3035, { parent: g, pos: [-0.5, 6, 0] }); this.lampPosts.push(g); }
    this.crashPost = this.lampPosts.find((g) => g.position.x === 0);
    // buildings
    this.blds = [];
    const bld = (x, z, w, d, h, col, front) => {
      const mat = toon(col, { unique: true, map: this.winDay, emissiveMap: this.winLit, emissive: 0xffffff, emissiveIntensity: 0 });
      mat.map = this.winDay.clone(); mat.map.repeat.set(Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(h / 12))); mat.map.needsUpdate = true;
      mat.emissiveMap = this.winLit.clone(); mat.emissiveMap.repeat.copy(mat.map.repeat); mat.emissiveMap.offset.set(R(), R()); mat.emissiveMap.needsUpdate = true;
      const m = M(B(w, h, d), mat, { parent: C, pos: [x, GY + h / 2, z] });
      m.userData.rank = R(); this.blds.push(m); return m;
    };
    // our tower: front facade with a hole for the apartment (x -5.3..5.85, y -0.2..2.95)
    const tcol = 0xb8b2a6;
    const fx0 = -14, fx1 = 16;
    const facade = (x0, x1, y0, y1) => bld((x0 + x1) / 2, 7, x1 - x0, 22, 0, tcol);
    const T = (x0, x1, y0, y1) => { const m = bld((x0 + x1) / 2, 8, x1 - x0, 24, y1 - y0, tcol); m.position.y = (y0 + y1) / 2; return m; };
    T(fx0, -5.3, GY, 32); T(5.85, fx1, GY, 32); T(-5.3, 5.85, GY, -0.25); T(-5.3, 5.85, 2.95, 32);
    for (let y = -77; y < 30; y += 3.2) if (false) M(B(10.8, 0.22, 1.8), 0x9a9a98, { parent: C, pos: [0.25, y - 0.12 + 3.2 * 0 + (0), -4.95] });
    // opposite tower (front at z=-24) with a balcony on our level
    const ocol = 0xc7a98a;
    const O = (x0, x1, y0, y1) => { const m = bld((x0 + x1) / 2, -36, x1 - x0, 24, y1 - y0, ocol); m.position.y = (y0 + y1) / 2; return m; };
    O(-22, -3.5, GY, 30); O(0.5, 14, GY, 30); O(-3.5, 0.5, GY, -0.1); O(-3.5, 0.5, 2.6, 30);
    M(B(4, 2.7, 0.1), 0x15171c, { parent: C, pos: [-1.5, 1.25, -25.5], outline: false });
    this.oppDoor = M(B(1.0, 2.2, 0.06), 0x5a4030, { parent: C, pos: [-2.4, 1.1, -24.6] });
    M(B(5, 0.22, 1.7), 0x9a9a98, { parent: C, pos: [-1.5, -0.11, -23.0] });
    for (let x = -4; x <= 1; x += 0.25) M(B(0.03, 1.0, 0.03), 0x2e3238, { parent: C, pos: [x, 0.5, -22.2], outline: false });
    M(B(5, 0.06, 0.08), 0x2e3238, { parent: C, pos: [-1.5, 1.02, -22.2] });
    // the wider city
    const cols = [0x9fa8b3, 0xb7aa98, 0x8e98a6, 0xc9bfae, 0x7f8a99, 0xa69a8c, 0xbac3c9];
    for (let i = 0; i < 170; i++) {
      const a = R() * Math.PI * 2, r = 55 + Math.pow(R(), 0.7) * 520;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 40;
      if (z > -30 && Math.abs(x) < 40) continue;
      if (z > 30) continue;
      const w = 14 + R() * 22, d = 14 + R() * 22, h = 30 + Math.pow(R(), 1.6) * 190;
      bld(Math.round(x / 8) * 8, Math.round(z / 8) * 8, w, d, h, cols[i % cols.length]);
    }
    // cars on the street
    this.cars = [];
    const ccol = [0xd64545, 0x3b7dd8, 0xf2c14e, 0xeeeeee, 0x2f2f2f, 0x4caf50, 0x9b59b6];
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group(); C.add(g);
      M(RB(4.2, 0.8, 1.8, 0.2), ccol[i % ccol.length], { parent: g, pos: [0, 0.65, 0] });
      M(RB(2.3, 0.7, 1.6, 0.2), 0x9cc3d8, { parent: g, pos: [-0.2, 1.3, 0] });
      for (const [x, z] of [[1.3, 0.85], [-1.3, 0.85], [1.3, -0.85], [-1.3, -0.85]]) M(new THREE.CylinderGeometry(0.36, 0.36, 0.25, 14), 0x111111, { parent: g, pos: [x, 0.36, z], rot: [Math.PI / 2, 0, 0] });
      g.userData = { lane: i % 2 ? -12 : -16, speed: (i % 2 ? 1 : -1) * (12 + R() * 6), off: R() * 300, parkX: -70 + R() * 140, parkRot: R() * 0.8 - 0.4 };
      g.position.y = GY; this.cars.push(g);
    }
    this.crashCar = this.cars[0];
  }

  // =========================== ACTORS ===========================
  buildActors() {
    const S = this.scene;
    this.hero = new Puppet({ skin: 0xf1c27d, shirt: 0x4a5a6a, pants: 0x2d3a4a, hair: 0x3b2716 }); S.add(this.hero.root);
    this.woman = new Puppet({ skin: 0x8d5524, shirt: 0xe7a33e, pants: 0x34495e, hair: 0x1b1210, hairStyle: 'bun' }); S.add(this.woman.root);
    this.zombie = new Puppet({ skin: 0x8fa37a, shirt: 0x5b4f45, pants: 0x3a3a3a, hair: 0x2a2a20, hairStyle: 'none' }); S.add(this.zombie.root);
    // street crowd / walkers
    this.crowd = [];
    const R = rng(23), shirts = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0x1abc9c, 0xecf0f1, 0xe67e22, 0x34495e];
    for (let i = 0; i < 16; i++) {
      const z = i >= 11;
      const p = new Puppet(z ? { skin: 0x8fa37a, shirt: 0x555048, pants: 0x333333, hairStyle: 'none', scale: 1.4 } : { skin: [0xf1c27d, 0x8d5524, 0xe0ac69, 0xc68642][i % 4], shirt: shirts[i % 8], pants: 0x2c3e50, scale: 1.4 });
      p.data = { zombie: z, x0: -40 + R() * 80, z: -6 - R() * 17, dir: R() > 0.5 ? 1 : -1, speed: 4 + R() * 3, ph: R() * 6 };
      S.add(p.root); this.crowd.push(p);
    }
    // helicopter
    const h = this.heli = new THREE.Group(); S.add(h);
    M(new THREE.SphereGeometry(1.4, 20, 14), 0xe8e8e8, { parent: h, scale: [1, 0.8, 1.6] });
    M(new THREE.SphereGeometry(0.9, 16, 12), 0x223344, { parent: h, pos: [0, 0.15, 1.3], scale: [1, 0.75, 0.8] });
    M(new THREE.CylinderGeometry(0.18, 0.35, 4.5, 10), 0xe8e8e8, { parent: h, pos: [0, 0.3, -3.2], rot: [Math.PI / 2, 0, 0] });
    M(B(0.1, 1.0, 0.6), 0xd03030, { parent: h, pos: [0, 0.8, -5.2] });
    M(B(1.0, 0.25, 4.6), 0xd03030, { parent: h, pos: [0, -0.2, 0], scale: [1.42, 1, 0.75] });
    for (const s of [1, -1]) M(B(0.1, 0.1, 3.2), 0x333333, { parent: h, pos: [0.9 * s, -1.25, 0.2] });
    this.rotor = new THREE.Group(); this.rotor.position.y = 1.25; h.add(this.rotor);
    for (let i = 0; i < 4; i++) M(B(0.3, 0.05, 6.5), 0x222222, { parent: this.rotor, rot: [0, i * Math.PI / 2, 0], pos: [0, 0, 0] }).position.set(Math.sin(i * Math.PI / 2) * 3.2, 0, Math.cos(i * Math.PI / 2) * 3.2);
    this.heliLight = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 })); this.heliLight.position.set(0, -0.9, 0.6); h.add(this.heliLight);
    const sc = new THREE.ConeGeometry(6, 40, 24, 1, true); sc.translate(0, -20, 0);
    this.searchBeam = new THREE.Mesh(sc, new THREE.MeshBasicMaterial({ color: 0xfff6d0, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.searchBeam.position.set(0, -1, 1.2); this.searchBeam.rotation.x = 0.5; h.add(this.searchBeam);
  }

  // =========================== FX ===========================
  buildFx() {
    const S = this.scene, R = rng(31);
    this.smokes = [];
    const spots = [[-80, -160], [60, -220], [-180, -320], [120, -110], [-30, -420], [220, -300], [-260, -150]];
    for (const [x, z] of spots) {
      const g = new THREE.Group(); g.position.set(x, GY, z); S.add(g);
      const puffs = [];
      for (let i = 0; i < 14; i++) { const p = M(new THREE.IcosahedronGeometry(1, 1), 0x3d3d42, { parent: g, outline: false }); p.userData.k = i / 14; puffs.push(p); }
      const fire = M(new THREE.ConeGeometry(5, 10, 8), 0xff7a1a, { parent: g, pos: [0, 5, 0], mat: { emissive: 0xff5a00, emissiveIntensity: 1.5 }, outline: false });
      g.userData = { puffs, fire, start: R() };
      this.smokes.push(g);
    }
    // rain streaks around camera
    const rp = []; for (let i = 0; i < 1500; i++) { const x = (R() - 0.5) * 40, y = R() * 30, z = (R() - 0.5) * 40; rp.push(x, y, z, x - 0.05, y - 0.7, z); }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.45 })); this.rain.frustumCulled = false; S.add(this.rain);
    // lightning bolt
    const bp = []; let x = 0, y = 260; while (y > 0) { const nx = x + (R() - 0.5) * 40, ny = y - 20 - R() * 15; bp.push(x, y, 0, nx, ny, 0); x = nx; y = ny; }
    const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    this.bolt = new THREE.LineSegments(bgeo, new THREE.LineBasicMaterial({ color: 0xffffff, fog: false })); this.bolt.position.set(-120, GY, -450); S.add(this.bolt);
  }

  setTally(day) {
    if (day === this.tallyDay) return; this.tallyDay = day;
    const x = this.tallyCtx; x.clearRect(0, 0, 512, 256); x.strokeStyle = '#2a2420'; x.lineWidth = 6; x.lineCap = 'round';
    for (let i = 0; i < day; i++) { const g = Math.floor(i / 5), k = i % 5, x0 = 20 + (g % 6) * 82, y0 = 20 + Math.floor(g / 6) * 115; x.beginPath(); if (k < 4) { x.moveTo(x0 + k * 14, y0); x.lineTo(x0 + k * 14 + 2, y0 + 85); } else { x.moveTo(x0 - 8, y0 + 75); x.lineTo(x0 + 52, y0 + 10); } x.stroke(); }
    this.tallyTex.needsUpdate = true;
  }

  // st: world state for this frame
  update(t, st) {
    const day = st.day || 1;
    // sky presets
    const P = {
      sunset: [0x3a5f9a, 0xf3a76a, 0xffc59a, 1.6, 0.9],
      morning: [0x7fb2e5, 0xe8eef2, 0xfff4e0, 2.2, 1.2],
      day: [0x86aedb, 0xdfe6ea, 0xffffff, 2.0, 1.2],
      overcast: [0x8a949e, 0xb9bfc4, 0xe0e4e8, 0.9, 1.1],
      storm: [0x2c3138, 0x4e555c, 0x8b95a0, 0.3, 0.55],
      night: [0x05070f, 0x1a2238, 0x8a9ce0, 0.6, 0.62],
      dawn: [0x31406a, 0xe0906a, 0xffd0a0, 1.0, 0.7],
    }[st.sky || 'day'];
    this.skyU.top.value.setHex(P[0]); this.skyU.bot.value.setHex(P[1]);
    this.scene.fog.color.setHex(P[1]);
    this.sun.color.setHex(P[2]); this.sun.intensity = P[3]; this.hemi.intensity = P[4];
    this.hemi.color.setHex(P[2]);
    const fl = st.flash || 0;
    if (fl > 0) { this.sun.intensity += fl * 6; this.hemi.intensity += fl * 2.5; this.skyU.top.value.lerp(new THREE.Color(0xd8e0ff), fl * 0.8); this.skyU.bot.value.lerp(new THREE.Color(0xd8e0ff), fl * 0.8); }
    this.bolt.visible = fl > 0.5;
    const night = st.sky === 'night';
    this.stars.material.opacity = night ? 0.9 : 0; this.moon.visible = night || st.sky === 'dawn';
    this.sun.position.set(night ? -60 : -30, 45, -60);
    // interior lights
    const pw = st.power ?? 1;
    this.lamp.intensity = pw * 9; this.lamp2.intensity = pw * 6; this.shade.material.emissiveIntensity = pw * 1.2;
    this.tvLight.intensity = (st.tv ? 4 : 0) * pw;
    // city windows at night
    for (const b of this.blds) b.material.emissiveIntensity = (st.cityLights ?? 0) > b.userData.rank ? 1.0 : 0;
    // apartment state
    this.setTally(day);
    this.mess.visible = day >= 17; this.tape.visible = day >= 12;
    this.lastBottle.visible = day >= 17 && day < 23;
    this.chairs[1].rotation.z = day >= 30 ? Math.PI / 2 : 0; this.chairs[1].position.y = day >= 30 ? 0.24 : 0;
    this.plant.material.color.setHex(day >= 17 ? 0x8a8a4a : 0x4f9a4a);
    this.radio.visible = day >= 27;
    // dresser position
    const dk = st.dresser ?? (day >= 3 ? 1 : 0);
    this.dresser.position.set(lerp(3.4, 2.82, dk), 0, lerp(6.0, 7.65, dk));
    this.dresser.rotation.y = lerp(-Math.PI / 2, Math.PI, dk) + (st.dresserShake || 0) * 0.04;
    this.door.rotation.y = (st.doorShake || 0) * 0.05;
    this.bolt.rotation.z = (st.bolt ?? (day >= 3 ? 1 : 0)) * Math.PI / 2;
    this.fdoor.rotation.y = st.fridgeOpen || 0;
    this.fridgeLight.intensity = (st.fridgeOpen || 0) * 1.2 * (pw > 0.5 ? 1 : 0);
    this.fridgeInner.material.emissiveIntensity = (st.fridgeOpen || 0) * 0.15 * (pw > 0.5 ? 1 : 0);
    this.slideDoor.position.x = this.slideX - (st.slide || 0) * 1.45;
    this.underDoor.visible = day < 7 || !!st.stairLight;
    this.feetShadow.visible = !!st.feet; this.feetShadow.position.x = 2.8 + Math.sin(t * 3) * 0.25;
    // smoke & fires
    const sm = st.smoke ?? 0;
    for (const g of this.smokes) {
      g.visible = sm > 0;
      if (!sm) continue;
      for (const p of g.userData.puffs) {
        const k = (p.userData.k + t * 0.03 + g.userData.start) % 1;
        p.position.set(Math.sin(k * 7 + g.userData.start * 9) * 6 + k * 40 * (st.wind ?? 0.5), 8 + k * 150 * sm, Math.cos(k * 5) * 6);
        p.scale.setScalar((6 + k * 28) * (0.6 + sm * 0.4));
      }
      g.userData.fire.visible = st.fires !== false;
      g.userData.fire.scale.setScalar(0.8 + Math.sin(t * 8 + g.userData.start * 20) * 0.15);
    }
    // cars
    for (const [i, c] of this.cars.entries()) {
      const d = c.userData;
      if (st.traffic === 'flow') { const x = ((d.off + t * d.speed) % 300 + 300) % 300 - 150; c.position.set(x, GY, d.lane); c.rotation.set(0, d.speed > 0 ? 0 : Math.PI, 0); }
      else { c.position.set(d.parkX, GY, d.lane + (i % 3 - 1) * 1.5); c.rotation.set(0, d.parkRot + (i % 2) * Math.PI, 0); }
    }
    if (st.crash !== undefined) { // crash car into post at x=0
      const k = st.crash, c = this.crashCar;
      const x = k < 0 ? -40 + (k + 1) * 38 : -2.2 + Math.min(k, 0.2) * 2;
      c.position.set(x, GY, k < 0 ? -12 : -12 + Math.min(k, 0.3) * 8); c.rotation.set(0, k > 0 ? 0.6 * Math.min(1, k * 5) : 0, k > 0 ? -0.05 : 0);
      this.crashPost.rotation.x = k > 0 ? -0.5 * Math.min(1, k * 4) : 0;
    } else this.crashPost.rotation.x = day > 1 ? -0.5 : 0;
    // rain
    this.rain.visible = !!st.rain;
    if (st.rain && st.cam) { this.rain.position.set(st.cam.x, st.cam.y - ((t * 22) % 30) + 5, st.cam.z); }
    // crowd
    for (const p of this.crowd) {
      const d = p.data;
      const show = d.zombie ? (st.walkers || 0) : (st.panic || 0);
      p.root.visible = show > 0;
      if (!show) continue;
      const sp = d.zombie ? 0.6 : d.speed;
      const x = ((d.x0 + d.dir * t * sp) % 100 + 150) % 100 - 50;
      p.pose({ x, y: GY + (d.zombie ? 0 : 0.15), z: d.z, yaw: d.dir > 0 ? Math.PI / 2 : -Math.PI / 2, walk: 1, run: d.zombie ? 0 : 1, phase: t * (d.zombie ? 3 : 11) + d.ph, armL: d.zombie ? [1.4, 0.1, -0.1] : undefined, armR: d.zombie ? [1.3, 0.1, -0.2] : undefined, armSwing: d.zombie ? 0.2 : 1, spine: d.zombie ? 0.3 : 0 });
    }
    // helicopter
    this.heli.visible = !!st.heli;
    if (st.heli) { this.heli.position.set(...st.heli.pos); this.heli.rotation.set(st.heli.pitch || 0.12, st.heli.yaw || 0, st.heli.roll || 0); this.rotor.rotation.y = t * 40; this.heliLight.visible = (t * 1.5) % 1 < 0.3; this.searchBeam.visible = !!st.heli.beam; }
  }

  drawTV(t, mode) {
    const x = this.tvCtx;
    if (mode === 'show') {
      const g = x.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, '#5ec2f2'); g.addColorStop(1, '#7ed957'); x.fillStyle = g; x.fillRect(0, 0, 320, 180);
      x.fillStyle = '#ffd23f'; x.beginPath(); x.arc(160 + Math.sin(t * 2) * 80, 100 + Math.cos(t * 3) * 20, 22, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 18px sans-serif'; x.fillText('QUIZ NIGHT', 12, 26);
    } else if (mode === 'news') {
      x.fillStyle = '#132a4a'; x.fillRect(0, 0, 320, 180);
      x.fillStyle = '#1f3d66'; x.fillRect(180, 20, 120, 100);
      x.fillStyle = '#ff6b3d'; for (let i = 0; i < 6; i++) { x.beginPath(); x.arc(200 + i * 17, 70 + Math.sin(i * 3) * 20, 5 + Math.sin(t * 4 + i) * 2, 0, 7); x.fill(); }
      x.fillStyle = '#e8c39e'; x.beginPath(); x.arc(90, 70, 26, 0, 7); x.fill(); x.fillStyle = '#2a2a2a'; x.fillRect(55, 96, 70, 60);
      x.fillStyle = (t * 2) % 1 < 0.5 ? '#d0021b' : '#a00014'; x.fillRect(0, 128, 320, 26);
      x.fillStyle = '#fff'; x.font = 'bold 19px sans-serif'; x.fillText('BREAKING NEWS', 8, 148);
      x.fillStyle = '#111'; x.fillRect(0, 154, 320, 26); x.fillStyle = '#ffd23f'; x.font = 'bold 14px sans-serif';
      x.fillText('STAY INDOORS • LOCK YOUR DOORS • ATTACKS REPORTED CITYWIDE • STAY INDOORS', 320 - ((t * 70) % 700), 172);
    } else { x.fillStyle = '#000'; x.fillRect(0, 0, 320, 180); }
    this.tvTex.needsUpdate = true;
  }
}
