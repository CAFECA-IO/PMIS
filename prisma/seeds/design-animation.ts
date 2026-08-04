/**
 * 展示用 3D 施工動畫產生器。
 *
 * 正式流程中，動畫 HTML 是由費思逐案撰寫的；但示範資料需要「不呼叫模型也能
 * 重現」，因此這裡用一個**資料驅動**的樣板：所有專案共用同一支渲染器，
 * 差異只在傳入的工項種類（kind）與時程。這樣既能一次產出五案的動畫，
 * 日後改進畫面也只需改一處。
 *
 * 輸出為單一自成一體的 HTML，可直接以 iframe（sandbox="allow-scripts"）嵌入：
 * 只從 cdnjs 載入 Three.js r128，不使用任何儲存或對外請求 API。
 */

/** 工項在 3D 場景中的表現方式。 */
export type DemoKind =
  | "dwall" // 連續壁：深而薄的板，逐幅施作
  | "excavate" // 開挖及支撐：基坑向下挖並架設支撐
  | "bore" // 潛盾／隧道推進：管狀襯砌沿軸線延伸，前端有機頭
  | "segment" // 環片組裝／背填：沿隧道內環出現環片
  | "box" // 車站主體／地下結構：箱型結構分層澆置
  | "wall" // 護岸／擋土牆：沿兩岸逐段升起
  | "dredge" // 疏濬／土方開挖：河床淤泥逐段移除
  | "demolish" // 拆除：既有結構逐段消失
  | "pile" // 基樁：圓柱由地面向下成形
  | "pier" // 橋墩柱身及帽梁：柱體升起後加帽梁
  | "girder" // 預力梁架設：梁逐跨吊裝就位
  | "deck" // 橋面版／路面：沿線鋪設
  | "floor" // 地上結構：樓層逐層堆疊
  | "fitout" // 裝修及設備：樓層內部填充
  | "mep" // 機電預埋：管線沿結構敷設
  | "temp" // 假設工程：圍籬與交通維持設施
  | "service" // 監造服務：查驗點沿時間軸亮起（無實體構造物）
  | "generic";

export type DemoItem = {
  name: string;
  kind: DemoKind;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  /** 顯示用數量，如「1,800 m」。 */
  qty?: string;
};

export type DemoMilestone = {
  title: string;
  /** YYYY-MM-DD */
  date: string;
};

/** 停工或限制區間，於時間軸上標示底色。 */
export type DemoPause = {
  label: string;
  /** 每年重複的月份區間（含），如汛期 5–11 月。 */
  fromMonth: number;
  toMonth: number;
};

export type DemoSpec = {
  code: string;
  name: string;
  location: string;
  contractor: string;
  /** YYYY-MM-DD */
  start: string;
  end: string;
  /** 場景基底：水路（含水面）或陸地。 */
  terrain: "water" | "ground";
  items: DemoItem[];
  milestones: DemoMilestone[];
  pause?: DemoPause;
};

/** 供費思修訂時參考、也寫入 DesignVersion.design 的結構化設計。 */
export function designPayload(spec: DemoSpec) {
  return {
    reply: `示範版本：依「${spec.name}」的分項與時程建立的施工流程動畫（資料驅動樣板）。`,
    workItems: spec.items.map((i) => ({
      name: i.name,
      kind: mapToPlanKind(i.kind),
      quantity: i.qty,
      start: i.start,
      end: i.end,
    })),
    milestones: spec.milestones.map((m) => ({ title: m.title, dueDate: m.date })),
  };
}

/** 展示用的細分 kind → 費思設計所使用的四類，讓兩邊資料相容。 */
function mapToPlanKind(k: DemoKind): "wall" | "dredge" | "pipe" | "generic" {
  if (k === "wall" || k === "dwall" || k === "pier" || k === "box" || k === "floor") return "wall";
  if (k === "dredge" || k === "excavate" || k === "demolish" || k === "pile") return "dredge";
  if (k === "bore" || k === "segment" || k === "mep") return "pipe";
  return "generic";
}

