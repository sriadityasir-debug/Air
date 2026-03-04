/* ================================================================
   SkyPilot Pro — game.js
   Three.js r128 | Full cockpit + multi-plane + airports + landing
   ================================================================ */
'use strict';
(function () {

/* ── RENDERER / SCENE ─────────────────────────────────────── */
const threeCvs = document.getElementById('three-cvs');
const hudCvs   = document.getElementById('hud-cvs');
const hctx     = hudCvs.getContext('2d');

const renderer = new THREE.WebGLRenderer({
  canvas: threeCvs, antialias: true,
  powerPreference:'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, window.innerWidth/window.innerHeight, 1, 100000);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  hudCvs.width = w; hudCvs.height = h;
}
window.addEventListener('resize', resize);

/* ── LIGHTING ─────────────────────────────────────────────── */
const sunDir = new THREE.DirectionalLight(0xfff6d8, 1.8);
sunDir.position.set(5000, 10000, 3000);
scene.add(sunDir);
scene.add(new THREE.AmbientLight(0x5070a8, 1.0));
const fillLight = new THREE.HemisphereLight(0x87ceeb, 0x4a7a2a, 0.6);
scene.add(fillLight);

/* ── SKY DOME ─────────────────────────────────────────────── */
const skyShader = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: {
    uTop: { value: new THREE.Color(0x061440) },
    uMid: { value: new THREE.Color(0x1a7abf) },
    uHor: { value: new THREE.Color(0x8ec8e8) }
  },
  vertexShader:`varying vec3 vW; void main(){vW=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 uTop,uMid,uHor; varying vec3 vW;
    void main(){
      float y=vW.y;
      vec3 c=y>0.15?mix(uMid,uTop,clamp((y-0.15)/0.85,0.,1.)):mix(uHor,uMid,clamp(y/0.15,0.,1.));
      gl_FragColor=vec4(c,1.);
    }`
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(90000,32,16), skyShader);
scene.add(skyDome);

// Sun
const sunMesh = new THREE.Mesh(
  new THREE.CircleGeometry(1100,32),
  new THREE.MeshBasicMaterial({color:0xfffbe6, depthWrite:false})
);
sunMesh.position.set(40000, 45000, -30000);
sunMesh.lookAt(0,0,0);
scene.add(sunMesh);
const sunHalo = new THREE.Mesh(
  new THREE.CircleGeometry(3200,32),
  new THREE.MeshBasicMaterial({color:0xffe588, transparent:true, opacity:0.14, depthWrite:false})
);
sunHalo.position.copy(sunMesh.position); sunHalo.lookAt(0,0,0);
scene.add(sunHalo);

/* ── FOG ─────────────────────────────────────────────────── */
scene.fog = new THREE.FogExp2(0x9dc8e8, 0.000048);

/* ── TERRAIN NOISE ───────────────────────────────────────── */
function hsh(x,y){const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n);}
function smooth(x,y){
  const ix=Math.floor(x),iy=Math.floor(y), fx=x-ix,fy=y-iy;
  const ux=fx*fx*(3-2*fx), uy=fy*fy*(3-2*fy);
  return hsh(ix,iy)*(1-ux)*(1-uy)+hsh(ix+1,iy)*ux*(1-uy)+
         hsh(ix,iy+1)*(1-ux)*uy+hsh(ix+1,iy+1)*ux*uy;
}
function fbm(x,y){
  return smooth(x,y)*0.50+smooth(x*2.1,y*2.1)*0.25+
         smooth(x*4.4,y*4.4)*0.125+smooth(x*8.9,y*8.9)*0.0625;
}

const TS=0.00036, TH=1900;

// Airport centers (we flatten terrain around these)
const AIRPORTS = [
  {x:0,    z:0,    elev:2,   heading:0,         name:'SKYPILOT INTL'},
  {x:5800, z:3200, elev:280, heading:Math.PI*0.22, name:'HIGHLAND'},
  {x:-4500,z:-3800,elev:8,   heading:Math.PI*0.5,  name:'WEST HARBOR'},
  {x:2500, z:-5500,elev:30,  heading:-Math.PI*0.12, name:'SOUTHPORT'}
];

function getH(x,z){
  const raw = fbm((x+999)*TS,(z+999)*TS)*TH - 80;
  // Flatten around airports
  for(const ap of AIRPORTS){
    const dx=x-ap.x, dz=z-ap.z, d=Math.sqrt(dx*dx+dz*dz);
    if(d<1400){
      const bl=d<900 ? 0 : (d-900)/500;
      return ap.elev*(1-bl)+raw*bl;
    }
  }
  return raw;
}

function hColor(h){
  if(h<-15) return [0.22,0.42,0.78];
  if(h<0)   return [0.72,0.68,0.50];
  if(h<280) return [0.22,0.60,0.24];
  if(h<680) return [0.30,0.48,0.22];
  if(h<1100)return [0.48,0.44,0.34];
  if(h<1500)return [0.60,0.58,0.55];
  return           [0.92,0.92,0.96];
}

/* ── TERRAIN MESH ────────────────────────────────────────── */
const T_SIZE=22000, T_SEGS=160;
const terrainGeo = new THREE.PlaneGeometry(T_SIZE,T_SIZE,T_SEGS,T_SEGS);
terrainGeo.rotateX(-Math.PI/2);
(function(){
  const pos=terrainGeo.attributes.position;
  const col=new Float32Array(pos.count*3);
  for(let i=0;i<pos.count;i++){
    const h=getH(pos.getX(i),pos.getZ(i));
    pos.setY(i,h);
    const c=hColor(h);
    col[i*3]=c[0]; col[i*3+1]=c[1]; col[i*3+2]=c[2];
  }
  terrainGeo.setAttribute('color',new THREE.BufferAttribute(col,3));
  terrainGeo.computeVertexNormals();
})();
const terrainMesh = new THREE.Mesh(
  terrainGeo,
  new THREE.MeshLambertMaterial({vertexColors:true})
);
scene.add(terrainMesh);

/* ── WATER PLANE ─────────────────────────────────────────── */
const waterMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(T_SIZE,T_SIZE),
  new THREE.MeshLambertMaterial({color:0x1a5e9e,transparent:true,opacity:0.85})
);
waterMesh.rotation.x=-Math.PI/2; waterMesh.position.y=-12;
scene.add(waterMesh);

