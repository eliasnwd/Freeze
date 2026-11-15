// Toon look: flat cel shading + black ink outlines (inverted hull, constant pixel width)
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const grad = (() => {
  const d = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
})();

const cache = new Map();
export function toon(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!opts.unique && cache.has(key)) return cache.get(key);
  const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: grad }, opts));
  delete m.unique;
  if (!opts.unique) cache.set(key, m);
  return m;
}

export const outlineUniforms = { uRes: { value: new THREE.Vector2(1080, 1920) }, uPx: { value: 2.6 } };
const outlineMat = new THREE.ShaderMaterial({
  uniforms: outlineUniforms,
  side: THREE.BackSide,
  vertexShader: /* glsl */`
    uniform vec2 uRes; uniform float uPx;
    void main(){
      vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      vec3 n = normalize(normalMatrix * normal);
      vec4 cn = projectionMatrix * vec4(n, 0.0);
      vec2 d = cn.xy; float l = length(d); if (l > 1e-5) d /= l;
      p.xy += d * uPx * 2.0 / uRes * p.w;
      p.z += 0.00002 * p.w;
      gl_Position = p;
    }`,
  fragmentShader: 'void main(){ gl_FragColor = vec4(0.06,0.06,0.07,1.0); }',
});
const geoOutline = new WeakMap();
export function addOutline(mesh, scale = 1) {
  let g = geoOutline.get(mesh.geometry);
  if (!g) {
    g = mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g = mergeVertices(g, 1e-4); g.computeVertexNormals();
    geoOutline.set(mesh.geometry, g);
  }
  const o = new THREE.Mesh(g, outlineMat);
  o.name = 'outline'; o.castShadow = false; o.receiveShadow = false;
  if (scale !== 1) o.userData.px = scale;
  mesh.add(o);
  return o;
}

// helper: mesh with toon material + outline
export function M(geo, color, opts = {}) {
  const mat = color && color.isMaterial ? color : toon(color, opts.mat || {});
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = opts.shadow !== false; m.receiveShadow = true;
  if (opts.outline !== false) addOutline(m);
  if (opts.pos) m.position.set(...opts.pos);
  if (opts.rot) m.rotation.set(...opts.rot);
  if (opts.scale) m.scale.set(...opts.scale);
  if (opts.parent) opts.parent.add(m);
  return m;
}