/** 產生單一自成一體的動畫 HTML。 */
export function buildAnimationHtml(spec: DemoSpec): string {
  // 資料以 JSON 內嵌，避免在樣板字串裡拼接大量程式碼
  const data = JSON.stringify(
    {
      code: spec.code,
      name: spec.name,
      location: spec.location,
      contractor: spec.contractor,
      start: spec.start,
      end: spec.end,
      terrain: spec.terrain,
      items: spec.items,
      milestones: spec.milestones,
      pause: spec.pause ?? null,
    },
    null,
    1,
  );

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(spec.name)} — 3D 施工動畫</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;overflow:hidden;background:#0b1220;
    font-family:"PingFang TC","Microsoft JhengHei",system-ui,sans-serif;color:#e7eefb}
  #app{position:fixed;inset:0}
  canvas{display:block}
  .card{position:absolute;background:rgba(10,17,32,.62);border:1px solid rgba(140,175,235,.28);
    border-radius:10px;backdrop-filter:blur(8px)}
  #head{top:12px;left:12px;padding:10px 13px;max-width:min(46%,300px)}
  #head .code{font-size:11px;font-weight:600;color:#7fd7ff;letter-spacing:.4px}
  #head .name{margin-top:2px;font-size:14px;font-weight:700;line-height:1.35}
  #head .meta{margin-top:3px;font-size:11px;color:#9db2d4}
  #phase{top:12px;right:12px;padding:10px 13px;text-align:right;max-width:min(46%,280px)}
  #phase .date{font-size:11px;font-weight:600;color:#7fd7ff;letter-spacing:.5px}
  #phase .name{margin-top:2px;font-size:13px;font-weight:700}
  #phase .desc{margin-top:3px;font-size:11px;color:#9db2d4;line-height:1.4}
  #legend{left:12px;bottom:104px;padding:8px 11px;font-size:11px;max-width:min(46%,260px)}
  #legend .row{display:flex;align-items:center;gap:7px;padding:2px 0}
  #legend .sw{width:11px;height:11px;border-radius:3px;flex:none}
  #legend .row.off{opacity:.42}
  #bar{position:absolute;left:0;right:0;bottom:0;padding:20px 18px 14px;
    background:linear-gradient(0deg,rgba(6,11,22,.94) 35%,rgba(6,11,22,0))}
  #ctl{display:flex;align-items:center;gap:12px}
  #play{width:40px;height:40px;flex:none;border:0;border-radius:50%;cursor:pointer;color:#fff;
    background:linear-gradient(135deg,#3b82f6,#2563eb);box-shadow:0 3px 12px rgba(37,99,235,.5);
    font-size:15px;display:flex;align-items:center;justify-content:center;transition:transform .1s}
  #play:hover{transform:scale(1.07)}
  #tl{flex:1;min-width:0}
  #track{position:relative;height:7px;border-radius:5px;background:rgba(130,160,210,.22);
    cursor:pointer;margin:16px 0 7px}
  #pause{position:absolute;top:0;bottom:0;background:rgba(245,158,11,.3);
    border-left:1px solid rgba(245,158,11,.6);border-right:1px solid rgba(245,158,11,.6)}
  #fill{position:absolute;left:0;top:0;bottom:0;border-radius:5px;
    background:linear-gradient(90deg,#22d3ee,#3b82f6);width:0}
  #knob{position:absolute;top:50%;left:0;width:15px;height:15px;border-radius:50%;background:#fff;
    border:3px solid #3b82f6;transform:translate(-50%,-50%);box-shadow:0 1px 6px rgba(0,0,0,.5)}
  .ms{position:absolute;top:50%;width:9px;height:9px;border-radius:50%;background:#22d3ee;
    border:1.5px solid #06131f;transform:translate(-50%,-50%);cursor:pointer;transition:transform .12s}
  .ms:hover{transform:translate(-50%,-50%) scale(1.6)}
  .ms.off{background:#5c7796}
  #ends{display:flex;justify-content:space-between;font-size:10px;color:#7f95bb}
  #speed{display:flex;gap:5px;flex:none}
  #speed button{background:rgba(130,160,210,.14);border:1px solid rgba(130,160,210,.28);
    color:#cfe0ff;border-radius:5px;padding:3px 7px;cursor:pointer;font-size:10.5px}
  #speed button.on{background:#2563eb;border-color:#2563eb;color:#fff}
  #hint{position:absolute;right:14px;bottom:96px;font-size:10.5px;color:#5f759c}
  @media(max-width:640px){#legend{display:none}#head,#phase{max-width:44%}}
</style>
</head>
<body>
<div id="app"></div>
<div id="head" class="card">
  <div class="code" id="hCode"></div>
  <div class="name" id="hName"></div>
  <div class="meta" id="hMeta"></div>
</div>
<div id="phase" class="card">
  <div class="date" id="pDate"></div>
  <div class="name" id="pName"></div>
  <div class="desc" id="pDesc"></div>
</div>
<div id="legend" class="card"></div>
<div id="hint">拖曳旋轉 · 滾輪縮放</div>
<div id="bar">
  <div id="ctl">
    <button id="play" aria-label="播放">▶</button>
    <div id="tl">
      <div id="track">
        <div id="fill"></div><div id="knob"></div>
      </div>
      <div id="ends"><span id="e0"></span><span id="e1"></span></div>
    </div>
    <div id="speed">
      <button data-s="0.5">0.5×</button>
      <button data-s="1" class="on">1×</button>
      <button data-s="2">2×</button>
    </div>
  </div>
</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script>
"use strict";
var DATA = ${data};

// ── 時間換算 ────────────────────────────────────────────────
var T0 = Date.parse(DATA.start), T1 = Date.parse(DATA.end), SPAN = Math.max(1, T1 - T0);
function nrm(d){ return (Date.parse(d) - T0) / SPAN; }
function fmtDate(t){ var d=new Date(t);
  return d.getFullYear()+"."+String(d.getMonth()+1).padStart(2,"0")+"."+String(d.getDate()).padStart(2,"0"); }

var ITEMS = DATA.items.map(function(it){
  var a = nrm(it.start), b = nrm(it.end);
  return { name:it.name, kind:it.kind, qty:it.qty, t0:Math.min(a,b), t1:Math.max(a,b) };
});
var MS = DATA.milestones.map(function(m){ return { title:m.title, t:nrm(m.date) }; });

var KIND_COLOR = {
  dwall:0x9fb0c4, excavate:0x6b563f, bore:0x8fa9c9, segment:0xb9c6d6, box:0xc9cdd4,
  wall:0xc9cdd4, dredge:0x6b563f, demolish:0x8a7f74, pile:0x9aa7b5, pier:0xc4c9d0,
  girder:0xa8b6c8, deck:0x8e9aa8, floor:0xcdd3da, fitout:0x7fb3d5, mep:0x4a90d9,
  temp:0xf5b31b, service:0x22d3ee, generic:0x7c9cbf
};
var KIND_LABEL = {
  dwall:"連續壁", excavate:"開挖支撐", bore:"隧道推進", segment:"環片組裝", box:"箱型結構",
  wall:"擋土/護岸", dredge:"疏濬土方", demolish:"拆除", pile:"基樁", pier:"橋墩",
  girder:"梁架設", deck:"橋面/路面", floor:"樓層結構", fitout:"裝修設備", mep:"機電管線",
  temp:"假設工程", service:"監造查驗", generic:"其他"
};

// ── 場景 ────────────────────────────────────────────────────
var app=document.getElementById("app");
var scene=new THREE.Scene();
scene.background=new THREE.Color(0x0b1220);
scene.fog=new THREE.Fog(0x0b1220,150,420);
var camera=new THREE.PerspectiveCamera(48, app.clientWidth/Math.max(1,app.clientHeight), 0.1, 2000);
var renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbfd4ff,0x2a3444,0.8));
var sun=new THREE.DirectionalLight(0xfff2dd,1.05);
sun.position.set(70,110,50); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-140; sun.shadow.camera.right=140;
sun.shadow.camera.top=140; sun.shadow.camera.bottom=-140; sun.shadow.camera.far=380;
scene.add(sun);

var LEN=160, HALF=LEN/2, CH_W=18, SEG=20, SEGL=LEN/SEG;
var root=new THREE.Group(); scene.add(root);
var isWater = DATA.terrain==="water";

function mat(c,o){ o=o||{};
  return new THREE.MeshStandardMaterial({color:c, roughness:o.r!==undefined?o.r:0.85,
    metalness:o.m||0, transparent:!!o.t, opacity:o.t?o.o:1}); }

// 地面
var ground=new THREE.Mesh(new THREE.PlaneGeometry(LEN+120,190), mat(isWater?0x3a4a3e:0x414a44,{r:1}));
ground.rotation.x=-Math.PI/2; ground.position.y=-0.05; ground.receiveShadow=true; root.add(ground);

// 鄰近建物輪廓（環境感）
(function(){
  for(var i=0;i<16;i++){
    var w=6+Math.random()*10, h=6+Math.random()*22;
    var b=new THREE.Mesh(new THREE.BoxGeometry(w,h,w*0.8), mat(0x2b3444,{r:1}));
    var side=i%2?1:-1;
    b.position.set(-HALF+Math.random()*LEN, h/2, side*(CH_W/2+40+Math.random()*34));
    b.castShadow=true; b.receiveShadow=true; root.add(b);
  }
})();

// 堤頂／施工便道
[-1,1].forEach(function(s){
  var r=new THREE.Mesh(new THREE.BoxGeometry(LEN,0.4,7), mat(0x2b3340,{r:.95}));
  r.position.set(0,0.2,s*(CH_W/2+11)); r.receiveShadow=true; root.add(r);
});

// 水路基底
var water=null, waterBase=null, foam=[], bed=null, bedMat=null;
if(isWater){
  bedMat=mat(0x6b563f,{r:1});
  bed=new THREE.Mesh(new THREE.BoxGeometry(LEN,5,CH_W), bedMat);
  bed.position.set(0,-2.5,0); bed.receiveShadow=true; root.add(bed);
  var wm=new THREE.MeshStandardMaterial({color:0x2f80c8,transparent:true,opacity:.7,roughness:.22,metalness:.15});
  water=new THREE.Mesh(new THREE.PlaneGeometry(LEN,CH_W,64,8), wm);
  water.rotation.x=-Math.PI/2; water.position.y=-1.4; root.add(water);
  waterBase=water.geometry.attributes.position.array.slice();
  var fg=new THREE.Group(); water.add(fg);
  for(var f=0;f<22;f++){
    var st=new THREE.Mesh(new THREE.PlaneGeometry(2+Math.random()*3,0.45),
      new THREE.MeshBasicMaterial({color:0xdff2ff,transparent:true,opacity:0}));
    st.position.set(-HALF+Math.random()*LEN,(Math.random()-.5)*(CH_W-4),0.07);
    st.userData={v:7+Math.random()*6,lane:st.position.y}; fg.add(st); foam.push(st);
  }
}

// ── 依 kind 建構各工項的構件 ─────────────────────────────────
var built=[]; // {item, parts:[{mesh, from, to}], extra}

function addItem(item, idx, sameKindIdx, sameKindTotal){
  var parts=[], k=item.kind, col=KIND_COLOR[k]||0x7c9cbf, i;

  function seg(n, make){ // 沿軸線切 n 段，每段在自己的時窗內生成
    for(i=0;i<n;i++){
      var o=make(i,n); if(!o) continue;
      o.mesh.visible=false; root.add(o.mesh);
      parts.push({mesh:o.mesh, from:i/n, to:(i+1)/n, grow:o.grow||"y", base:o.base||o.mesh.position.y});
    }
  }

  if(k==="wall"){
    [-1,1].forEach(function(sd){
      seg(SEG,function(i){
        var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.96,6,1.8), mat(col));
        m.position.set(-HALF+SEGL*(i+.5),3,sd*(CH_W/2+0.9));
        m.castShadow=m.receiveShadow=true; return {mesh:m};
      });
    });
  } else if(k==="dwall"){
    [-1,1].forEach(function(sd){
      seg(SEG,function(i){
        var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.9,26,1.2), mat(col,{r:.9}));
        m.position.set(-HALF+SEGL*(i+.5),-13,sd*(CH_W/2+2));
        m.castShadow=m.receiveShadow=true; return {mesh:m};
      });
    });
  } else if(k==="excavate"){
    // 基坑：土體逐段下挖（縮小）＋ 橫向支撐
    seg(SEG,function(i){
      var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.94,16,CH_W+2), mat(0x6b563f,{r:1}));
      m.position.set(-HALF+SEGL*(i+.5),-8,0); m.receiveShadow=true;
      return {mesh:m, grow:"shrink"};
    });
    seg(Math.floor(SEG/2),function(i,n){
      var m=new THREE.Mesh(new THREE.BoxGeometry(0.7,0.7,CH_W+3), mat(0xf5b31b,{m:.3,r:.5}));
      m.position.set(-HALF+(LEN/n)*(i+.5),-3,0); m.castShadow=true;
      return {mesh:m, grow:"pop"};
    });
  } else if(k==="bore"){
    seg(SEG,function(i){
      var g=new THREE.CylinderGeometry(4,4,SEGL*.98,20,1,true);
      var m=new THREE.Mesh(g, new THREE.MeshStandardMaterial({color:col,roughness:.8,side:THREE.DoubleSide}));
      m.rotation.z=Math.PI/2; m.position.set(-HALF+SEGL*(i+.5),-22,0);
      m.castShadow=m.receiveShadow=true; return {mesh:m, grow:"pop"};
    });
  } else if(k==="segment"){
    seg(SEG*2,function(i,n){
      var m=new THREE.Mesh(new THREE.TorusGeometry(3.6,0.45,8,18), mat(col,{r:.7}));
      m.rotation.y=Math.PI/2; m.position.set(-HALF+(LEN/n)*(i+.5),-22,0);
      m.castShadow=true; return {mesh:m, grow:"pop"};
    });
  } else if(k==="box"){
    // 車站／地下結構：分層由下往上澆置
    var LAYERS=4;
    seg(LAYERS,function(i,n){
      var m=new THREE.Mesh(new THREE.BoxGeometry(LEN*.42,4,CH_W+4), mat(col,{r:.9}));
      m.position.set(0,-16+i*4.4,0); m.castShadow=m.receiveShadow=true; return {mesh:m};
    });
  } else if(k==="dredge"){
    seg(SEG,function(i){
      var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.96,1.6,CH_W*.9), mat(0x54473a,{r:1}));
      m.position.set(-HALF+SEGL*(i+.5),-0.9,0); m.receiveShadow=true;
      m.visible=true; // 淤泥一開始就在，逐段移除
      return {mesh:m, grow:"remove"};
    });
  } else if(k==="demolish"){
    seg(SEG,function(i){
      var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.94,3,CH_W*0.8), mat(0x8a7f74,{r:1}));
      m.position.set(-HALF+SEGL*(i+.5),4,0); m.castShadow=m.receiveShadow=true;
      m.visible=true; return {mesh:m, grow:"remove"};
    });
  } else if(k==="pile"){
    seg(10,function(i,n){
      var g=new THREE.Group();
      [-1,1].forEach(function(sd){
        var c=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,20,14), mat(col,{r:.9}));
        c.position.set(0,-10,sd*4); c.castShadow=true; g.add(c);
      });
      g.position.set(-HALF+(LEN/n)*(i+.5),0,0); return {mesh:g};
    });
  } else if(k==="pier"){
    seg(10,function(i,n){
      var g=new THREE.Group();
      [-1,1].forEach(function(sd){
        var c=new THREE.Mesh(new THREE.CylinderGeometry(2,2.4,14,16), mat(col,{r:.85}));
        c.position.set(0,7,sd*4); c.castShadow=c.receiveShadow=true; g.add(c);
      });
      var cap=new THREE.Mesh(new THREE.BoxGeometry(4.5,1.6,12), mat(col,{r:.85}));
      cap.position.y=14.8; cap.castShadow=true; g.add(cap);
      g.position.set(-HALF+(LEN/n)*(i+.5),0,0); return {mesh:g};
    });
  } else if(k==="girder"){
    seg(9,function(i,n){
      var g=new THREE.Group();
      for(var j=-1;j<=1;j++){
        var b=new THREE.Mesh(new THREE.BoxGeometry(LEN/n*0.94,1.5,1.6), mat(col,{r:.8}));
        b.position.set(0,16.4,j*4.2); b.castShadow=true; g.add(b);
      }
      g.position.set(-HALF+(LEN/n)*(i+.5)+ (LEN/n)/2*0,0,0);
      g.position.x=-HALF+(LEN/n)*(i+.5);
      return {mesh:g, grow:"drop"};
    });
  } else if(k==="deck"){
    seg(SEG,function(i){
      var m=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.98,0.7,13), mat(col,{r:.95}));
      m.position.set(-HALF+SEGL*(i+.5),17.6,0); m.castShadow=m.receiveShadow=true;
      return {mesh:m, grow:"pop"};
    });
  } else if(k==="floor"){
    var FL=9;
    seg(FL,function(i,n){
      var g=new THREE.Group();
      var slab=new THREE.Mesh(new THREE.BoxGeometry(LEN*.34,1,CH_W+8), mat(col,{r:.9}));
      slab.position.y=0; slab.castShadow=slab.receiveShadow=true; g.add(slab);
      // 外牆柱
      [-1,1].forEach(function(sd){
        var w=new THREE.Mesh(new THREE.BoxGeometry(LEN*.34,3.4,0.6), mat(0xb8c2cc,{r:.8}));
        w.position.set(0,1.9,sd*(CH_W/2+4)); w.castShadow=true; g.add(w);
      });
      g.position.set(0, 2 + i*4.2, 0);
      return {mesh:g};
    });
  } else if(k==="fitout"){
    seg(9,function(i,n){
      var m=new THREE.Mesh(new THREE.BoxGeometry(LEN*.30,2.6,CH_W+5), mat(col,{r:.5,m:.15,t:true,o:.55}));
      m.position.set(0, 3.4 + i*4.2, 0); return {mesh:m, grow:"pop"};
    });
  } else if(k==="mep"){
    seg(SEG,function(i){
      var g=new THREE.Group();
      [-1,1].forEach(function(sd){
        var p=new THREE.Mesh(new THREE.CylinderGeometry(.4,.4,SEGL*.95,10), mat(col,{m:.35,r:.5}));
        p.rotation.z=Math.PI/2; p.position.set(0,-6,sd*5); p.castShadow=true; g.add(p);
      });
      g.position.set(-HALF+SEGL*(i+.5),0,0); return {mesh:g, grow:"pop"};
    });
  } else if(k==="temp"){
    seg(SEG,function(i){
      var g=new THREE.Group();
      [-1,1].forEach(function(sd){
        var f=new THREE.Mesh(new THREE.BoxGeometry(SEGL*.9,2.6,0.25), mat(0xf5b31b,{r:.7}));
        f.position.set(0,1.3,sd*(CH_W/2+15)); f.castShadow=true; g.add(f);
      });
      g.position.set(-HALF+SEGL*(i+.5),0,0); return {mesh:g, grow:"pop"};
    });
  } else if(k==="service"){
    // 監造服務無實體構造物：以查驗點沿線亮起表示
    seg(14,function(i,n){
      var g=new THREE.Group();
      var pole=new THREE.Mesh(new THREE.CylinderGeometry(.16,.16,6,8), mat(0xcfd8e6));
      pole.position.y=3; g.add(pole);
      var flag=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.5),
        new THREE.MeshStandardMaterial({color:col,side:THREE.DoubleSide,emissive:0x0a3a44}));
      flag.position.set(1.4,5.2,0); g.add(flag);
      var z=(sameKindIdx-(sameKindTotal-1)/2)*10;
      g.position.set(-HALF+(LEN/n)*(i+.5),0,z+(CH_W/2+20));
      return {mesh:g, grow:"pop"};
    });
  } else {
    seg(8,function(i,n){
      var m=new THREE.Mesh(new THREE.BoxGeometry(7,6,7), mat(col,{r:.8}));
      var z=(sameKindIdx%2?1:-1)*(CH_W/2+22);
      m.position.set(-HALF+(LEN/n)*(i+.5),3,z); m.castShadow=m.receiveShadow=true;
      return {mesh:m};
    });
  }
  built.push({item:item, parts:parts});
}

