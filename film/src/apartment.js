// The apartment on the 25th floor: living room with panoramic glazing, kitchen,
// bedroom, bathroom, hallway with front door, balcony. Apartment floor = y 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodFloor, plaster, fabric, concrete, makeCanvasTexture, labelTexture } from './textures.js';
import { rng } from './util.js';

export const CEIL = 2.75;

function std(o) { return new THREE.MeshStandardMaterial(o); }

// rain-on-glass shader injection; uniforms: uRain (0..1), uTime
export function rainGlass(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uRain = U.uRain; sh.uniforms.uTime = U.uTime; sh.uniforms.uDirtGlass = U.uDirtGlass;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWP; uniform float uRain, uTime, uDirtGlass;
      float h21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      vec3 drops(vec2 uv, float t){
        // returns (dx, dy, mask)
        vec3 acc = vec3(0.0);
        // static beads
        for (int L=0; L<2; L++){
          float sc = L==0 ? 28.0 : 55.0;
          vec2 g = uv*sc; vec2 id=floor(g); vec2 f=fract(g)-0.5;
          float r = h21(id+float(L)*7.0);
          vec2 o = vec2(h21(id+3.1)-0.5, h21(id+5.7)-0.5)*0.6;
          float life = fract(t*0.15 + r);
          float rad = (0.12+0.18*h21(id+9.2)) * smoothstep(0.0,0.1,life) * step(r, 0.55*uRain+0.05);
          vec2 d = f-o; float l = length(d);
          float m = smoothstep(rad, rad*0.6, l);
          acc.xy += d/ max(rad,0.001) * m; acc.z = max(acc.z, m);
        }
        // sliding drops with trails
        vec2 g2 = uv*vec2(9.0,2.2); float col = floor(g2.x); float rr = h21(vec2(col,1.7));
        float y = fract(g2.y + t*(0.25+0.5*rr) + rr*5.0);
        vec2 f2 = vec2(fract(g2.x)-0.5 + sin(uv.y*40.0+rr*6.0)*0.08, (y-0.5)*4.5);
        float l2 = length(f2*vec2(1.0,0.45));
        float m2 = smoothstep(0.22,0.12,l2) * step(rr, uRain*0.9);
        float trail = smoothstep(0.08,0.02,abs(f2.x)) * smoothstep(-0.2,1.6,f2.y) * step(rr, uRain*0.9) * 0.35;
        acc.xy += f2*m2*2.0; acc.z = max(acc.z, max(m2, trail));
        return acc;
      }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 ruv = vec2(vWP.x + vWP.z, vWP.y)*0.5;
        vec3 dr = uRain > 0.01 ? drops(ruv, uTime) : vec3(0.0);
        normal = normalize(normal + vec3(dr.x, dr.y, 0.0)*0.9*uRain);`)
      .replace('#include <opaque_fragment>', `
        float smudge = h21(floor(vWP.xy*30.0))*0.5 + 0.5;
        diffuseColor.a = clamp(diffuseColor.a + dr.z*0.35*uRain + uDirtGlass*0.08*smudge, 0.0, 1.0);
        outgoingLight += dr.z*uRain*0.04;
        #include <opaque_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rainglass';
}