/* ── AIRPORT BUILDER ─────────────────────────────────────── */
function buildAirport(ap){
  const g=new THREE.Group();
  const Y=ap.elev+0.3, cos=Math.cos(ap.heading), sin=Math.sin(ap.heading);
  const M=(geo,mat)=>new THREE.Mesh(geo,mat);

  const matAsp=new THREE.MeshLambertMaterial({color:0x3a3a3e});
  const matLine=new THREE.MeshBasicMaterial({color:0xffffff});
  const matYel=new THREE.MeshBasicMaterial({color:0xffee00});
  const matGlass=new THREE.MeshLambertMaterial({color:0x88bbdd,transparent:true,opacity:0.55});
  const matConc=new THREE.MeshLambertMaterial({color:0x888890});
  const matBldg=new THREE.MeshLambertMaterial({color:0x9a9a8a});
  const matRoof=new THREE.MeshLambertMaterial({color:0x5a5a52});
  const matTower=new THREE.MeshLambertMaterial({color:0xb8b8a0});
  const matEmit=new THREE.MeshBasicMaterial({color:0xffffff});
  const matRed=new THREE.MeshBasicMaterial({color:0xff4422});
  const matGrn=new THREE.MeshBasicMaterial({color:0x22ff66});

  function rPos(lx,lz,h){
    return new THREE.Vector3(
      ap.x+lx*cos-lz*sin,
      Y+h,
      ap.z+lx*sin+lz*cos
    );
  }
  function addMesh(mesh, lx,lz,ry=0,h=0){
    mesh.position.copy(rPos(lx,lz,h));
    mesh.rotation.y=ap.heading+ry;
    g.add(mesh);
  }

  // Main runway
  const rwyMain=M(new THREE.PlaneGeometry(65,2400),matAsp);
  rwyMain.rotation.x=-Math.PI/2;
  addMesh(rwyMain,0,0);

  // Taxiways
  [-45,45].forEach(tx=>{
    const tw=M(new THREE.PlaneGeometry(22,2200),matAsp);
    tw.rotation.x=-Math.PI/2; addMesh(tw,tx,0);
  });
  // Cross taxiway
  const ct=M(new THREE.PlaneGeometry(140,22),matAsp);
  ct.rotation.x=-Math.PI/2; addMesh(ct,0,-800);
  const ct2=M(new THREE.PlaneGeometry(140,22),matAsp);
  ct2.rotation.x=-Math.PI/2; addMesh(ct2,0,800);

  // Apron
  const apron=M(new THREE.PlaneGeometry(420,350),matAsp);
  apron.rotation.x=-Math.PI/2; addMesh(apron,170,600);

  // Runway centerline dashes
  for(let z=-1100;z<=1100;z+=95){
    const d=M(new THREE.PlaneGeometry(2.5,38),matLine);
    d.rotation.x=-Math.PI/2; addMesh(d,0,z,0,0.1);
  }
  // Yellow centerline (taxiway)
  for(let z=-1000;z<=1000;z+=20){
    const d=M(new THREE.PlaneGeometry(0.8,12),matYel);
    d.rotation.x=-Math.PI/2; addMesh(d,-45,z,0,0.1);
    const d2=d.clone(); addMesh(d2,45,z,0,0.1);
  }

  // Threshold markings
  for(let i=0;i<4;i++){
    const ox=(i-1.5)*12;
    [[-1150],[[1150]]].forEach(([lz])=>{
      const tm=M(new THREE.PlaneGeometry(8,28),matLine);
      tm.rotation.x=-Math.PI/2; addMesh(tm,ox,lz,0,0.1);
    });
  }
  // Runway numbers
  const numGeo=new THREE.PlaneGeometry(14,20);
  const n1=M(numGeo,matLine); n1.rotation.x=-Math.PI/2; addMesh(n1,0,-1180,0,0.1);
  const n2=M(numGeo,matLine); n2.rotation.x=-Math.PI/2; n2.rotation.z=Math.PI; addMesh(n2,0,1180,0,0.1);

  // Runway edge lights
  for(let z=-1150;z<=1150;z+=80){
    [-35,35].forEach(lx=>{
      const lt=M(new THREE.SphereGeometry(1.4,5,4),matEmit);
      addMesh(lt,lx,z,0,2);
    });
  }
  // Approach lights
  for(let i=1;i<=5;i++){
    [-5,5].forEach(lx=>{
      const al=M(new THREE.SphereGeometry(1.2,5,4),i<=2?matRed:matEmit);
      addMesh(al,lx,-1150-i*40,0,2);
      const al2=al.clone();
      addMesh(al2,lx,1150+i*40,0,2);
    });
  }
  // PAPI lights (red/white approach slope)
  [-40,-42,-44,-46].forEach((lz,i)=>{
    const pa=M(new THREE.BoxGeometry(3,1.5,1.5),i<2?matRed:matGrn);
    addMesh(pa,42,lz,0,1.5);
  });

  // Control tower
  const twrBase=M(new THREE.BoxGeometry(18,65,18),matTower);
  addMesh(twrBase,-160,-700,0,32.5);
  const twrCab=M(new THREE.CylinderGeometry(14,14,12,8),matGlass);
  addMesh(twrCab,-160,-700,0,65+6);
  const twrRoof=M(new THREE.CylinderGeometry(15,14,3,8),matRoof);
  addMesh(twrRoof,-160,-700,0,65+12+1.5);
  // Tower antenna
  const ant=M(new THREE.CylinderGeometry(0.5,0.5,22,4),matConc);
  addMesh(ant,-160,-700,0,65+12+3+11);

  // Terminal building (large)
  const term=M(new THREE.BoxGeometry(260,28,80),matBldg);
  addMesh(term,170,700,0,14);
  const termRoof=M(new THREE.BoxGeometry(264,3,84),matRoof);
  addMesh(termRoof,170,700,0,29.5);
  // Terminal windows (rows of glass strips)
  for(let wx=-110;wx<=110;wx+=18){
    const win=M(new THREE.BoxGeometry(10,10,1.5),matGlass);
    win.position.copy(rPos(170+wx,700-41,12)); win.rotation.y=ap.heading; g.add(win);
    const win2=win.clone();
    win2.position.copy(rPos(170+wx,700+41,12)); win2.rotation.y=ap.heading; g.add(win2);
  }
  // Jetways (arm tubes)
  [60,100,140,180,220].forEach(ox=>{
    const jw=M(new THREE.BoxGeometry(6,5,48),matConc);
    addMesh(jw,ox,700-65,0,10);
  });

  // Hangars
  [[-160,400],[-160,550],[-160,250]].forEach(([hx,hz],i)=>{
    const hw=i===0?120:90, hd=i===0?100:80;
    const hn=M(new THREE.BoxGeometry(hw,35,hd),matBldg);
    addMesh(hn,hx,hz,0,17.5);
    // Arched roof (simulate with scaled cylinder)
    const hroof=M(new THREE.CylinderGeometry(hw/2,hw/2,hd,16,1,true,0,Math.PI),matRoof);
    hroof.rotation.z=Math.PI/2; hroof.rotation.x=Math.PI/2;
    addMesh(hroof,hx,hz,0,35);
    // Hangar doors
    const hd1=M(new THREE.BoxGeometry(hw*0.45,32,1),matConc);
    addMesh(hd1,hx-hw*0.22,hz+hd/2,0,16);
    const hd2=M(new THREE.BoxGeometry(hw*0.45,32,1),matConc);
    addMesh(hd2,hx+hw*0.22,hz+hd/2,0,16);
  });

  // Fuel depot
  const tank1=M(new THREE.CylinderGeometry(10,10,20,12),new THREE.MeshLambertMaterial({color:0xcc4411}));
  addMesh(tank1,250,400,0,10);
  const tank2=M(new THREE.CylinderGeometry(10,10,20,12),new THREE.MeshLambertMaterial({color:0xcc4411}));
  addMesh(tank2,275,400,0,10);

  // Perimeter fence (just posts)
  for(let z=-1300;z<=1300;z+=60){
    const fp=M(new THREE.BoxGeometry(1,8,1),matConc);
    addMesh(fp,-300,z,0,4);
  }

  // Airport name sign
  const sign=M(new THREE.BoxGeometry(80,12,2),new THREE.MeshLambertMaterial({color:0x001144}));
  addMesh(sign,-160,-1350,0,8);

  // Windsock
  const ws=M(new THREE.CylinderGeometry(0.5,0.5,14,6),matConc);
  addMesh(ws,-180,-1300,0,7);
  const wsock=M(new THREE.CylinderGeometry(3,1,12,8,1,true),new THREE.MeshLambertMaterial({color:0xff6600}));
  wsock.rotation.z=Math.PI/2; addMesh(wsock,-180,-1300,0,16);

  // Parked planes (simple silhouettes)
  [[120,620],[155,640],[190,620]].forEach(([px,pz])=>{
    const pf=M(new THREE.CylinderGeometry(2,2,24,8),new THREE.MeshLambertMaterial({color:0xe8e8f0}));
    pf.rotation.z=Math.PI/2; addMesh(pf,px,pz,0,3);
    const pw=M(new THREE.BoxGeometry(32,1,8),new THREE.MeshLambertMaterial({color:0xe8e8f0}));
    addMesh(pw,px,pz,0,3);
  });

  scene.add(g);
  return g;
}