(function(){
  var counts={}, seen={};
  ITEMS.forEach(function(it){ counts[it.kind]=(counts[it.kind]||0)+1; });
  ITEMS.forEach(function(it,idx){
    seen[it.kind]=(seen[it.kind]||0);
    addItem(it, idx, seen[it.kind], counts[it.kind]);
    seen[it.kind]++;
  });
})();

// 里程碑旗
var flags=MS.map(function(m){
  var g=new THREE.Group();
  var pole=new THREE.Mesh(new THREE.CylinderGeometry(.14,.14,9,8), mat(0xcfd8e6));
  pole.position.y=4.5; g.add(pole);
  var flag=new THREE.Mesh(new THREE.PlaneGeometry(3.4,1.8),
    new THREE.MeshStandardMaterial({color:0x44566e,side:THREE.DoubleSide,emissive:0x000000}));
  flag.position.set(1.8,7.6,0); g.add(flag);
  g.position.set(-HALF+m.t*LEN,0,-(CH_W/2+26));
  g.scale.setScalar(.001); root.add(g);
  return {g:g,flag:flag,t:m.t};
});

// 施工機具
function makeExcavator(){
  var g=new THREE.Group();
  var tr=new THREE.Mesh(new THREE.BoxGeometry(4.6,1.2,3.6), mat(0x14181d,{r:.9}));
  tr.position.y=.9; tr.castShadow=true; g.add(tr);
  var bd=new THREE.Mesh(new THREE.BoxGeometry(4,2.3,3), mat(0xe8a020,{r:.55,m:.3}));
  bd.position.y=2.3; bd.castShadow=true; g.add(bd);
  var cab=new THREE.Mesh(new THREE.BoxGeometry(2,1.9,2.2), mat(0x222a33,{r:.4,m:.2}));
  cab.position.set(-.7,4.2,0); cab.castShadow=true; g.add(cab);
  var arm=new THREE.Group();
  var boom=new THREE.Mesh(new THREE.BoxGeometry(6.4,.55,.55), mat(0xf5b31b,{m:.25}));
  boom.position.x=2.7; arm.add(boom);
  var stick=new THREE.Mesh(new THREE.BoxGeometry(3.6,.5,.5), mat(0xf5b31b,{m:.25}));
  stick.position.set(5.7,-1.3,0); stick.rotation.z=-.9; arm.add(stick);
  arm.position.set(1.3,3.1,0); g.add(arm); g.userData.arm=arm;
  return g;
}
function makeCrane(){
  var g=new THREE.Group();
  var base=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2,1.2,14), mat(0xd94f2a,{r:.6}));
  base.position.y=.6; base.castShadow=true; g.add(base);
  var mast=new THREE.Mesh(new THREE.BoxGeometry(1.1,26,1.1), mat(0xf5b31b,{m:.2}));
  mast.position.y=13; mast.castShadow=true; g.add(mast);
  var jibG=new THREE.Group();
  var jib=new THREE.Mesh(new THREE.BoxGeometry(24,.8,.8), mat(0xf5b31b,{m:.2}));
  jib.position.x=5; jibG.add(jib);
  var ctr=new THREE.Mesh(new THREE.BoxGeometry(5,1.5,1.5), mat(0x333a42,{r:.7}));
  ctr.position.x=-6; jibG.add(ctr);
  var hook=new THREE.Mesh(new THREE.BoxGeometry(1.4,1,1.4), mat(0xc9cdd4,{m:.4}));
  hook.position.set(12,-6,0); jibG.add(hook);
  jibG.position.y=26; g.add(jibG);
  g.userData.jib=jibG; g.userData.hook=hook;
  return g;
}
function makeTruck(){
  var g=new THREE.Group();
  var cab=new THREE.Mesh(new THREE.BoxGeometry(2.6,2.4,2.6), mat(0x3b82f6,{r:.5,m:.2}));
  cab.position.set(2.2,1.9,0); cab.castShadow=true; g.add(cab);
  var bed=new THREE.Mesh(new THREE.BoxGeometry(5.4,1.8,2.8), mat(0x8a949e,{r:.7}));
  bed.position.set(-1.4,1.7,0); bed.castShadow=true; g.add(bed);
  return g;
}
var exc=makeExcavator(); exc.visible=false; root.add(exc);
var crane=makeCrane(); crane.visible=false; root.add(crane);
var truck=makeTruck(); truck.visible=false; root.add(truck);