export class Apartment {
  constructor(U) {
    this.group = new THREE.Group();
    this.U = U;
    const G = this.group;
    // ---------------- materials
    const wf = woodFloor();
    this.mFloor = std({ map: wf.map, normalMap: wf.normalMap, roughness: 0.55, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) });
    const pl = plaster();
    this.mWall = std({ map: pl.map, normalMap: pl.normalMap, roughness: 0.92, normalScale: new THREE.Vector2(0.3, 0.3) });
    const pl2 = plaster([210, 212, 214], 19);
    this.mCeil = std({ map: pl2.map, roughness: 0.95 });
    const sf = fabric([74, 78, 84]);
    this.mSofa = std({ map: sf.map, normalMap: sf.normalMap, roughness: 0.95 });
    const rugF = fabric([120, 104, 88], 9);
    this.mRug = std({ map: rugF.map, normalMap: rugF.normalMap, roughness: 1 });
    this.mAlu = std({ color: 0x2b2d30, roughness: 0.35, metalness: 0.85 });
    this.mSteel = std({ color: 0xb8bcc0, roughness: 0.28, metalness: 0.9 });
    this.mWhiteGloss = std({ color: 0xe9e8e4, roughness: 0.25 });
    this.mOak = std({ color: 0x8a6a4a, roughness: 0.5, map: wf.map });
    this.mDarkWood = std({ color: 0x4a3626, roughness: 0.55, map: wf.map });
    this.mBlack = std({ color: 0x0b0b0c, roughness: 0.3, metalness: 0.4 });
    this.mCounter = std({ color: 0x3b3a38, roughness: 0.3, metalness: 0.1 });
    this.mTile = std({ color: 0xd8d8d4, roughness: 0.2 });
    const cc = concrete();
    this.mConcrete = std({ map: cc.map, normalMap: cc.normalMap, roughness: 0.9 });
    this.mGlass = new THREE.MeshStandardMaterial({ color: 0xaab8c0, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.1, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
    rainGlass(this.mGlass, U);
    this.mBottle = new THREE.MeshStandardMaterial({ color: 0xcfe6f2, roughness: 0.08, transparent: true, opacity: 0.35, envMapIntensity: 1.5, depthWrite: false });
    this.mWater = new THREE.MeshStandardMaterial({ color: 0x9fc8e0, roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false });

    this.buildShell();
    this.buildLiving();
    this.buildKitchen();
    this.buildHall();
    this.buildBedBath();
    this.buildBalcony();
    this.buildProps();
    G.traverse((o) => { if (o.isMesh) { if (o.castShadow === false && !o.userData.noShadow) o.castShadow = true; o.receiveShadow = true; } });
  }
  add(mesh, pos, rot) { if (pos) mesh.position.set(...pos); if (rot) mesh.rotation.set(...rot); this.group.add(mesh); return mesh; }
  box(w, h, d, mat, pos, rot, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); (parent || this.group).add(m); return m; }
  rbox(w, h, d, r, mat, pos, rot, parent) { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); (parent || this.group).add(m); return m; }
  // wall segment between two xz points (thickness 0.14)
  wall(x0, z0, x1, z1, y0 = 0, y1 = CEIL, mat = this.mWall) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(len, y1 - y0, 0.14), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    this.group.add(m); return m;
  }

  buildShell() {
    // floor & ceiling
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 13.6), this.mFloor);
    fl.rotation.x = -Math.PI / 2; fl.position.set(1, 0, 2.6); this.group.add(fl);
    this.mFloor.map.repeat.set(5, 5); this.mFloor.normalMap.repeat.set(5, 5);
    const ce = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 13.6), this.mCeil);
    ce.rotation.x = Math.PI / 2; ce.position.set(1, CEIL, 2.6); this.group.add(ce);
    // slab edges seen from outside (floor slab and ceiling slab thickness)
    this.box(14.4, 0.32, 0.3, this.mConcrete, [1, -0.16, -4.05]);
    this.box(14.4, 0.45, 0.3, this.mConcrete, [1, CEIL + 0.22, -4.05]);
    // living room side walls
    this.wall(-6, -4, -6, 4); this.wall(6, -4, 6, 4);
    // back wall z=4 with opening x in [2,4]
    this.wall(-6, 4, 2, 4); this.wall(4, 4, 6, 4); this.wall(2, 4, 4, 4, 2.2, CEIL);
    // skirting
    for (const [x0, z0, x1, z1] of [[-6, -3.9, -6, 4], [6, -3.9, 6, 4]]) {
      const s = this.box(0.02, 0.08, Math.abs(z1 - z0), this.mWhiteGloss, [x0 + (x0 < 0 ? 0.08 : -0.08), 0.04, (z0 + z1) / 2]);
    }
    // ---- window wall z=-4: mullions + glass
    this.glass = [];
    const X0 = -6, X1 = 6, step = 1.5;
    for (let x = X0; x <= X1 + 0.01; x += step) this.box(0.07, CEIL, 0.12, this.mAlu, [x, CEIL / 2, -4]);
    this.box(12, 0.08, 0.14, this.mAlu, [0, 0.04, -4]);
    this.box(12, 0.08, 0.14, this.mAlu, [0, CEIL - 0.04, -4]);
    for (let x = X0; x < X1 - 0.01; x += step) {
      const isDoor = Math.abs(x - 1.5) < 0.01;
      const g = new THREE.Mesh(new THREE.PlaneGeometry(step - 0.06, CEIL - 0.1), this.mGlass);
      g.position.set(x + step / 2, CEIL / 2, -4 + (isDoor ? 0.05 : 0)); g.userData.noShadow = true; g.castShadow = false; g.receiveShadow = false;
      g.renderOrder = 10;
      this.group.add(g); this.glass.push(g);
      if (isDoor) { this.slideDoor = g; this.slideDoorX = g.position.x; const fr = this.box(0.05, CEIL - 0.1, 0.05, this.mAlu, [step / 2 - 0.03, 0, 0.0], null, g); fr.position.set(-(step / 2) + 0.03, 0, 0.02); }
    }
    // tape X on some panes (visible from day 12)
    this.tape = new THREE.Group(); this.group.add(this.tape);
    const tapeM = std({ color: 0xc9b98a, roughness: 0.9, transparent: true, opacity: 0.92 });
    for (const x of [-5.25, -3.75, 4.5]) for (const s of [1, -1]) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 2.9), tapeM);
      t.position.set(x, CEIL / 2, -3.97); t.rotation.z = s * 0.55; this.tape.add(t);
    }
  }

  buildLiving() {
    const G = this.group;
    // rug
    const rug = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.012, 2.4), this.mRug); rug.position.set(2.2, 0.006, 0.4); G.add(rug);
    // sofa (faces +X), centered at (1.0, 0, 0.4)
    const sofa = new THREE.Group(); sofa.position.set(0.95, 0, 0.4); G.add(sofa); this.sofa = sofa;
    this.rbox(0.95, 0.24, 2.4, 0.05, this.mSofa, [0, 0.2, 0], null, sofa); // base
    this.rbox(0.62, 0.17, 1.12, 0.07, this.mSofa, [0.13, 0.405, -0.57], null, sofa); // seat cushions
    this.rbox(0.62, 0.17, 1.12, 0.07, this.mSofa, [0.13, 0.405, 0.57], null, sofa);
    this.rbox(0.24, 0.62, 2.4, 0.08, this.mSofa, [-0.36, 0.58, 0], null, sofa); // back
    this.rbox(0.2, 0.42, 0.95, 0.07, this.mSofa, [0.07, 0.68, -0.55], [0, 0, 0.18], sofa); // back cushions
    this.rbox(0.2, 0.42, 0.95, 0.07, this.mSofa, [0.07, 0.68, 0.55], [0, 0, 0.18], sofa);
    this.rbox(0.95, 0.5, 0.2, 0.07, this.mSofa, [0, 0.42, -1.18], null, sofa); // arms
    this.rbox(0.95, 0.5, 0.2, 0.07, this.mSofa, [0, 0.42, 1.18], null, sofa);
    for (const [x, z] of [[-0.4, -1.1], [0.4, -1.1], [-0.4, 1.1], [0.4, 1.1]]) this.box(0.05, 0.08, 0.05, this.mBlack, [x, 0.04, z], null, sofa);
    // throw blanket
    const bl = this.rbox(0.5, 0.05, 0.7, 0.02, std({ color: 0x6b3a2c, roughness: 1 }), [0.05, 0.5, 0.75], [0, 0.2, 0.08], sofa);
    this.blanket = bl;
    // coffee table
    const ct = new THREE.Group(); ct.position.set(2.6, 0, 0.4); G.add(ct); this.coffeeTable = ct;
    this.rbox(0.7, 0.04, 1.2, 0.01, this.mOak, [0, 0.42, 0], null, ct);
    for (const [x, z] of [[-0.3, -0.55], [0.3, -0.55], [-0.3, 0.55], [0.3, 0.55]]) this.box(0.035, 0.4, 0.035, this.mBlack, [x, 0.2, z], null, ct);
    // TV on wall x=6 facing -X
    const tvg = new THREE.Group(); tvg.position.set(5.9, 1.35, 0.4); tvg.rotation.y = -Math.PI / 2; G.add(tvg);
    this.box(1.48, 0.86, 0.05, this.mBlack, [0, 0, 0], null, tvg);
    const scr = makeCanvasTexture(512, 288);
    this.tvCanvas = scr;
    const screenMat = new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: true });
    this.tvScreenMat = screenMat;
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.42, 0.8), screenMat); sm.position.z = 0.027; tvg.add(sm);
    this.tvScreen = sm;
    // TV console
    this.rbox(0.42, 0.45, 2.0, 0.02, this.mDarkWood, [5.7, 0.225, 0.4]);
    // floor lamp
    const fl = new THREE.Group(); fl.position.set(0.3, 0, -1.35); G.add(fl);
    this.box(0.3, 0.02, 0.3, this.mBlack, [0, 0.01, 0], null, fl);
    this.box(0.025, 1.55, 0.025, this.mBlack, [0, 0.78, 0], null, fl);
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.3, 32, 1, true), std({ color: 0xe8dcc4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc890, emissiveIntensity: 0.0 }));
    shade.position.y = 1.58; fl.add(shade); this.lampShade = shade;
    // bookshelf against wall x=-6? (living side) near window
    const bs = new THREE.Group(); bs.position.set(-5.78, 0, -1.4); G.add(bs);
    this.box(0.36, 2.0, 1.6, this.mDarkWood, [0, 1.0, 0], null, bs);
    const R = rng(4);
    for (let s = 0; s < 4; s++) for (let i = 0; i < 12; i++) {
      const h = 0.18 + R() * 0.1;
      const c = new THREE.Color().setHSL(R(), 0.3, 0.2 + R() * 0.25);
      this.box(0.24, h, 0.035 + R() * 0.03, std({ color: c, roughness: 0.8 }), [0.18, 0.12 + s * 0.48 + h / 2, -0.72 + i * 0.12], null, bs);
    }
    // plant
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 24), std({ color: 0x5a5148, roughness: 0.8 })); pot.position.set(5.3, 0.2, -3.3); G.add(pot);
    this.plant = new THREE.Group(); this.plant.position.set(5.3, 0.4, -3.3); G.add(this.plant);
    const leafM = std({ color: 0x2f5a2a, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) {
      const lf = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.55), leafM);
      lf.position.set(0, 0.35 + R() * 0.5, 0); lf.rotation.set(0.4 + R() * 0.6, R() * 6.28, 0, 'YXZ'); lf.translateY(0.25);
      this.plant.add(lf);
    }
    this.leafM = leafM;
    // ceiling lights (recessed discs)
    this.ceilDiscs = [];
    const discM = std({ color: 0xffffff, emissive: 0xfff1d8, emissiveIntensity: 2.0 });
    this.discM = discM;
    for (const [x, z] of [[-3.5, 0.5], [0, -1.5], [2.5, 0.4], [3, 6.5], [3, 5], [-4, 3]]) {
      const d = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24), discM); d.rotation.x = Math.PI / 2; d.position.set(x, CEIL - 0.005, z); G.add(d); this.ceilDiscs.push(d);
    }
    // wall art
    const art = makeCanvasTexture(256, 340);
    const g = art.ctx.createLinearGradient(0, 0, 256, 340); g.addColorStop(0, '#2f4858'); g.addColorStop(0.6, '#86624a'); g.addColorStop(1, '#d7a86e');
    art.ctx.fillStyle = g; art.ctx.fillRect(0, 0, 256, 340);
    art.ctx.fillStyle = 'rgba(20,20,30,0.6)'; for (let i = 0; i < 9; i++) art.ctx.fillRect(20 + i * 25, 340 - 60 - i * 13 % 70, 18, 200);
    const frame = this.box(0.03, 0.95, 0.72, this.mBlack, [-5.92, 1.55, 1.7]);
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.89), std({ map: art.tex, roughness: 0.6 })); pic.position.set(-5.9, 1.55, 1.7); pic.rotation.y = Math.PI / 2; this.group.add(pic);
    // tally marks on wall near window (x=-6 wall, z=-3)
    this.tally = makeCanvasTexture(512, 256);
    const tm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshStandardMaterial({ map: this.tally.tex, transparent: true, roughness: 0.9, depthWrite: false }));
    tm.position.set(-5.92, 1.25, -3.1); tm.rotation.y = Math.PI / 2; this.group.add(tm); this.tallyMesh = tm; this.tallyDay = -1;
  }
  setTally(day) {
    if (day === this.tallyDay) return; this.tallyDay = day;
    const { ctx, canvas, tex } = this.tally;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(25,22,20,0.85)'; ctx.lineCap = 'round';
    const R = rng(99);
    for (let i = 0; i < day; i++) {
      const grp = Math.floor(i / 5), k = i % 5;
      const row = Math.floor(grp / 6), col = grp % 6;
      const x0 = 20 + col * 80, y0 = 30 + row * 110;
      ctx.lineWidth = 4 + R() * 2;
      ctx.beginPath();
      if (k < 4) { const x = x0 + k * 13 + R() * 3; ctx.moveTo(x, y0 + R() * 6); ctx.lineTo(x + R() * 4 - 2, y0 + 80 + R() * 6); }
      else { ctx.moveTo(x0 - 6, y0 + 70); ctx.lineTo(x0 + 52, y0 + 12); }
      ctx.stroke();
    }
    tex.needsUpdate = true;
  }

  buildKitchen() {
    const G = this.group;
    // counter along back wall z=4 from x=-6 to -2.6
    this.rbox(3.4, 0.86, 0.62, 0.01, this.mWhiteGloss, [-4.3, 0.43, 3.62]);
    this.box(3.44, 0.04, 0.65, this.mCounter, [-4.3, 0.88, 3.6]);
    // counter along side wall x=-6 from z=1.2 to 3.3
    this.rbox(0.62, 0.86, 2.1, 0.01, this.mWhiteGloss, [-5.62, 0.43, 2.25]);
    this.box(0.65, 0.04, 2.14, this.mCounter, [-5.6, 0.88, 2.25]);
    // backsplash tiles
    this.box(3.4, 0.6, 0.02, this.mTile, [-4.3, 1.2, 3.92]);
    // upper cabinets
    this.rbox(3.4, 0.7, 0.35, 0.01, this.mWhiteGloss, [-4.3, 1.95, 3.75]);
    // cabinet door lines
    for (let x = -5.8; x < -2.6; x += 0.6) { this.box(0.008, 0.78, 0.01, this.mBlack, [x, 0.45, 3.305]); this.box(0.008, 0.68, 0.01, this.mBlack, [x, 1.95, 3.57]); }
    // sink + tap
    this.box(0.5, 0.02, 0.4, this.mSteel, [-4.6, 0.9, 3.6]);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 24, Math.PI), this.mSteel); tap.position.set(-4.6, 0.92, 3.82); this.group.add(tap);
    // stove
    this.box(0.6, 0.01, 0.5, this.mBlack, [-3.4, 0.905, 3.6]);
    // fridge x∈[-2.45,-1.65], z∈[3.28,3.98], front faces -Z
    const fr = new THREE.Group(); fr.position.set(-2.05, 0, 3.63); G.add(fr); this.fridge = fr;
    const fM = std({ color: 0xc9cbcc, roughness: 0.25, metalness: 0.75 });
    this.rbox(0.8, 1.86, 0.66, 0.02, fM, [0, 0.93, 0.02], null, fr);
    // interior (visible when door open)
    const inner = std({ color: 0xf2f2f0, roughness: 0.4, emissive: 0xdde8ff, emissiveIntensity: 0.0 });
    this.fridgeInner = inner;
    this.box(0.72, 1.7, 0.02, inner, [0, 0.95, -0.31], null, fr);
    const cav = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.7, 0.6), new THREE.MeshStandardMaterial({ color: 0xf0f0ee, roughness: 0.4, side: THREE.BackSide, emissive: 0xdde8ff, emissiveIntensity: 0 }));
    this.fridgeCav = cav.material;
    cav.position.set(0, 0.95, -0.02); fr.add(cav);
    // shelves
    const glassShelf = new THREE.MeshStandardMaterial({ color: 0xe0eef0, roughness: 0.1, transparent: true, opacity: 0.5 });
    for (const y of [0.55, 0.95, 1.35]) this.box(0.7, 0.01, 0.55, glassShelf, [0, y, -0.02], null, fr);
    // door hinge on +X side (x=+0.4), door spans to -X
    const hinge = new THREE.Group(); hinge.position.set(0.4, 0, -0.32); fr.add(hinge); this.fridgeDoor = hinge;
    this.rbox(0.8, 1.84, 0.06, 0.02, fM, [-0.4, 0.93, -0.03], null, hinge);
    this.box(0.025, 0.6, 0.03, this.mSteel, [-0.74, 1.1, -0.08], null, hinge); // handle
    // door shelves
    for (const y of [0.5, 0.9, 1.3]) this.box(0.66, 0.08, 0.1, std({ color: 0xeeeeee, roughness: 0.3, transparent: true, opacity: 0.7 }), [-0.4, y, 0.06], null, hinge);
    // fridge contents: bottles, cans, jars
    this.fridgeItems = new THREE.Group(); fr.add(this.fridgeItems);
    this.bottles = [];
    const bottleGeo = this.bottleGeo();
    for (let i = 0; i < 6; i++) {
      const b = this.makeBottle(bottleGeo);
      b.position.set(-0.27 + i * 0.105, 0.56, -0.05); this.fridgeItems.add(b); this.bottles.push(b);
      b.userData.home = b.position.clone(); b.userData.homeParent = this.fridgeItems;
    }
    const canGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.11, 24);
    const labs = [labelTexture('#a8231b', '#f0e6c8', 'BEANS'), labelTexture('#1b4fa8', '#f0f0f0', 'TUNA'), labelTexture('#2d7a2a', '#f7e7a1', 'PEAS')];
    this.cans = [];
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(canGeo, [std({ map: labs[i % 3], roughness: 0.4, metalness: 0.3 }), this.mSteel, this.mSteel]);
      c.position.set(-0.25 + i * 0.12, 1.016, -0.1); this.fridgeItems.add(c); this.cans.push(c);
    }
    // a few other items (jar, milk carton, box)
    this.rbox(0.07, 0.2, 0.07, 0.005, std({ color: 0xf4f4f4, roughness: 0.6 }), [0.22, 1.06, 0.05], null, this.fridgeItems);
    this.rbox(0.14, 0.09, 0.1, 0.01, std({ color: 0xd9a74a, roughness: 0.7 }), [0.0, 1.405, -0.05], null, this.fridgeItems);
    // kitchen table & chairs at (-3.4, 0, 0.6)
    const tb = new THREE.Group(); tb.position.set(-3.4, 0, 0.7); G.add(tb); this.table = tb;
    this.rbox(1.4, 0.04, 0.85, 0.01, this.mOak, [0, 0.75, 0], null, tb);
    for (const [x, z] of [[-0.62, -0.35], [0.62, -0.35], [-0.62, 0.35], [0.62, 0.35]]) this.box(0.045, 0.73, 0.045, this.mBlack, [x, 0.365, z], null, tb);
    this.chairs = [];
    for (const [x, z, ry] of [[0, -0.75, 0], [0, 0.75, Math.PI]]) {
      const ch = this.makeChair(); ch.position.set(-3.4 + x, 0, 0.7 + z); ch.rotation.y = ry; G.add(ch); this.chairs.push(ch);
    }
    // pendant over table
    const cord = this.box(0.006, 0.9, 0.006, this.mBlack, [-3.4, CEIL - 0.45, 0.7]);
    const pend = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.18, 32, 1, true), std({ color: 0x1d1d1d, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }));
    pend.position.set(-3.4, CEIL - 0.98, 0.7); G.add(pend);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), std({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 3 }));
    bulb.position.set(-3.4, CEIL - 1.05, 0.7); G.add(bulb); this.pendantBulb = bulb;
  }
  makeChair() {
    const c = new THREE.Group();
    this.rbox(0.45, 0.04, 0.45, 0.01, this.mOak, [0, 0.46, 0], null, c);
    for (const [x, z] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) this.box(0.03, 0.46, 0.03, this.mBlack, [x, 0.23, z], null, c);
    this.rbox(0.45, 0.4, 0.03, 0.01, this.mOak, [0, 0.72, -0.21], [0.08, 0, 0], c);
    return c;
  }
  bottleGeo() {
    const pts = [];
    const prof = [[0, 0], [0.033, 0], [0.036, 0.01], [0.036, 0.17], [0.03, 0.2], [0.014, 0.225], [0.014, 0.245], [0, 0.245]];
    for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 24);
  }
  makeBottle(geo) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(geo, this.mBottle); b.renderOrder = 5; g.add(b);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.031, 0.16, 20), this.mWater); w.position.y = 0.09; w.renderOrder = 4; g.add(w);
    g.userData.water = w;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.02, 16), std({ color: 0x1f5fbf, roughness: 0.5 })); cap.position.y = 0.252; g.add(cap);
    const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.0365, 0.0365, 0.06, 24, 1, true), std({ color: 0x2a7fd4, roughness: 0.5 })); lab.position.y = 0.1; g.add(lab);
    return g;
  }

  buildHall() {
    const G = this.group;
    // hallway x∈[2,4], z∈[4,9.2]
    this.wall(2, 4, 2, 5.0); this.wall(2, 5.9, 2, 9.2); this.wall(2, 5.0, 2, 5.9, 2.1, CEIL);
    this.wall(4, 4, 4, 4.6); this.wall(4, 5.5, 4, 9.2); this.wall(4, 4.6, 4, 5.5, 2.1, CEIL);
    // end wall with door opening x∈[2.95,3.9]
    this.wall(2, 9.2, 2.95, 9.2); this.wall(3.9, 9.2, 4, 9.2); this.wall(2.95, 9.2, 3.9, 9.2, 2.1, CEIL);
    // door frame
    const frameM = std({ color: 0xdedcd6, roughness: 0.5 });
    this.box(0.05, 2.1, 0.18, frameM, [2.93, 1.05, 9.2]); this.box(0.05, 2.1, 0.18, frameM, [3.92, 1.05, 9.2]); this.box(1.04, 0.05, 0.18, frameM, [3.425, 2.12, 9.2]);
    // front door: hinge at x=2.95, door width 0.95, opens inward (toward -z)
    const hinge = new THREE.Group(); hinge.position.set(2.96, 0, 9.16); G.add(hinge); this.frontDoor = hinge;
    const doorM = std({ color: 0x3d3f42, roughness: 0.45, metalness: 0.2 });
    this.rbox(0.93, 2.08, 0.06, 0.01, doorM, [0.465, 1.04, 0], null, hinge);
    // panels
    for (const y of [0.55, 1.5]) this.box(0.7, 0.75, 0.01, std({ color: 0x35373a, roughness: 0.5 }), [0.465, y, -0.032], null, hinge);
    // handle + deadbolt
    this.box(0.12, 0.02, 0.03, this.mSteel, [0.82, 1.02, -0.05], null, hinge);
    this.box(0.06, 0.06, 0.02, this.mSteel, [0.84, 1.02, -0.035], null, hinge);
    const bolt = new THREE.Group(); bolt.position.set(0.84, 1.25, -0.04); hinge.add(bolt); this.deadbolt = bolt;
    this.box(0.055, 0.055, 0.015, this.mSteel, [0, 0, 0], null, bolt);
    this.box(0.012, 0.045, 0.015, this.mSteel, [0, 0, -0.015], null, bolt).name = 'knob';
    this.chain = this.box(0.18, 0.012, 0.012, this.mSteel, [0.75, 1.55, -0.04], [0, 0, -0.4], hinge);
    // peephole light
    this.peep = new THREE.Mesh(new THREE.CircleGeometry(0.008, 12), new THREE.MeshBasicMaterial({ color: 0x999999 }));
    this.peep.position.set(0.465, 1.55, -0.031); this.peep.rotation.y = Math.PI; hinge.add(this.peep);
    // gap light under the door from stairwell (emissive strip)
    this.underDoor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.012), new THREE.MeshBasicMaterial({ color: 0xbfd2c0 }));
    this.underDoor.position.set(3.42, 0.006, 9.13); this.underDoor.rotation.y = Math.PI; G.add(this.underDoor);
    // coat hooks + jacket
    for (let i = 0; i < 3; i++) this.box(0.02, 0.02, 0.08, this.mSteel, [2.08, 1.75, 6.4 + i * 0.25]);
    this.rbox(0.12, 0.8, 0.45, 0.05, std({ color: 0x3a4a3a, roughness: 1 }), [2.12, 1.35, 6.65]);
    // heavy dresser (barricade) - initial in hallway against wall x=4
    const dr = new THREE.Group(); G.add(dr); this.dresser = dr;
    this.rbox(1.15, 1.25, 0.55, 0.01, this.mDarkWood, [0, 0.625, 0], null, dr);
    for (let i = 0; i < 4; i++) {
      this.box(1.05, 0.26, 0.02, std({ color: 0x55402c, roughness: 0.55 }), [0, 0.18 + i * 0.3, 0.28], null, dr);
      this.box(0.18, 0.025, 0.03, this.mSteel, [0, 0.2 + i * 0.3, 0.3], null, dr);
    }
    // things on top of dresser
    this.box(0.3, 0.25, 0.22, std({ color: 0x8f7a5a, roughness: 0.9 }), [-0.3, 1.375, 0], null, dr);
    this.dresserHome = { pos: [3.7, 0, 6.6], rot: -Math.PI / 2 };
    this.dresserBlock = { pos: [3.43, 0, 8.84], rot: Math.PI };
    dr.position.set(3.7, 0, 6.6); dr.rotation.y = -Math.PI / 2;
    // hallway ceiling light disc handled by ceilDiscs
  }

  buildBedBath() {
    const G = this.group;
    // bedroom x∈[4,8], z∈[4,8]
    this.wall(4, 8.0, 8, 8.0); this.wall(8, 4, 8, 8); this.wall(6, 4, 8, 4);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), this.mFloor); fl.rotation.x = -Math.PI / 2; fl.position.set(6, 0.001, 6); G.add(fl);
    const bed = new THREE.Group(); bed.position.set(6.5, 0, 6.6); G.add(bed); this.bed = bed;
    this.rbox(1.7, 0.3, 2.1, 0.03, this.mDarkWood, [0, 0.15, 0], null, bed);
    this.rbox(1.6, 0.22, 2.0, 0.08, std({ color: 0xe8e4dc, roughness: 1 }), [0, 0.4, 0], null, bed);
    this.rbox(1.62, 0.1, 1.4, 0.05, std({ color: 0x5d6f80, roughness: 1 }), [0, 0.53, -0.25], [0.02, 0, 0], bed);
    this.rbox(0.6, 0.14, 0.35, 0.07, std({ color: 0xf3f0ea, roughness: 1 }), [-0.4, 0.58, 0.78], null, bed);
    this.rbox(0.6, 0.14, 0.35, 0.07, std({ color: 0xf3f0ea, roughness: 1 }), [0.4, 0.58, 0.78], null, bed);
    this.box(1.8, 1.0, 0.08, this.mDarkWood, [0, 0.8, 1.06], null, bed);
    // curtains in bedroom window (closed)
    this.box(0.04, 2.5, 3.0, std({ color: 0x5c5a55, roughness: 1 }), [7.9, 1.3, 6]);
    // bathroom x∈[0,2], z∈[4,7]
    this.wall(0, 4, 0, 7); this.wall(0, 7, 2, 7);
    const tileF = new THREE.Mesh(new THREE.PlaneGeometry(2, 3), this.mTile); tileF.rotation.x = -Math.PI / 2; tileF.position.set(1, 0.002, 5.5); G.add(tileF);
    this.rbox(0.6, 0.15, 0.45, 0.04, std({ color: 0xffffff, roughness: 0.15 }), [0.35, 0.85, 5.6], null);
    this.box(0.5, 0.8, 0.4, this.mWhiteGloss, [0.3, 0.4, 5.6]);
    const mir = this.box(0.02, 0.7, 0.55, std({ color: 0xffffff, roughness: 0.02, metalness: 1.0 }), [0.08, 1.5, 5.6]);
    this.bathTap = this.box(0.12, 0.02, 0.02, this.mSteel, [0.17, 0.98, 5.6], [0, 0, 0]);
    this.rbox(0.7, 0.55, 1.6, 0.06, std({ color: 0xffffff, roughness: 0.15 }), [0.4, 0.28, 6.15]);
  }

  buildBalcony() {
    const G = this.group;
    this.box(12.4, 0.2, 2.0, this.mConcrete, [0, -0.1, -5.05]);
    // railing: glass panels + steel top rail
    for (let x = -6; x < 6; x += 1.5) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 1.0), this.mGlass); p.position.set(x + 0.75, 0.55, -6.0); p.renderOrder = 10; p.castShadow = false; p.userData.noShadow = true; G.add(p);
      this.box(0.04, 1.08, 0.04, this.mSteel, [x, 0.54, -6.0]);
    }
    this.box(12.0, 0.05, 0.07, this.mSteel, [0, 1.08, -6.0]);
    this.box(0.07, 1.08, 2.0, this.mSteel, [6.0, 0.54, -5.05]);
    this.box(0.07, 1.08, 2.0, this.mSteel, [-6.0, 0.54, -5.05]);
    // balcony chair & plant pots
    const ch = this.makeChair(); ch.position.set(4.2, 0, -5.0); ch.rotation.y = 0.6; G.add(ch);
    // curtains near the sliding door (wind animated)
    const cg = new THREE.PlaneGeometry(1.2, 2.6, 20, 30);
    this.curtainMat = std({ color: 0xece6da, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.86 });
    this.curtainMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.U.uTime; sh.uniforms.uWind = this.U.uWind;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWind;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float hang = (1.3 - position.y) / 2.6;
          float folds = sin(position.x*18.0)*0.035;
          float wv = sin(position.x*5.0 + uTime*2.3)*0.5 + sin(position.y*3.0 + uTime*1.7 + position.x*2.0)*0.5;
          transformed.z += folds + hang*hang*(wv*0.12 + 0.35)*uWind;
          transformed.x += hang*hang*sin(uTime*1.3+position.y)*0.08*uWind;`);
    };
    this.curtainMat.customProgramCacheKey = () => 'curtain';
    for (const x of [0.75, 3.85]) { const c = new THREE.Mesh(cg, this.curtainMat); c.position.set(x, 1.35, -3.82); c.castShadow = true; G.add(c); }
  }

  buildProps() {
    const G = this.group;
    // flashlight
    const fl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.16, 16), std({ color: 0x151515, roughness: 0.5, metalness: 0.5 })); body.rotation.x = Math.PI / 2; fl.add(body);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.019, 0.05, 20), std({ color: 0x202020, roughness: 0.4, metalness: 0.7 })); head.rotation.x = Math.PI / 2; head.position.z = 0.1; fl.add(head);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 20), new THREE.MeshBasicMaterial({ color: 0xfff6e0 })); lens.position.z = 0.126; fl.add(lens);
    this.flashLens = lens;
    this.flashlight = fl;
    // beam cone (fake volumetric)
    const coneG = new THREE.ConeGeometry(0.9, 4.5, 32, 1, true); coneG.translate(0, -2.25, 0); coneG.rotateX(-Math.PI / 2);
    this.beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 0 } },
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP=position; vec4 wp=modelViewMatrix*vec4(position,1.0); vN=normalize(normalMatrix*normal); vV=normalize(-wp.xyz); gl_Position=projectionMatrix*wp; }',
      fragmentShader: 'uniform float uI; varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float d = clamp(vP.z/4.5,0.0,1.0); float edge = pow(abs(dot(vN,vV)),2.0); float a = (1.0-d)*(1.0-d)*edge*uI*0.10; gl_FragColor=vec4(vec3(1.0,0.96,0.88)*a,1.0); }',
    });
    const beam = new THREE.Mesh(coneG, this.beamMat); beam.position.z = 0.12; beam.renderOrder = 20; fl.add(beam); beam.castShadow = false; beam.userData.noShadow = true;
    this.beam = beam;
    G.add(fl);
    // mess (day 17+ / 30): cans, papers, overturned chair, boxes, blankets
    this.mess = new THREE.Group(); G.add(this.mess);
    const R = rng(77);
    const paperM = std({ color: 0xe9e6dc, roughness: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 26; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), paperM);
      p.rotation.set(-Math.PI / 2, 0, R() * 6.28); p.position.set(-4 + R() * 9, 0.003 + i * 0.0003, -2.5 + R() * 6); this.mess.add(p);
    }
    const canGeo = new THREE.CylinderGeometry(0.037, 0.037, 0.11, 16);
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Mesh(canGeo, this.mSteel);
      const lying = R() > 0.4;
      c.position.set(-4.5 + R() * 8, lying ? 0.037 : 0.055, -2 + R() * 5); if (lying) c.rotation.set(Math.PI / 2, 0, R() * 6.28); this.mess.add(c);
    }
    for (let i = 0; i < 4; i++) this.rbox(0.45 + R() * 0.2, 0.3 + R() * 0.2, 0.35, 0.01, std({ color: 0x9a7f5c, roughness: 0.95 }), [-5 + R() * 3, 0.2, -3.2 + R() * 1.0], [0, R(), 0], this.mess);
    // mattress dragged to the living room by the window
    this.mattress = this.rbox(0.95, 0.16, 1.95, 0.06, std({ color: 0xd8d3c8, roughness: 1 }), [-1.6, 0.08, -2.3], [0, 0.12, 0], this.mess);
    this.messBlanket = this.rbox(0.9, 0.06, 1.3, 0.03, std({ color: 0x5d6f80, roughness: 1 }), [-1.55, 0.19, -2.0], [0.05, 0.25, 0.04], this.mess);
    const empty = this.bottleGeo();
    for (let i = 0; i < 7; i++) { const b = this.makeBottle(empty); b.userData.water.visible = false; b.position.set(-2.8 + R() * 2, 0.036, -1.2 + R() * 2); b.rotation.set(Math.PI / 2, 0, R() * 6.28); this.mess.add(b); }
    // the last bottle (day 17) on kitchen table
    this.lastBottle = this.makeBottle(this.bottleGeo());
    this.lastBottle.userData.water.scale.y = 0.35; this.lastBottle.userData.water.position.y = 0.035;
    G.add(this.lastBottle);
    // radio on the floor by the window
    this.radioSpot = new THREE.Group(); this.radioSpot.position.set(-0.6, 0, -3.2); G.add(this.radioSpot);
  }

  // state per frame
  update(s) {
    this.U.uDirtGlass.value = s.day > 10 ? Math.min(1, (s.day - 10) / 15) : 0;
    this.tape.visible = s.day >= 12;
    this.mess.visible = s.day >= 17;
    this.mattress.visible = s.day >= 17;
    this.chairs[1].rotation.z = s.day >= 30 ? Math.PI / 2 : 0;
    this.chairs[1].position.y = s.day >= 30 ? 0.22 : 0;
    this.setTally(Math.max(0, Math.floor(s.day)));
    this.lastBottle.visible = s.day >= 17;
    this.plant.rotation.z = s.day >= 17 ? 0.25 : 0;
    this.leafM.color.setHex(s.day >= 17 ? 0x4f5a2a : 0x2f5a2a);
  }
}