AIRPORTS.forEach(buildAirport);

/* ── CLOUDS ──────────────────────────────────────────────── */
const cloudMat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.80,depthWrite:false});
for(let i=0;i<65;i++){
  const cg=new THREE.Group();
  cg.position.set((Math.random()-.5)*18000,2500+Math.random()*5000,(Math.random()-.5)*18000);
  const n=4+Math.floor(Math.random()*5);
  for(let j=0;j<n;j++){
    const r=200+Math.random()*550;
    const s=new THREE.Mesh(new THREE.SphereGeometry(r,7,5),cloudMat);
    s.position.set((Math.random()-.5)*r*3,(Math.random()-.5)*r*0.35,(Math.random()-.5)*r*3);
    s.scale.y=0.36; cg.add(s);
  }
  scene.add(cg);
}

/* ── TREES ───────────────────────────────────────────────── */
const tConeMat=new THREE.MeshLambertMaterial({color:0x1b5520});
const tTrunkMat=new THREE.MeshLambertMaterial({color:0x5a3518});
const tCone=new THREE.ConeGeometry(22,72,5);
const tTrunk=new THREE.CylinderGeometry(5,7,26,5);
for(let i=0;i<800;i++){
  const tx=(Math.random()-.5)*17000, tz=(Math.random()-.5)*17000;
  // Avoid airports
  let tooClose=false;
  for(const ap of AIRPORTS){const d=Math.sqrt((tx-ap.x)**2+(tz-ap.z)**2);if(d<1600){tooClose=true;break;}}
  if(tooClose) continue;
  const th=getH(tx,tz);
  if(th<5||th>950) continue;
  const tree=new THREE.Mesh(tCone,tConeMat);
  tree.position.set(tx,th+40,tz); tree.rotation.y=Math.random()*Math.PI*2;
  scene.add(tree);
}