// 揚塵粒子
var dust=[];
for(var d=0;d<36;d++){
  var p=new THREE.Mesh(new THREE.SphereGeometry(.3,6,6),
    new THREE.MeshBasicMaterial({color:0xcbb89a,transparent:true,opacity:0}));
  p.visible=false; root.add(p); dust.push({m:p,v:new THREE.Vector3(),life:0});
}

// ── 停工區間（每年重複的月份範圍）────────────────────────────
function inPause(t){
  if(!DATA.pause) return false;
  var mo=new Date(T0+t*SPAN).getMonth()+1;
  return mo>=DATA.pause.fromMonth && mo<=DATA.pause.toMonth;
}

// ── UI ──────────────────────────────────────────────────────
document.getElementById("hCode").textContent=DATA.code;
document.getElementById("hName").textContent=DATA.name;
document.getElementById("hMeta").textContent=[DATA.location,DATA.contractor].filter(Boolean).join("｜");
document.getElementById("e0").textContent=fmtDate(T0)+" 開工";
document.getElementById("e1").textContent=fmtDate(T1)+" 竣工";

var legend=document.getElementById("legend");
var legendRows={};
(function(){
  var seenK={};
  ITEMS.forEach(function(it){
    if(seenK[it.kind]) return; seenK[it.kind]=1;
    var row=document.createElement("div"); row.className="row off";
    var sw=document.createElement("div"); sw.className="sw";
    sw.style.background="#"+("000000"+(KIND_COLOR[it.kind]||0x7c9cbf).toString(16)).slice(-6);
    var tx=document.createElement("span"); tx.textContent=KIND_LABEL[it.kind]||it.kind;
    row.appendChild(sw); row.appendChild(tx); legend.appendChild(row);
    legendRows[it.kind]=row;
  });
})();

