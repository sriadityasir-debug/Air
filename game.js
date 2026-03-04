/* ================================================================
   SKYPILOT 3D — game.js
   Real 3D flight sim using Three.js r128
   ================================================================ */
'use strict';

(function () {

// ── THREE.JS INIT ──────────────────────────────────────────────
const threeCvs = document.getElementById('three-cvs');
const hudCvs   = document.getElementById('hud-cvs');
const hctx     = hudCvs.getContext('2d');

const renderer = new THREE.WebGLRenderer({
  canvas: threeCvs,
  antialias: window.devicePixelRatio < 2,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 2, 120000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hudCvs.width  = w;
  hudCvs.height = h;
}
resize();
window.addEventListener('resize', resize);

// ── LIGHTING ──────────────────────────────────────────────────
const sunLight = new THREE.DirectionalLight(0xfff4d8, 1.5);
sunLight.position.set(4000, 9000, 2000);
scene.add(sunLight);
const ambLight = new THREE.AmbientLight(0x6080b0, 0.9);
scene.add(ambLight);

// ── PROCEDURAL SKY ────────────────────────────────────────────
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uZenith:  { value: new THREE.Color(0x0a1e5e) },
    uHorizon: { value: new THREE.Color(0x55a8e0) },
    uGround:  { value: new THREE.Color(0x3a5828) }
  },
  vertexShader: `
    varying vec3 vDir;
    void main(){
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }`,
  fragmentShader: `
    uniform vec3 uZenith, uHorizon, uGround;
    varying vec3 vDir;
    void main(){
      float y = vDir.y;
      vec3 c = y > 0.0
        ? mix(uHorizon, uZenith, pow(y, 0.5))
        : mix(uHorizon, uGround, min(-y * 4.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(95000, 32, 16), skyMat);
scene.add(sky);

// Sun disc
const sunMesh = new THREE.Mesh(
  new THREE.CircleGeometry(900, 32),
  new THREE.MeshBasicMaterial({ color: 0xfffbe4, depthWrite: false })
);
sunMesh.position.set(38000, 42000, -35000);
sunMesh.lookAt(new THREE.Vector3(0, 0, 0));
scene.add(sunMesh);
// Sun glow
const sunGlow = new THREE.Mesh(
  new THREE.CircleGeometry(2600, 32),
  new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0.18, depthWrite: false })
);
sunGlow.position.copy(sunMesh.position);
sunGlow.lookAt(new THREE.Vector3(0, 0, 0));
scene.add(sunGlow);

// ── TERRAIN NOISE ─────────────────────────────────────────────
function hash(x, y) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
function sNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (
    hash(ix,   iy  ) * (1-ux) * (1-uy) +
    hash(ix+1, iy  ) *    ux  * (1-uy) +
    hash(ix,   iy+1) * (1-ux) *    uy  +
    hash(ix+1, iy+1) *    ux  *    uy
  );
}
function fbm(x, y) {
  return sNoise(x,y)*0.50 + sNoise(x*2.1,y*2.1)*0.25 +
         sNoise(x*4.3,y*4.3)*0.125 + sNoise(x*8.7,y*8.7)*0.0625;
}

const T_SCALE = 0.00038;
const T_MAX_H = 1700;
function getH(x, z) {
  return fbm((x + 999) * T_SCALE, (z + 999) * T_SCALE) * T_MAX_H - 90;
}

function hColor(h) {
  if (h < -20) return [0.22, 0.42, 0.72]; // water
  if (h <   0) return [0.74, 0.70, 0.52]; // sand/shore
  if (h < 320) return [0.20, 0.56, 0.22]; // grass
  if (h < 720) return [0.38, 0.48, 0.26]; // forest
  if (h <1100) return [0.52, 0.45, 0.35]; // rock
  if (h <1450) return [0.65, 0.62, 0.58]; // high rock
  return              [0.90, 0.90, 0.94]; // snow
}

// ── BUILD TERRAIN ─────────────────────────────────────────────
const T_SIZE = 20000, T_SEGS = 150;
const terrainGeo = new THREE.PlaneGeometry(T_SIZE, T_SIZE, T_SEGS, T_SEGS);
terrainGeo.rotateX(-Math.PI / 2);
(function () {
  const pos = terrainGeo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const h = getH(pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    const c = hColor(h);
    cols[i*3]=c[0]; cols[i*3+1]=c[1]; cols[i*3+2]=c[2];
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  terrainGeo.computeVertexNormals();
})();
const terrain = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshLambertMaterial({ vertexColors: true })
);
scene.add(terrain);

// Atmospheric fog
scene.fog = new THREE.FogExp2(0x9dc4e0, 0.000055);

// ── RUNWAY ────────────────────────────────────────────────────
const rwy = new THREE.Group();
const rwyH = getH(0, 0);
// Surface
const rwyMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(65, 1800),
  new THREE.MeshLambertMaterial({ color: 0x3c3c3c })
);
rwyMesh.rotation.x = -Math.PI / 2;
rwyMesh.position.set(0, rwyH + 0.5, 0);
rwy.add(rwyMesh);
// Dashes
const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
for (let z = -800; z <= 800; z += 100) {
  const d = new THREE.Mesh(new THREE.PlaneGeometry(3, 40), dashMat);
  d.rotation.x = -Math.PI / 2;
  d.position.set(0, rwyH + 0.6, z);
  rwy.add(d);
}
// Threshold stripes
[-22,-11,11,22].forEach(x => {
  [-850,-820].forEach(z => {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(5, 25), dashMat);
    t.rotation.x = -Math.PI / 2;
    t.position.set(x, rwyH + 0.6, z);
    rwy.add(t);
  });
});
scene.add(rwy);

// ── CLOUDS ────────────────────────────────────────────────────
const cloudMat = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false
});
for (let i = 0; i < 55; i++) {
  const cg = new THREE.Group();
  const cx = (Math.random() - 0.5) * 17000;
  const cz = (Math.random() - 0.5) * 17000;
  const cy = 2200 + Math.random() * 3800;
  const blobs = 3 + Math.floor(Math.random() * 5);
  for (let j = 0; j < blobs; j++) {
    const r = 180 + Math.random() * 420;
    const s = new THREE.Mesh(new THREE.SphereGeometry(r, 7, 5), cloudMat);
    s.position.set((Math.random()-0.5)*r*3, (Math.random()-0.5)*r*0.4, (Math.random()-0.5)*r*3);
    s.scale.y = 0.38;
    cg.add(s);
  }
  cg.position.set(cx, cy, cz);
  scene.add(cg);
}

// ── TREES ─────────────────────────────────────────────────────
const treeConeMat = new THREE.MeshLambertMaterial({ color: 0x1b5e20 });
const treeTrunkMat = new THREE.MeshLambertMaterial({ color: 0x5d3a1a });
const coneGeo  = new THREE.ConeGeometry(22, 70, 5);
const trunkGeo = new THREE.CylinderGeometry(5, 7, 28, 5);
for (let i = 0; i < 600; i++) {
  const tx = (Math.random() - 0.5) * 16000;
  const tz = (Math.random() - 0.5) * 16000;
  const th = getH(tx, tz);
  if (th < 5 || th > 900) continue;
  const tree = new THREE.Mesh(coneGeo, treeConeMat);
  tree.position.set(tx, th + 42, tz);
  tree.rotation.y = Math.random() * Math.PI * 2;
  scene.add(tree);
}

// ── AIRPLANE MODEL ────────────────────────────────────────────
// Forward direction is +Z. Up is +Y. Right is +X.
function M(geo, mat) { return new THREE.Mesh(geo, mat); }
const MAT = {
  wh: new THREE.MeshPhongMaterial({ color: 0xeef3fa, shininess: 130 }),
  gy: new THREE.MeshPhongMaterial({ color: 0x6a7080, shininess: 60 }),
  dk: new THREE.MeshPhongMaterial({ color: 0x111118 }),
  nv: new THREE.MeshPhongMaterial({ color: 0x1a3a8a }),
  rd: new THREE.MeshPhongMaterial({ color: 0xcc2222 })
};

const airplane = new THREE.Group();

// Fuselage (extends along Z)
const fg = new THREE.CylinderGeometry(2.5, 2.0, 40, 10); fg.rotateX(Math.PI/2);
airplane.add(M(fg, MAT.wh));
// Nose cone
const ng = new THREE.ConeGeometry(2.0, 9, 10); ng.rotateX(Math.PI/2);
const nose = M(ng, MAT.wh); nose.position.z = 24; airplane.add(nose);
// Tail cone
const tg = new THREE.ConeGeometry(2.0, 7, 10); tg.rotateX(-Math.PI/2);
const tailCone = M(tg, MAT.wh); tailCone.position.z = -23; airplane.add(tailCone);
// Cockpit dark glass
const cg2 = new THREE.CylinderGeometry(2.55, 2.55, 4, 10, 1, true, -0.9, 2.0); cg2.rotateX(Math.PI/2);
const cock = M(cg2, MAT.dk); cock.position.set(0, 0.4, 16); airplane.add(cock);
// Main wings
const wg = new THREE.BoxGeometry(54, 0.65, 11); const wing = M(wg, MAT.wh);
wing.position.set(0, -0.9, 3); airplane.add(wing);
// Leading edge sweep
const le1 = M(new THREE.BoxGeometry(27, 0.5, 3), MAT.wh); le1.position.set(-14.5,-0.8, 7); le1.rotation.y=-0.14; airplane.add(le1);
const le2 = M(new THREE.BoxGeometry(27, 0.5, 3), MAT.wh); le2.position.set( 14.5,-0.8, 7); le2.rotation.y= 0.14; airplane.add(le2);
// Winglets
[-27,27].forEach((x,i) => {
  const wl = M(new THREE.BoxGeometry(1, 5, 4), MAT.nv);
  wl.position.set(x, 1.5, 2); wl.rotation.z = (i===0?1:-1)*0.32; airplane.add(wl);
});
// Engines
[-13.5,13.5].forEach(ex => {
  const eg = new THREE.CylinderGeometry(1.8, 1.6, 10, 10); eg.rotateX(Math.PI/2);
  const eng = M(eg, MAT.gy); eng.position.set(ex, -3, 5); airplane.add(eng);
  const ig = new THREE.TorusGeometry(1.8, 0.42, 8, 16); ig.rotateX(Math.PI/2);
  const intake = M(ig, MAT.dk); intake.position.set(ex, -3, 11); airplane.add(intake);
  const no = new THREE.TorusGeometry(1.6, 0.3, 8, 16); no.rotateX(Math.PI/2);
  const nozzle = M(no, MAT.gy); nozzle.position.set(ex, -3, -1); airplane.add(nozzle);
  const py = M(new THREE.BoxGeometry(1.4, 2.3, 3), MAT.wh);
  py.position.set(ex, -1.7, 5); airplane.add(py);
});
// H-stabilizer
const hs = M(new THREE.BoxGeometry(20, 0.5, 5), MAT.wh); hs.position.set(0, 0.2, -19); airplane.add(hs);
// V-stabilizer (navy livery)
const vs = M(new THREE.BoxGeometry(1.1, 11, 7), MAT.nv); vs.position.set(0, 5.5, -18); airplane.add(vs);
// Fuselage navy stripe
const sg = new THREE.CylinderGeometry(2.55, 2.55, 15, 10, 1, true); sg.rotateX(Math.PI/2);
const stripe = M(sg, MAT.nv); stripe.position.z = 5; airplane.add(stripe);
// Landing gear group
const lgGroup = new THREE.Group();
const lgMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });
const whl = new THREE.TorusGeometry(1.1, 0.55, 6, 12);
// Nose gear
const ngStrut = M(new THREE.CylinderGeometry(0.55,0.55,5,6), lgMat); ngStrut.position.set(0,-5,16); lgGroup.add(ngStrut);
const ngW = M(whl, lgMat); const ngWG = whl.clone(); ngWG.rotateX(Math.PI/2);
const ngWheel = M(ngWG, lgMat); ngWheel.position.set(0,-7.8,16); lgGroup.add(ngWheel);
// Main gear
[-7,7].forEach(x => {
  const ms = M(new THREE.CylinderGeometry(0.65,0.65,4,6), lgMat); ms.position.set(x,-5.5,2); lgGroup.add(ms);
  const mwg = whl.clone(); mwg.rotateX(Math.PI/2);
  const mw = M(mwg, lgMat); mw.position.set(x,-8,2); lgGroup.add(mw);
});
airplane.add(lgGroup);
airplane.userData.lgGroup = lgGroup;
scene.add(airplane);

// ── FLIGHT STATE ──────────────────────────────────────────────
const S = {
  pos:      new THREE.Vector3(0, 900, -200),
  yaw:      0,
  pitch:    0,
  roll:     0,
  speed:    160,  // units/s
  throttle: 55,
  flaps:    0,
  gear:     false,
  vspd:     0,
  crashed:  false,
  started:  false
};

const STALL = 62, MAX_SPD = 340;

// ── CONTROLS ─────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key==='f'||e.key==='F') cycleFlaps();
  if (e.key==='g'||e.key==='G') toggleGear();
  if (e.key==='r'||e.key==='R') resetFlight();
  if ('wsadqeWSADQEArrowUpArrowDown'.indexOf(e.key) >= 0) e.preventDefault();
});
document.addEventListener('keyup', e => { keys[e.key] = false; });

function cycleFlaps() { S.flaps = S.flaps >= 30 ? 0 : S.flaps + 10; }
function toggleGear()  { if (S.pos.y > 80) S.gear = !S.gear; }

// Joystick
const joyEl  = document.getElementById('joy-zone');
const joyKnob = document.getElementById('joy-knob');
let joyActive = false, joyTid = null, jIn = { x: 0, y: 0 };
const JR = 48; // max radius in px

function jCenter() {
  const r = joyEl.getBoundingClientRect();
  return { cx: r.left + r.width/2, cy: r.top + r.height/2 };
}
function moveJoy(t) {
  const { cx, cy } = jCenter();
  const dx = t.clientX - cx, dy = t.clientY - cy;
  const d = Math.min(Math.sqrt(dx*dx+dy*dy), JR);
  const a = Math.atan2(dy, dx);
  const nx = Math.cos(a)*d, ny = Math.sin(a)*d;
  // Visual: clamp to 32% of parent to keep knob inside circle
  const f = 32;
  joyKnob.style.left = (50 + (nx/JR)*f) + '%';
  joyKnob.style.top  = (50 + (ny/JR)*f) + '%';
  jIn = { x: nx/JR, y: ny/JR };
}

joyEl.addEventListener('touchstart', e => {
  e.preventDefault(); joyActive = true; joyTid = e.changedTouches[0].identifier;
  moveJoy(e.changedTouches[0]);
}, { passive: false });

// Throttle
const thrTrack = document.getElementById('thr-track');
const thrFill  = document.getElementById('thr-fill');
const thrThumb = document.getElementById('thr-thumb');
let thrActive = false, thrTid = null;

function setThrY(cy) {
  const r = thrTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, 1 - (cy - r.top) / r.height));
  S.throttle = pct * 100;
  setThrUI(pct);
}
function setThrUI(pct) {
  thrFill.style.height  = (pct*100) + '%';
  thrThumb.style.bottom = Math.max(0, pct*100 - 5) + '%';
}

thrTrack.addEventListener('touchstart', e => {
  e.preventDefault(); thrActive = true; thrTid = e.changedTouches[0].identifier;
  setThrY(e.changedTouches[0].clientY);
}, { passive: false });

// Combined touch move/end
document.addEventListener('touchmove', e => {
  let handled = false;
  for (const t of e.changedTouches) {
    if (t.identifier === joyTid && joyActive)  { moveJoy(t); handled = true; }
    if (t.identifier === thrTid && thrActive)   { setThrY(t.clientY); handled = true; }
  }
  if (handled) e.preventDefault();
}, { passive: false });

document.addEventListener('touchend', e => {
  for (const t of e.changedTouches) {
    if (t.identifier === joyTid) {
      joyActive = false; jIn = { x: 0, y: 0 };
      joyKnob.style.left = '50%'; joyKnob.style.top = '50%';
    }
    if (t.identifier === thrTid) thrActive = false;
  }
});

// Yaw buttons
let yawL = false, yawR = false;
const btnYL = document.getElementById('btn-yl');
const btnYR = document.getElementById('btn-yr');
btnYL.addEventListener('touchstart', e => { e.preventDefault(); yawL = true; }, { passive: false });
btnYL.addEventListener('touchend', () => yawL = false);
btnYR.addEventListener('touchstart', e => { e.preventDefault(); yawR = true; }, { passive: false });
btnYR.addEventListener('touchend', () => yawR = false);

document.getElementById('btn-flap').addEventListener('touchstart', e => { e.preventDefault(); cycleFlaps(); }, { passive: false });
document.getElementById('btn-gear').addEventListener('touchstart', e => { e.preventDefault(); toggleGear(); }, { passive: false });

// ── PHYSICS ───────────────────────────────────────────────────
let lastT = 0;

function physicsUpdate(dt) {
  if (!S.started || S.crashed) return;

  // Throttle keys
  if (keys['ArrowUp'])   S.throttle = Math.min(100, S.throttle + 68*dt);
  if (keys['ArrowDown']) S.throttle = Math.max(0,   S.throttle - 68*dt);

  const stalled = S.speed < STALL && S.pos.y > 25;
  const eff = stalled ? 0.10 : 1.0;

  // Control surface inputs
  if (keys['w']||keys['W']) S.pitch += 1.3*dt*eff;
  if (keys['s']||keys['S']) S.pitch -= 1.3*dt*eff;
  if (keys['a']||keys['A']) S.roll  -= 1.6*dt*eff;
  if (keys['d']||keys['D']) S.roll  += 1.6*dt*eff;
  if (keys['q']||keys['Q']) S.yaw   -= 0.7*dt;
  if (keys['e']||keys['E']) S.yaw   += 0.7*dt;
  if (joyActive) {
    S.pitch -= jIn.y * 1.3*dt*eff;
    S.roll  += jIn.x * 1.6*dt*eff;
  }
  if (yawL) S.yaw -= 0.7*dt;
  if (yawR) S.yaw += 0.7*dt;

  // Clamp attitude
  S.pitch = Math.max(-1.15, Math.min(1.15, S.pitch));
  S.roll  = Math.max(-1.3,  Math.min(1.3,  S.roll));

  // Stability (self-leveling)
  S.pitch *= (1 - 0.20*dt);
  S.roll  *= (1 - 0.52*dt);

  // Roll induces coordinated turn
  S.yaw += Math.sin(S.roll) * 0.55*dt * (S.speed / 180);

  // Speed (thrust vs drag)
  const flpD = 1 + S.flaps * 0.013;
  const gearD = S.gear ? 1.12 : 1.0;
  const thrust = S.throttle * 0.046;
  const drag   = 0.0013 * S.speed * flpD * gearD + 0.55;
  S.speed = Math.max(0, Math.min(MAX_SPD, S.speed + (thrust - drag)*dt*18));

  // Vertical motion
  const liftMult = stalled ? 0.04 : (1 + S.flaps*0.007);
  S.vspd = S.speed * Math.sin(S.pitch) * 2.8 * liftMult;
  S.pos.y += S.vspd * dt * 8;

  // Horizontal motion
  S.pos.x += Math.sin(S.yaw) * S.speed * Math.cos(S.pitch) * dt * 1.3;
  S.pos.z += Math.cos(S.yaw) * S.speed * Math.cos(S.pitch) * dt * 1.3;

  // Terrain edge wrap
  const edge = T_SIZE * 0.45;
  if (S.pos.x >  edge) S.pos.x = -edge + 200;
  if (S.pos.x < -edge) S.pos.x =  edge - 200;
  if (S.pos.z >  edge) S.pos.z = -edge + 200;
  if (S.pos.z < -edge) S.pos.z =  edge - 200;

  // Ground collision
  const gnd = getH(S.pos.x, S.pos.z) + 4;
  if (S.pos.y <= gnd) {
    if (S.speed > 52 || Math.abs(S.pitch) > 0.28 || Math.abs(S.roll) > 0.32) {
      doCrash(); return;
    }
    S.pos.y = gnd; S.vspd = 0;
    S.pitch = 0; S.roll *= 0.88; S.speed *= 0.97;
  }
  S.pos.y = Math.max(0, S.pos.y);
}

function doCrash() {
  S.crashed = true;
  document.getElementById('crash').style.display = 'flex';
}

// ── AIRPLANE POSE ─────────────────────────────────────────────
const _qY = new THREE.Quaternion(), _qP = new THREE.Quaternion(), _qR = new THREE.Quaternion();
const _AY = new THREE.Vector3(0,1,0), _AX = new THREE.Vector3(1,0,0), _AZ = new THREE.Vector3(0,0,1);

function updatePose() {
  airplane.position.copy(S.pos);
  _qY.setFromAxisAngle(_AY, -S.yaw);
  _qP.setFromAxisAngle(_AX,  S.pitch);
  _qR.setFromAxisAngle(_AZ,  S.roll);
  airplane.quaternion.copy(_qY).multiply(_qP).multiply(_qR);
  airplane.userData.lgGroup.visible = S.gear;
}

// ── CHASE CAMERA ─────────────────────────────────────────────
// Camera trails behind the plane, looking at it with smooth lerp
const _camOff = new THREE.Vector3(0, 22, -115);
const camPos  = new THREE.Vector3();
const camLook = new THREE.Vector3();
let camInit = false;

function updateCamera() {
  // Rotate offset by plane yaw only (so camera stays "behind")
  const q = new THREE.Quaternion().setFromAxisAngle(_AY, -S.yaw);
  const worldOff = _camOff.clone().applyQuaternion(q);
  const desired = S.pos.clone().add(worldOff);
  // Look slightly ahead of plane
  const ahead = new THREE.Vector3(Math.sin(S.yaw)*50, S.pos.y*0.04+3, Math.cos(S.yaw)*50);
  const lookAt = S.pos.clone().add(ahead);

  if (!camInit) { camPos.copy(desired); camLook.copy(lookAt); camInit = true; }
  camPos.lerp(desired, 0.055);
  camLook.lerp(lookAt, 0.09);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ── DYNAMIC SKY COLOR ─────────────────────────────────────────
function updateSky() {
  const t = Math.min(S.pos.y / 9000, 1);
  skyMat.uniforms.uZenith.value.setRGB(
    0.04 + (0.02-0.04)*t, 0.12 + (0.05-0.12)*t, 0.42 + (0.06-0.42)*t
  );
  skyMat.uniforms.uHorizon.value.setRGB(
    0.44 + (0.14-0.44)*t, 0.72 + (0.28-0.72)*t, 0.88 + (0.40-0.88)*t
  );
  scene.fog.color.copy(skyMat.uniforms.uHorizon.value);
  renderer.setClearColor(scene.fog.color);
  sky.position.copy(camera.position);
}

// ── HUD DRAWING ───────────────────────────────────────────────
function drawHUD() {
  const W = hudCvs.width, H = hudCvs.height;
  hctx.clearRect(0, 0, W, H);
  if (!S.started) return;

  const mobile = (H < 460);
  const spd = Math.round(S.speed);
  const altM = S.pos.y;
  const altFt = Math.round(altM * 3.281);
  const thr = Math.round(S.throttle);
  const hdg = ((S.yaw * 180 / Math.PI) % 360 + 360) % 360;
  const vspdFpm = Math.round(S.vspd * 52); // approx ft/min
  const stalled = spd < STALL && altM > 22;

  const gr = mobile ? 46 : 62;
  const gy = mobile ? gr + 8 : H * 0.21;

  // Airspeed (left)
  drawGauge(W * 0.075, gy, gr, 'KIAS', spd, '', spd / MAX_SPD, '#44aaff');
  // Altitude (right)
  drawGauge(W * 0.925, gy, gr, 'ALT', altFt >= 1000 ? (Math.round(altFt/100)/10)+'k' : altFt, 'FT', Math.min(altFt/25000,1), '#00ff88');
  // Artificial horizon (center-top)
  const ahR = mobile ? 54 : 72;
  const ahY = mobile ? ahR + 5 : H * 0.17;
  drawAH(W/2, ahY, ahR);
  // VSI (left-mid)
  drawVSI(W * 0.055, mobile ? H*0.62 : H*0.52, mobile ? 34 : 44, vspdFpm);
  // Throttle (right-mid)
  drawThrGauge(W * 0.945, mobile ? H*0.62 : H*0.52, mobile ? 34 : 44, thr);
  // Compass tape
  const comY = mobile ? H - 195 : H * 0.87;
  drawCompass(W/2, comY, W * 0.28, hdg);

  // Warnings
  const warnY = ahY + ahR + 30;
  if (stalled) drawBadge(W/2, warnY, '⚠ STALL', '#ff3333', 0.6 + Math.sin(Date.now()*0.008)*0.3);
  if (altM < 500 && S.vspd < -3)
    drawBadge(W/2, warnY + (stalled?32:0), '⚠ PULL UP', '#ff8800', 0.65 + Math.sin(Date.now()*0.010)*0.28);

  // Status (top-right area, below alt gauge)
  const sx = W - 8, sy0 = gy + gr + 12;
  hctx.save();
  hctx.textAlign = 'right';
  hctx.font = '10px monospace';
  hctx.fillStyle = S.gear  ? '#00ff88' : 'rgba(0,255,136,0.28)';
  hctx.fillText('GEAR ' + (S.gear ? '▼DN' : '▲UP'), sx, sy0);
  hctx.fillStyle = S.flaps > 0 ? '#00ff88' : 'rgba(0,255,136,0.28)';
  hctx.fillText('FLAPS ' + S.flaps + '°', sx, sy0+16);
  hctx.restore();

  // Crosshair
  drawXhair(W/2, H/2);
}

function drawGauge(cx, cy, r, label, val, unit, pct, color) {
  hctx.save();
  // BG
  hctx.beginPath(); hctx.arc(cx, cy, r, 0, Math.PI*2);
  hctx.fillStyle = 'rgba(0,6,2,0.78)'; hctx.fill();
  hctx.strokeStyle = 'rgba(0,255,136,0.38)'; hctx.lineWidth = 1.5; hctx.stroke();
  // Arc fill
  const sa = Math.PI * 0.75, ea = sa + pct * Math.PI * 1.5;
  hctx.beginPath(); hctx.arc(cx, cy, r-9, sa, ea);
  hctx.strokeStyle = color; hctx.lineWidth = 7; hctx.lineCap = 'round'; hctx.stroke();
  hctx.lineCap = 'butt';
  // Arc bg
  hctx.beginPath(); hctx.arc(cx, cy, r-9, sa, sa + Math.PI*1.5);
  hctx.strokeStyle = 'rgba(0,255,136,0.10)'; hctx.lineWidth = 7; hctx.stroke();
  // Ticks
  hctx.strokeStyle = 'rgba(0,255,136,0.4)';
  for (let i = 0; i <= 10; i++) {
    const a = (sa + i * Math.PI*1.5/10);
    const ri = (i%5===0) ? r-16 : r-12;
    hctx.lineWidth = (i%5===0) ? 1.5 : 0.8;
    hctx.beginPath();
    hctx.moveTo(cx+Math.cos(a)*ri, cy+Math.sin(a)*ri);
    hctx.lineTo(cx+Math.cos(a)*(r-3), cy+Math.sin(a)*(r-3));
    hctx.stroke();
  }
  // Needle
  const nA = sa + pct * Math.PI * 1.5;
  hctx.beginPath(); hctx.moveTo(cx,cy); hctx.lineTo(cx+Math.cos(nA)*(r-14),cy+Math.sin(nA)*(r-14));
  hctx.strokeStyle = '#ff5555'; hctx.lineWidth = 2.2; hctx.stroke();
  hctx.beginPath(); hctx.arc(cx,cy,4,0,Math.PI*2); hctx.fillStyle='#ff5555'; hctx.fill();
  // Text
  hctx.textAlign = 'center';
  hctx.font = `bold ${Math.round(r*0.34)}px 'Courier New',monospace`;
  hctx.fillStyle = '#00ff88'; hctx.fillText(val, cx, cy + r*0.28);
  hctx.font = `${Math.round(r*0.17)}px monospace`;
  hctx.fillStyle = 'rgba(0,255,136,0.55)';
  hctx.fillText(label, cx, cy - r*0.54);
  if (unit) hctx.fillText(unit, cx, cy + r*0.56);
  hctx.restore();
}

function drawAH(cx, cy, r) {
  hctx.save();
  hctx.beginPath(); hctx.arc(cx, cy, r, 0, Math.PI*2); hctx.clip();
  hctx.save();
  hctx.translate(cx, cy); hctx.rotate(S.roll);
  const po = S.pitch * r * 1.15;
  hctx.fillStyle = '#1d5e96'; hctx.fillRect(-r,-r+po, r*2, r*2);  // sky
  hctx.fillStyle = '#7a4628'; hctx.fillRect(-r, po, r*2, r*2);     // ground
  // Horizon
  hctx.strokeStyle = 'rgba(255,255,255,0.92)'; hctx.lineWidth = 2.2;
  hctx.beginPath(); hctx.moveTo(-r, po); hctx.lineTo(r, po); hctx.stroke();
  // Pitch ladder
  for (let i = -6; i <= 6; i++) {
    if (!i) continue;
    const y = po + i * r * 0.18;
    const lw = (Math.abs(i)%2===0) ? r*0.44 : r*0.26;
    hctx.strokeStyle = 'rgba(255,255,255,0.6)'; hctx.lineWidth = (Math.abs(i)%2===0) ? 1.5 : 0.9;
    hctx.beginPath(); hctx.moveTo(-lw, y); hctx.lineTo(lw, y); hctx.stroke();
    if (Math.abs(i)%2===0 && Math.abs(i)<=4) {
      hctx.fillStyle = 'rgba(255,255,255,0.65)';
      hctx.font = `${r*0.17}px monospace`; hctx.textAlign='right';
      hctx.fillText(Math.abs(i*10)+'°', -lw-3, y+4);
    }
  }
  hctx.restore();
  // Aircraft symbol (fixed, not rotating)
  hctx.strokeStyle = '#ffcc00'; hctx.lineWidth = 3;
  hctx.beginPath();
  hctx.moveTo(cx-r*0.60,cy); hctx.lineTo(cx-r*0.20,cy);
  hctx.moveTo(cx+r*0.20,cy); hctx.lineTo(cx+r*0.60,cy);
  hctx.moveTo(cx,cy); hctx.lineTo(cx,cy-r*0.18);
  hctx.stroke();
  hctx.beginPath(); hctx.arc(cx,cy,3,0,Math.PI*2);
  hctx.fillStyle='#ffcc00'; hctx.fill();
  hctx.restore();
  // Outer ring
  hctx.beginPath(); hctx.arc(cx,cy,r,0,Math.PI*2);
  hctx.strokeStyle='rgba(0,255,136,0.52)'; hctx.lineWidth=2.5; hctx.stroke();
  // Roll indicator
  hctx.save(); hctx.translate(cx,cy); hctx.rotate(S.roll);
  hctx.fillStyle='#00ff88';
  hctx.beginPath(); hctx.moveTo(0,-r-4); hctx.lineTo(-5,-r-14); hctx.lineTo(5,-r-14); hctx.closePath(); hctx.fill();
  hctx.restore();
}

function drawVSI(cx, cy, r, vspdFpm) {
  hctx.save();
  hctx.beginPath(); hctx.arc(cx,cy,r,0,Math.PI*2);
  hctx.fillStyle='rgba(0,6,2,0.72)'; hctx.fill();
  hctx.strokeStyle='rgba(0,255,136,0.35)'; hctx.lineWidth=1.5; hctx.stroke();
  const pct = Math.max(-1,Math.min(1, vspdFpm/2000));
  const nA = -Math.PI/2 + pct * Math.PI * 0.67;
  hctx.beginPath(); hctx.moveTo(cx,cy); hctx.lineTo(cx+Math.cos(nA)*(r-7),cy+Math.sin(nA)*(r-7));
  hctx.strokeStyle = pct>=0 ? '#00ff88' : '#ff6644'; hctx.lineWidth=2; hctx.stroke();
  hctx.textAlign='center';
  hctx.fillStyle='rgba(0,255,136,0.55)'; hctx.font=`${r*0.22}px monospace`;
  hctx.fillText('VSI', cx, cy-r*0.48);
  const sign = vspdFpm>=0?'+':'';
  hctx.fillStyle='#00ff88'; hctx.font=`bold ${r*0.30}px monospace`;
  hctx.fillText(sign+vspdFpm, cx, cy+r*0.42);
  hctx.restore();
}

function drawThrGauge(cx, cy, r, thr) {
  hctx.save();
  hctx.beginPath(); hctx.arc(cx,cy,r,0,Math.PI*2);
  hctx.fillStyle='rgba(0,6,2,0.72)'; hctx.fill();
  hctx.strokeStyle='rgba(0,255,136,0.35)'; hctx.lineWidth=1.5; hctx.stroke();
  const pct = thr/100;
  const sa = Math.PI*0.75, ea = sa + pct*Math.PI*1.5;
  hctx.beginPath(); hctx.arc(cx,cy,r-8,sa,sa+Math.PI*1.5);
  hctx.strokeStyle='rgba(0,255,136,0.10)'; hctx.lineWidth=7; hctx.stroke();
  hctx.beginPath(); hctx.arc(cx,cy,r-8,sa,ea);
  hctx.strokeStyle = thr>88?'#ff5544':thr>65?'#ffcc00':'#00ff88'; hctx.lineWidth=7; hctx.lineCap='round'; hctx.stroke();
  hctx.lineCap='butt';
  hctx.textAlign='center';
  hctx.fillStyle='rgba(0,255,136,0.55)'; hctx.font=`${r*0.22}px monospace`;
  hctx.fillText('THR', cx, cy-r*0.48);
  hctx.fillStyle=thr>88?'#ff5544':'#00ff88'; hctx.font=`bold ${r*0.30}px monospace`;
  hctx.fillText(thr+'%', cx, cy+r*0.42);
  hctx.restore();
}

const CDIR = ['N','NE','E','SE','S','SW','W','NW'];
function drawCompass(cx, cy, hw, hdg) {
  hctx.save();
  const h = 34;
  rRect(cx-hw, cy-h/2, hw*2, h, 6);
  hctx.fillStyle='rgba(0,6,2,0.78)'; hctx.fill();
  hctx.strokeStyle='rgba(0,255,136,0.38)'; hctx.lineWidth=1.5; hctx.stroke();

  // Clip to compass area
  hctx.beginPath(); rRect(cx-hw, cy-h/2, hw*2, h, 6); hctx.clip();

  const pxPerDeg = hw*2 / 90; // 90 degrees visible
  for (let i = -60; i <= 60; i++) {
    const deg = ((hdg + i) % 360 + 360) % 360;
    const x = cx + i * pxPerDeg;
    // Major ticks (every 45°)
    if (deg % 45 === 0) {
      hctx.strokeStyle='rgba(0,255,136,0.55)'; hctx.lineWidth=1.5;
      hctx.beginPath(); hctx.moveTo(x, cy-h/2+2); hctx.lineTo(x, cy-h/2+10); hctx.stroke();
      const di = Math.round(deg/45)%8;
      hctx.fillStyle = CDIR[di]==='N' ? '#ff6644' : 'rgba(0,255,136,0.85)';
      hctx.font = `bold ${CDIR[di].length===1?'13':'10'}px monospace`;
      hctx.textAlign='center'; hctx.fillText(CDIR[di], x, cy+10);
    } else if (deg % 10 === 0) {
      // Minor tick
      hctx.strokeStyle='rgba(0,255,136,0.3)'; hctx.lineWidth=0.8;
      hctx.beginPath(); hctx.moveTo(x, cy-h/2+2); hctx.lineTo(x, cy-h/2+7); hctx.stroke();
    }
  }
  hctx.restore();
  // Center marker
  hctx.fillStyle='#00ff88';
  hctx.beginPath(); hctx.moveTo(cx, cy-h/2-2); hctx.lineTo(cx-5, cy-h/2-11); hctx.lineTo(cx+5, cy-h/2-11); hctx.closePath(); hctx.fill();
  // Heading readout
  hctx.textAlign='center'; hctx.fillStyle='#00ff88';
  hctx.font=`bold 11px monospace`;
  hctx.fillText(Math.round(hdg).toString().padStart(3,'0')+'°', cx, cy+h/2+14);
}

function drawBadge(cx, cy, txt, col, alpha) {
  hctx.save();
  hctx.globalAlpha = alpha;
  rRect(cx-68, cy-14, 136, 28, 5);
  hctx.fillStyle = col; hctx.fill();
  hctx.globalAlpha = 1;
  hctx.textAlign='center'; hctx.fillStyle='#fff';
  hctx.font='bold 13px monospace'; hctx.fillText(txt, cx, cy+5);
  hctx.restore();
}

function drawXhair(cx, cy) {
  hctx.save();
  hctx.strokeStyle='rgba(0,255,136,0.48)'; hctx.lineWidth=1;
  const s=28;
  hctx.beginPath();
  hctx.moveTo(cx-s,cy); hctx.lineTo(cx-8,cy);
  hctx.moveTo(cx+8,cy); hctx.lineTo(cx+s,cy);
  hctx.moveTo(cx,cy-s); hctx.lineTo(cx,cy-8);
  hctx.moveTo(cx,cy+8); hctx.lineTo(cx,cy+s);
  hctx.stroke();
  hctx.beginPath(); hctx.arc(cx,cy,18,0,Math.PI*2);
  hctx.strokeStyle='rgba(0,255,136,0.22)'; hctx.stroke();
  hctx.restore();
}

function rRect(x, y, w, h, r) {
  hctx.beginPath();
  hctx.moveTo(x+r,y); hctx.lineTo(x+w-r,y);
  hctx.arcTo(x+w,y,x+w,y+r,r); hctx.lineTo(x+w,y+h-r);
  hctx.arcTo(x+w,y+h,x+w-r,y+h,r); hctx.lineTo(x+r,y+h);
  hctx.arcTo(x,y+h,x,y+h-r,r); hctx.lineTo(x,y+r);
  hctx.arcTo(x,y,x+r,y,r); hctx.closePath();
}

// ── AUDIO ─────────────────────────────────────────────────────
let audioCtx = null, engOsc = null, engGain = null;

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    engOsc  = audioCtx.createOscillator();
    engGain = audioCtx.createGain();
    const dist = audioCtx.createWaveShaper();
    // Distort wave for engine rumble
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = ((i/128)-1) * 3;
    dist.curve = curve;
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 80;
    engOsc.connect(dist);
    dist.connect(engGain);
    engGain.connect(audioCtx.destination);
    engGain.gain.value = 0.06;
    engOsc.start();
  } catch(e) { console.log('Audio unavailable'); }
}

function updateAudio() {
  if (!engOsc || !audioCtx) return;
  const freq = 55 + S.throttle * 1.5 + S.speed * 0.2;
  engOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.15);
  engGain.gain.setTargetAtTime(S.started ? 0.06 : 0, audioCtx.currentTime, 0.3);
}

// ── PUBLIC API ────────────────────────────────────────────────
window.startFlight = function () {
  initAudio();
  S.started   = true;
  S.pos.set(0, 950, -300);
  S.speed     = 155;
  S.throttle  = 55;
  S.gear      = false;
  S.pitch     = 0.04;
  S.roll      = 0;
  S.yaw       = 0;
  S.crashed   = false;
  camInit     = false;
  setThrUI(0.55);
  document.getElementById('start').style.display = 'none';
  if ('ontouchstart' in window)
    document.getElementById('mob').style.display = 'flex';
};

window.resetFlight = function () {
  S.pos.set(0, 950, -300);
  S.speed=155; S.throttle=55; S.pitch=0.04;
  S.roll=0; S.yaw=0; S.flaps=0; S.gear=false;
  S.vspd=0; S.crashed=false; camInit=false;
  setThrUI(0.55);
  document.getElementById('crash').style.display = 'none';
};

// ── MAIN LOOP ─────────────────────────────────────────────────
function animate(ts) {
  requestAnimationFrame(animate);
  const dt = Math.min((ts - lastT) / 1000, 0.05);
  lastT = ts;

  physicsUpdate(dt);
  updatePose();
  updateCamera();
  updateSky();
  updateAudio();

  renderer.render(scene, camera);
  drawHUD();
}

requestAnimationFrame(ts => { lastT = ts; requestAnimationFrame(animate); });

})(); // end IIFE