/* ── CITY BUILDINGS ──────────────────────────────────────── */
// Small town clusters at specific locations
const towns=[{x:1200,z:1800},{x:-2000,z:1000},{x:3000,z:-1500}];
const bMats=[
  new THREE.MeshLambertMaterial({color:0x8a8a7a}),
  new THREE.MeshLambertMaterial({color:0x9a9286}),
  new THREE.MeshLambertMaterial({color:0x7a8290})
];
for(const town of towns){
  for(let i=0;i<30;i++){
    const bx=town.x+(Math.random()-.5)*500;
    const bz=town.z+(Math.random()-.5)*500;
    const bh=getH(bx,bz);
    if(bh<0||bh>600) continue;
    const w=20+Math.random()*60, d=20+Math.random()*50, h=15+Math.random()*90;
    const bld=new THREE.Mesh(
      new THREE.BoxGeometry(w,h,d),
      bMats[Math.floor(Math.random()*bMats.length)]
    );
    bld.position.set(bx,bh+h/2,bz);
    scene.add(bld);
  }
}

/* ── MOUNTAINS (extra peaks) ─────────────────────────────── */
const peakMat=new THREE.MeshLambertMaterial({color:0x888898});
const snowMat=new THREE.MeshLambertMaterial({color:0xeeeef4});
const peaks=[{x:-3000,z:4500},{x:4000,z:-2000},{x:-1500,z:-4000}];
peaks.forEach(pk=>{
  const bh=getH(pk.x,pk.z);
  const mountain=new THREE.Mesh(new THREE.ConeGeometry(600,900,8),peakMat);
  mountain.position.set(pk.x,bh+450,pk.z);
  scene.add(mountain);
  const snow=new THREE.Mesh(new THREE.ConeGeometry(250,380,8),snowMat);
  snow.position.set(pk.x,bh+900+190,pk.z);
  scene.add(snow);
});