var track=document.getElementById("track");
if(DATA.pause){
  // 以第一個落入停工月份的區間示意（視覺標示；動畫本身逐年判斷）
  for(var y=0;y<8;y++){
    var yr=new Date(T0).getFullYear()+y;
    var a=Date.parse(yr+"-"+String(DATA.pause.fromMonth).padStart(2,"0")+"-01");
    var bM=DATA.pause.toMonth, bY=yr;
    var b=Date.parse(bY+"-"+String(bM).padStart(2,"0")+"-28");
    if(b<T0||a>T1) continue;
    var l=Math.max(0,(a-T0)/SPAN), r=Math.min(1,(b-T0)/SPAN);
    var band=document.createElement("div"); band.id="pause"; band.style.position="absolute";
    band.style.top="0"; band.style.bottom="0";
    band.style.left=(l*100)+"%"; band.style.width=((r-l)*100)+"%";
    band.style.background="rgba(245,158,11,.3)";
    band.title=DATA.pause.label;
    track.appendChild(band);
  }
}
var fill=document.getElementById("fill"), knob=document.getElementById("knob");
MS.forEach(function(m,i){
  var el=document.createElement("div"); el.className="ms off";
  el.style.left=(m.t*100)+"%"; el.title=m.title;
  el.addEventListener("click",function(e){ e.stopPropagation(); prog=m.t; playing=false; syncPlay(); });
  track.appendChild(el); m.el=el;
});

var playBtn=document.getElementById("play");
var prog=0, playing=false, speed=1, DUR=30;
function syncPlay(){ playBtn.textContent=playing?"❚❚":"▶"; }
playBtn.addEventListener("click",function(){ if(prog>=1) prog=0; playing=!playing; syncPlay(); });
function setFromX(x){
  var r=track.getBoundingClientRect();
  prog=Math.max(0,Math.min(1,(x-r.left)/r.width));
}
var dragging=false;
track.addEventListener("pointerdown",function(e){ dragging=true; playing=false; syncPlay(); setFromX(e.clientX); });
window.addEventListener("pointermove",function(e){ if(dragging) setFromX(e.clientX); });
window.addEventListener("pointerup",function(){ dragging=false; });
Array.prototype.forEach.call(document.querySelectorAll("#speed button"),function(b){
  b.addEventListener("click",function(){
    speed=parseFloat(b.getAttribute("data-s"));
    Array.prototype.forEach.call(document.querySelectorAll("#speed button"),function(x){x.classList.remove("on");});
    b.classList.add("on");
  });
});

// 相機
var camA=0.9, camB=0.42, camR=isWater?150:170;
var tgt=new THREE.Vector3(0,isWater?0:8,0);
var md=false,px=0,py=0;
renderer.domElement.addEventListener("pointerdown",function(e){md=true;px=e.clientX;py=e.clientY;});
window.addEventListener("pointerup",function(){md=false;});
window.addEventListener("pointermove",function(e){
  if(!md) return;
  camA-=(e.clientX-px)*0.005;
  camB=Math.max(0.08,Math.min(1.35,camB-(e.clientY-py)*0.005));
  px=e.clientX; py=e.clientY;
});
renderer.domElement.addEventListener("wheel",function(e){
  e.preventDefault(); camR=Math.max(60,Math.min(340,camR+e.deltaY*0.09));
},{passive:false});