/* ── ROADS ───────────────────────────────────────────────── */
const roadMat=new THREE.MeshLambertMaterial({color:0x606070});
// Main road from airport to town
function buildRoad(points){
  for(let i=0;i<points.length-1;i++){
    const a=points[i], b=points[i+1];
    const dx=b.x-a.x, dz=b.z-a.z;
    const len=Math.sqrt(dx*dx+dz*dz);
    const ang=Math.atan2(dx,dz);
    const mx=(a.x+b.x)/2, mz=(a.z+b.z)/2;
    const my=getH(mx,mz)+0.4;
    const seg=new THREE.Mesh(new THREE.PlaneGeometry(9,len),roadMat);
    seg.rotation.x=-Math.PI/2; seg.rotation.z=-ang;
    seg.position.set(mx,my,mz);
    scene.add(seg);
  }
}
buildRoad([{x:65,z:1200},{x:200,z:2000},{x:600,z:2400},{x:1200,z:1800}]);
buildRoad([{x:65,z:-1200},{x:300,z:-2200},{x:-500,z:-2800},{x:-1000,z:-2200},{x:-1200,z:-1200}]);

/* ================================================================
   PLANE DEFINITIONS
   ================================================================ */
const PLANE_DEFS = {
  b737: {
    name:'Boeing 737', stallSpeed:62, maxSpeed:340, landSpeed:148,
    thrustK:0.046, pitchRate:1.25, rollRate:1.45, yawRate:0.65,
    dragK:0.00128, baseDrag:0.58,
    camOff:new THREE.Vector3(0,4.5,21),   // cockpit eye offset
    camLookOff:new THREE.Vector3(0,1.5,80)
  },
  f16: {
    name:'F-16 Falcon', stallSpeed:85, maxSpeed:650, landSpeed:182,
    thrustK:0.115, pitchRate:2.4, rollRate:3.2, yawRate:1.1,
    dragK:0.00095, baseDrag:0.42,
    camOff:new THREE.Vector3(0,4.8,14),
    camLookOff:new THREE.Vector3(0,2,80)
  },
  c172: {
    name:'Cessna 172', stallSpeed:38, maxSpeed:130, landSpeed:68,
    thrustK:0.012, pitchRate:0.85, rollRate:0.95, yawRate:0.55,
    dragK:0.00140, baseDrag:0.70,
    camOff:new THREE.Vector3(0,2.0,4.5),
    camLookOff:new THREE.Vector3(0,1,80)
  }
};