// ── 每幀更新 ────────────────────────────────────────────────
function clamp01(v){ return v<0?0:v>1?1:v; }
function updateBuild(p){
  built.forEach(function(b){
    var it=b.item, span=Math.max(0.0001,it.t1-it.t0);
    var local=clamp01((p-it.t0)/span);
    var activeNow = p>=it.t0 && p<=it.t1;
    if(legendRows[it.kind]) legendRows[it.kind].classList.toggle("off", local<=0);
    b.parts.forEach(function(pt){
      var f=clamp01((local-pt.from)/Math.max(0.0001,pt.to-pt.from));
      var mesh=pt.mesh;
      if(pt.grow==="remove"){ // 淤泥／既有結構：逐段消失
        mesh.visible=f<0.99; mesh.scale.y=Math.max(0.001,1-f);
      } else if(pt.grow==="shrink"){ // 開挖：土體逐段挖除
        mesh.visible=f<0.99; mesh.scale.y=Math.max(0.001,1-f);
        mesh.position.y=pt.base-(1-Math.max(0.001,1-f))*0;
      } else if(pt.grow==="pop"){
        mesh.visible=f>0.02; mesh.scale.setScalar(Math.max(0.001,f));
      } else if(pt.grow==="drop"){ // 吊裝就位：自上方落下
        mesh.visible=f>0.02;
        mesh.position.y=(1-f)*18;
        mesh.scale.setScalar(1);
      } else { // 預設：由下往上長出
        mesh.visible=f>0.01;
        mesh.scale.y=Math.max(0.001,f);
        if(mesh.geometry && mesh.geometry.parameters && mesh.geometry.parameters.height){
          mesh.position.y=pt.base-(mesh.geometry.parameters.height/2)*(1-f)*(pt.base<0?-1:1);
        }
      }
    });
    b.active=activeNow;
  });
}

var activity={crane:null,exc:null,truck:null};
function updateMachines(p){
  var paused=inPause(p);
  var digging=null, lifting=null;
  built.forEach(function(b){
    if(!b.active) return;
    var k=b.item.kind;
    if(k==="dredge"||k==="excavate"||k==="pile"||k==="demolish") digging=b;
    if(k==="wall"||k==="dwall"||k==="pier"||k==="girder"||k==="box"||k==="floor"||k==="deck") lifting=b;
  });
  // 停工期間機具撤離
  if(paused){ exc.visible=false; crane.visible=false; truck.visible=false; return; }

  if(digging){
    var lp=clamp01((p-digging.item.t0)/Math.max(0.0001,digging.item.t1-digging.item.t0));
    exc.visible=true;
    exc.position.set(-HALF+lp*LEN, isWater?0.6:0.4, isWater?(CH_W/2+6):(CH_W/2+7));
    exc.rotation.y=-Math.PI/2;
    truck.visible=true;
    truck.position.set(-HALF+lp*LEN-16, 0, CH_W/2+11);
    truck.rotation.y=0;
  } else { exc.visible=false; truck.visible=false; }

  if(lifting){
    var lp2=clamp01((p-lifting.item.t0)/Math.max(0.0001,lifting.item.t1-lifting.item.t0));
    crane.visible=true;
    crane.position.set(-HALF+lp2*LEN, 0, -(CH_W/2+8));
  } else crane.visible=false;
}