/* ================================================================
   PLANE MODELS
   ================================================================ */
function M(geo,mat){return new THREE.Mesh(geo,mat);}
const MATS={
  wh: new THREE.MeshPhongMaterial({color:0xeef3fb,shininess:140}),
  gy: new THREE.MeshPhongMaterial({color:0x6a7280,shininess:60}),
  dk: new THREE.MeshPhongMaterial({color:0x0d0e14,shininess:30}),
  nv: new THREE.MeshPhongMaterial({color:0x182a70,shininess:80}),
  rd: new THREE.MeshPhongMaterial({color:0xbb2222}),
  yw: new THREE.MeshPhongMaterial({color:0xe8c015}),
  gr: new THREE.MeshPhongMaterial({color:0x446633}),
  ex: new THREE.MeshBasicMaterial({color:0xff8800})
};

function buildB737(){
  const a=new THREE.Group();
  // Fuselage
  const fg=new THREE.CylinderGeometry(2.8,2.2,46,12); fg.rotateX(Math.PI/2);
  a.add(M(fg,MATS.wh));
  // Nose
  const ng=new THREE.ConeGeometry(2.2,11,10); ng.rotateX(Math.PI/2);
  const nose=M(ng,MATS.wh); nose.position.z=27; a.add(nose);
  // Tail cone
  const tc=new THREE.ConeGeometry(2.2,8,10); tc.rotateX(-Math.PI/2);
  const tail=M(tc,MATS.wh); tail.position.z=-27; a.add(tail);
  // Cockpit glass
  const cg=new THREE.SphereGeometry(2.55,10,6,0,Math.PI*2,0,Math.PI*0.55);
  const cock=M(cg,MATS.dk); cock.position.set(0,0.8,22); a.add(cock);
  // Cabin windows row
  for(let z=-14;z<=14;z+=3.2){
    const wg=new THREE.SphereGeometry(0.55,5,5);
    const w1=M(wg,MATS.dk); w1.position.set(2.85,0.9,z); a.add(w1);
    const w2=M(wg,MATS.dk); w2.position.set(-2.85,0.9,z); a.add(w2);
  }
  // Wings
  const wg=new THREE.BoxGeometry(58,0.7,13);
  const wing=M(wg,MATS.wh); wing.position.set(0,-0.9,2); a.add(wing);
  // Leading edge taper
  const le1=M(new THREE.BoxGeometry(29,0.55,4),MATS.wh); le1.position.set(-15.5,-0.85,8); le1.rotation.y=-0.14; a.add(le1);
  const le2=M(new THREE.BoxGeometry(29,0.55,4),MATS.wh); le2.position.set(15.5,-0.85,8); le2.rotation.y=0.14; a.add(le2);
  // Winglets
  [-29,29].forEach((x,i)=>{
    const wl=M(new THREE.BoxGeometry(1.2,6,4.5),MATS.nv);
    wl.position.set(x,1.8,1); wl.rotation.z=(i===0?1:-1)*0.35; a.add(wl);
  });
  // Engines (nacelles)
  [-14,14].forEach(ex=>{
    const en=new THREE.CylinderGeometry(2.0,1.8,11,10); en.rotateX(Math.PI/2);
    const eng=M(en,MATS.gy); eng.position.set(ex,-3.2,4); a.add(eng);
    const ir=new THREE.TorusGeometry(2.0,0.5,8,16); ir.rotateX(Math.PI/2);
    a.add(Object.assign(M(ir,MATS.dk),{position:new THREE.Vector3(ex,-3.2,10)}));
    const nr=new THREE.TorusGeometry(1.8,0.35,8,16); nr.rotateX(Math.PI/2);
    a.add(Object.assign(M(nr,MATS.gy),{position:new THREE.Vector3(ex,-3.2,-1)}));
    const py=M(new THREE.BoxGeometry(1.5,2.5,3.5),MATS.wh); py.position.set(ex,-1.9,4); a.add(py);
  });
  // Navy livery stripe
  const sg=new THREE.CylinderGeometry(2.85,2.85,18,12,1,true); sg.rotateX(Math.PI/2);
  a.add(M(sg,MATS.nv));
  // H-stab
  const hs=M(new THREE.BoxGeometry(22,0.6,5.5),MATS.wh); hs.position.set(0,0.3,-21); a.add(hs);
  // V-stab
  const vs=M(new THREE.BoxGeometry(1.2,13,8),MATS.nv); vs.position.set(0,6.5,-19); a.add(vs);
  // Landing gear
  const lg=_buildGear([{x:0,z:17,y:-5,strut:5.5,wR:1.2},{x:-7.5,z:2,y:-5.5,strut:4,wR:1.3},{x:7.5,z:2,y:-5.5,strut:4,wR:1.3}]);
  a.add(lg); a.userData.lg=lg;
  return a;
}

function buildF16(){
  const a=new THREE.Group();
  // Fuselage – slim
  const fg=new THREE.CylinderGeometry(1.8,1.4,38,10); fg.rotateX(Math.PI/2);
  a.add(M(fg,MATS.gr));
  /