function currentPhase(p){
  var act=built.filter(function(b){return p>=b.item.t0&&p<=b.item.t1;});
  var name, desc;
  if(inPause(p)){
    name=DATA.pause.label; desc="依契約要求停止河道內施工，機具撤離工區。";
  } else if(act.length){
    name=act.map(function(b){return b.item.name;}).slice(0,2).join("、");
    var q=act[0].item.qty;
    desc=(act.length>2?"另有 "+(act.length-2)+" 項同時施作。":"")+(q?" 數量約 "+q:"");
    if(!desc.trim()) desc="施工中";
  } else if(p<=0.001){ name="開工動員"; desc="工區交付、假設工程與放樣。"; }
  else { name="竣工驗收"; desc="完成查驗與驗收作業。"; }
  var reached=MS.filter(function(m){return p>=m.t-0.001;});
  if(reached.length) desc=(desc?desc+" ":"")+"｜最近里程碑："+reached[reached.length-1].title;
  return {date:fmtDate(T0+p*SPAN), name:name, desc:desc};
}

var last=performance.now();
function frame(now){
  var dt=Math.min((now-last)/1000,0.05); last=now;
  if(playing){
    prog+=dt/DUR*speed;
    if(prog>=1){ prog=1; playing=false; syncPlay(); }
  }
  updateBuild(prog);
  updateMachines(prog);

  // 里程碑旗
  flags.forEach(function(f,i){
    var on=prog>=f.t-0.001;
    f.g.scale.setScalar(f.g.scale.x+((on?1:0.001)-f.g.scale.x)*0.12);
    f.flag.material.color.setHex(on?0x22d3ee:0x44566e);
    f.flag.material.emissive.setHex(on?0x0a3a44:0x000000);
    if(MS[i].el) MS[i].el.classList.toggle("off",!on);
  });

  // 水面與通水
  if(isWater){
    var dr=built.filter(function(b){return b.item.kind==="dredge";})[0];
    var flow=0;
    if(dr){ flow=Math.pow(clamp01((prog-dr.item.t0)/Math.max(0.0001,dr.item.t1-dr.item.t0)),1.5); }
    water.position.y=-1.4+flow*0.8;
    water.material.opacity=0.55+flow*0.25;
    water.material.color.lerpColors(new THREE.Color(0x5a6d4a),new THREE.Color(0x2f80c8),flow);
    if(bed) bed.position.y=-2.5-flow*0.7;
    var pos=water.geometry.attributes.position, tm=now*0.001;
    for(var i=0;i<pos.count;i++){
      var x=waterBase[i*3], y=waterBase[i*3+1];
      pos.setZ(i, Math.sin(x*0.28-tm*(1.4+flow*4))*(0.08+flow*0.11)+Math.cos(y*0.4+tm)*0.07);
    }
    pos.needsUpdate=true;
    foam.forEach(function(s){
      s.position.x+=s.userData.v*flow*dt;
      if(s.position.x>HALF){ s.position.x=-HALF; s.position.y=(Math.random()-.5)*(CH_W-4); }
      s.material.opacity=flow*(0.3+0.35*Math.sin(now*0.004+s.userData.lane));
    });
  }

  // 機具動作
  if(crane.visible){
    crane.userData.jib.rotation.y=Math.sin(now*0.0006)*0.9;
    crane.userData.hook.position.y=-6+Math.sin(now*0.0018)*3.5;
  }
  if(exc.visible) exc.userData.arm.rotation.z=-0.25+Math.sin(now*0.0035)*0.45;
  if(truck.visible){
    truck.position.x+=6*dt;
    if(truck.position.x>HALF) truck.position.x=-HALF;
  }

  // 揚塵
  dust.forEach(function(o){
    if(o.life<=0){
      if((exc.visible||crane.visible)&&Math.random()<0.22){
        var src=exc.visible?exc.position:crane.position;
        o.m.position.set(src.x+(Math.random()-.5)*5,1.5,src.z+(Math.random()-.5)*5);
        o.v.set((Math.random()-.5)*2.5,2+Math.random()*2.2,(Math.random()-.5)*2.5);
        o.life=1; o.m.visible=true;
      }
    } else {
      o.life-=dt; o.v.y-=4*dt;
      o.m.position.addScaledVector(o.v,dt);
      o.m.material.opacity=Math.max(0,o.life*0.45);
      if(o.life<=0) o.m.visible=false;
    }
  });

  // 疊加層
  fill.style.width=(prog*100)+"%";
  knob.style.left=(prog*100)+"%";
  var ph=currentPhase(prog);
  document.getElementById("pDate").textContent=ph.date;
  document.getElementById("pName").textContent=ph.name;
  document.getElementById("pDesc").textContent=ph.desc;

  camera.position.set(
    tgt.x+camR*Math.cos(camB)*Math.cos(camA),
    tgt.y+camR*Math.sin(camB),
    tgt.z+camR*Math.cos(camB)*Math.sin(camA));
  camera.lookAt(tgt);
  renderer.render(scene,camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener("resize",function(){
  camera.aspect=app.clientWidth/Math.max(1,app.clientHeight);
  camera.updateProjectionMatrix();
  renderer.setSize(app.clientWidth,app.clientHeight);
});

setTimeout(function(){ playing=true; syncPlay(); },700);
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
