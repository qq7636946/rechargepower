// BESS 儲能貨櫃 — 捲動編排模組（可嵌進一般頁面的區塊）
//   幾何、材質圖版面與貨櫃細節搬自 3d-bess-container.html。
//   差別：畫布是 sticky 在自己的 section 內（不是 fixed 全螢幕），
//   捲動進度也只看該 section，所以能放進長頁面的任何位置。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function initBessScroll(opts = {}) {
  const section = opts.section, canvasHost = opts.canvas;
  const cityEl = opts.city, titleEl = opts.title;
  if (!section || !canvasHost) return null;
  const TEX_BASE = opts.texBase || '';

  // ── 材質圖 ──────────────────────────────────────────────────
  // 這支專屬的資料夾，跟其他三支分開，改圖互不影響
  const TEX_DIR = TEX_BASE + '3D/toe-bess-container/';
  const TEX_FILES = {
      // baseColor = UV 色塊對照版；baseColor2 = 正式塗裝版；baseColor3 = 塗裝疊標註的檢查版
      container: 'Container_baseColor2.jpeg',
      ground: 'Ground_baseColor.jpg',
      detail: 'Detail_baseColor.jpg'      // 細節件專用第二張圖（獨立 UV，見 DR）
  };

  // 貨櫃材質圖版面（2048²）— 設計稿就是照這個切的，改動會讓貼圖跑掉
  const ATLAS = 2048;
  const R = {
      left:   [0, 0, 1280, 512],        // 左側牆
      right:  [0, 512, 1280, 512],      // 右側牆（品牌面）
      roof:   [0, 1024, 1536, 512],     // 車頂
      front:  [1280, 0, 426, 512],      // 門端
      rear:   [1280, 512, 426, 512],    // 設備端
      bottom: [1536, 1024, 512, 512],   // 底面
      louver: [0, 1536, 512, 512],      // 百葉
      fan:    [512, 1536, 512, 512]     // 風扇
  };

  // 細節件材質圖版面（Detail_baseColor.jpg，2048²）— 跟主圖完全分開，
  // 改細節圖不會動到貨櫃六面。分區對照圖：make-uv-guide-detail.ps1
  // 區塊長寬比對應模型面：louver 12:1、grille 6:1、hatch 正方、
  // hmi 6:7、warn / fire 2:1。改比例前要連同幾何尺寸一起換算。
  const DR = {
      louver: [0, 0, 1920, 160],        // 側牆排風百葉帶
      grille: [0, 160, 1536, 256],      // 側牆下方回風網
      hatch:  [1536, 160, 256, 256],    // 車頂洩爆口頂面
      hmi:    [0, 416, 384, 448],       // 門端控制面板（HMI）
      warn:   [384, 416, 448, 224],     // 高壓警示牌
      fire:   [832, 416, 448, 224]      // 消防標示牌
  };

  // 貨櫃尺寸：長:高 = 2.5:1、長:寬 = 3:1，刻意與材質圖區塊比例一致，
  // 改這裡會把設計稿的圖拉變形，要動請連同 R 的區塊一起換算
  const DIM = { L: 3.0, H: 1.2, W: 1.0, baseH: .075 };

  // 展示基座：圓盤比方形地坪更像「產品放在台座上」，也不會有場站的聯想。
  // 半徑要壓在預設鏡頭看得到外緣的範圍內（貨櫃半對角 1.58、空調櫃外緣 1.66），
  // 放到 2.9 的話圓盤會撐出畫面，就變成一片地板、失去台座的感覺
  const STAGE = { radius: 2.0, show: false };   // 捲動版預設拿掉底座（面板仍可打開）

  // ── 繪圖工具（只在缺材質圖時用來生底稿）─────────────────────
  function noise(ctx, x, y, w, h, n, amt) {
      for (let i = 0; i < n; i++) {
          ctx.fillStyle = Math.random() < .5
              ? `rgba(25,29,27,${amt * Math.random()})`
              : `rgba(255,255,255,${amt * Math.random()})`;
          ctx.fillRect(x + Math.random() * w, y + Math.random() * h, 2, 2);
      }
  }

  function bakeGround() {
      const c = document.createElement('canvas');
      c.width = c.height = 1024;
      const ctx = c.getContext('2d');
      // ACES + 強日照會把中灰整個提亮，基準色要壓得比直覺深一階才像混凝土
      ctx.fillStyle = '#83867f';
      ctx.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 120; i++) {
          ctx.fillStyle = `rgba(255,255,255,${.015 + Math.random() * .03})`;
          ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 60 + Math.random() * 180, 60 + Math.random() * 180);
      }
      noise(ctx, 0, 0, 1024, 1024, 9000, .16);
      ctx.strokeStyle = 'rgba(16,19,17,.45)';
      ctx.lineWidth = 4;
      for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(i * 256, 0); ctx.lineTo(i * 256, 1024); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i * 256); ctx.lineTo(1024, i * 256); ctx.stroke();
      }
      return c;
  }

  // 細節圖底稿：設計稿（Detail_baseColor.jpg）還沒畫好之前的程序化替身。
  // 版面、方向與 DR 完全一致，之後換成手繪檔案不用改任何幾何。
  function bakeDetail() {
      const c = document.createElement('canvas');
      c.width = c.height = ATLAS;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#dfe3e0';
      ctx.fillRect(0, 0, ATLAS, ATLAS);

      // 排風百葉帶：橫向葉片＋上緣高光、下緣陰影
      ctx.fillStyle = '#e9eceb';
      ctx.fillRect(0, 0, 1920, 160);
      for (let i = 0; i < 4; i++) {
          const y = 10 + i * 36;
          ctx.fillStyle = '#c7cdca';
          ctx.fillRect(14, y, 1892, 28);
          ctx.fillStyle = 'rgba(22,28,25,.42)';
          ctx.fillRect(14, y + 21, 1892, 7);
          ctx.fillStyle = 'rgba(255,255,255,.65)';
          ctx.fillRect(14, y, 1892, 4);
      }
      ctx.strokeStyle = 'rgba(22,28,25,.5)';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, 1912, 152);

      // 回風網：深底斜紋網＋鋼框
      ctx.fillStyle = '#2b312e';
      ctx.fillRect(0, 160, 1536, 256);
      ctx.strokeStyle = 'rgba(214,220,216,.38)';
      ctx.lineWidth = 3;
      for (let d = -256; d < 1536; d += 20) {
          ctx.beginPath(); ctx.moveTo(d, 416); ctx.lineTo(d + 256, 160); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(d, 160); ctx.lineTo(d + 256, 416); ctx.stroke();
      }
      ctx.strokeStyle = '#c9cecc';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 167, 1522, 242);

      // 洩爆口頂面：鋼板＋對角壓條＋四角螺栓
      ctx.fillStyle = '#d5d9d6';
      ctx.fillRect(1536, 160, 256, 256);
      ctx.strokeStyle = 'rgba(20,26,23,.4)';
      ctx.lineWidth = 6;
      ctx.strokeRect(1548, 172, 232, 232);
      ctx.beginPath(); ctx.moveTo(1556, 180); ctx.lineTo(1772, 396); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1772, 180); ctx.lineTo(1556, 396); ctx.stroke();
      ctx.fillStyle = '#8d928f';
      [[1566, 190], [1762, 190], [1566, 386], [1762, 386]].forEach(([bx, by]) => {
          ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2); ctx.fill();
      });

      // HMI 控制面板：深灰門板＋螢幕＋按鈕＋急停鈕
      ctx.fillStyle = '#202623';
      ctx.fillRect(0, 416, 384, 448);
      ctx.strokeStyle = 'rgba(255,255,255,.18)';
      ctx.lineWidth = 6;
      ctx.strokeRect(10, 426, 364, 428);
      ctx.fillStyle = '#0b241a';
      ctx.fillRect(42, 462, 300, 190);
      ctx.strokeStyle = '#35e06b';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(58, 610);
      [[110, 560], [160, 585], [215, 505], [270, 540], [326, 480]].forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.stroke();
      ctx.fillStyle = '#35e06b';
      ctx.fillRect(58, 478, 92, 10);
      for (let i = 0; i < 3; i++) {
          ctx.fillStyle = ['#4a524e', '#4a524e', '#3b7f57'][i];
          ctx.beginPath(); ctx.arc(80 + i * 70, 712, 20, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = '#c8332a';
      ctx.beginPath(); ctx.arc(300, 712, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4e9c8';
      ctx.fillRect(258, 762, 84, 14);

      // 高壓警示牌：黃底黑框＋閃電三角＋字
      ctx.fillStyle = '#f2c61d';
      ctx.fillRect(384, 416, 448, 224);
      ctx.strokeStyle = '#171d1a';
      ctx.lineWidth = 12;
      ctx.strokeRect(396, 428, 424, 200);
      ctx.fillStyle = '#171d1a';
      ctx.beginPath();
      ctx.moveTo(478, 596); ctx.lineTo(542, 468); ctx.lineTo(606, 596); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f2c61d';
      ctx.beginPath();
      ctx.moveTo(548, 502); ctx.lineTo(528, 548); ctx.lineTo(544, 548);
      ctx.lineTo(532, 582); ctx.lineTo(560, 540); ctx.lineTo(544, 540); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#171d1a';
      ctx.font = 'bold 58px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      ctx.fillText('高壓危險', 622, 522);
      ctx.font = 'bold 34px Arial, sans-serif';
      ctx.fillText('DANGER', 622, 572);

      // 消防標示牌：紅底白框＋滅火器剪影＋字
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(832, 416, 448, 224);
      ctx.strokeStyle = '#f4efe9';
      ctx.lineWidth = 10;
      ctx.strokeRect(844, 428, 424, 200);
      ctx.fillStyle = '#f4efe9';
      ctx.fillRect(898, 470, 44, 130);
      ctx.fillRect(906, 452, 28, 18);
      ctx.fillRect(930, 444, 34, 10);
      ctx.font = 'bold 52px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
      ctx.fillText('消防設備', 986, 520);
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText('FIRE EQUIPMENT', 986, 568);

      return c;
  }

  // ── 幾何工具 ────────────────────────────────────────────────
  const uvRect = ([x, y, w, h]) => ({
      u0: x / ATLAS, u1: (x + w) / ATLAS,
      v0: 1 - (y + h) / ATLAS, v1: 1 - y / ATLAS
  });

  function mapUV(geometry, region) {
      const { u0, u1, v0, v1 } = uvRect(region);
      const uv = geometry.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
          uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      }
      uv.needsUpdate = true;
      return geometry;
  }

  function panelGeo(w, h, region) {
      return mapUV(new THREE.PlaneGeometry(w, h), region);
  }

  // 浪板：沿寬度做梯形波剖面再往上長高。用真實幾何而不是 bump，
  // 掠射角才有稜線與自身陰影；UV 依展平前的位置線性對應，
  // 貼圖上畫好的浪板陰影會跟稜線疊在一起。
  function corrugatedGeo(width, height, region, depth = .022, period = .075) {
      const { u0, u1, v0, v1 } = uvRect(region);
      const n = Math.max(4, Math.round(width / period));
      const p = width / n;
      const prof = [];
      for (let i = 0; i < n; i++) {
          const x = -width / 2 + i * p;
          prof.push([x, 0], [x + .34 * p, 0], [x + .5 * p, -depth], [x + .84 * p, -depth]);
      }
      prof.push([width / 2, 0]);

      const pos = [], nor = [], uv = [];
      const y0 = -height / 2, y1 = height / 2;
      const push = (x, y, z, nx, nz) => {
          pos.push(x, y, z);
          nor.push(nx, 0, nz);
          uv.push(u0 + (x / width + .5) * (u1 - u0), v0 + (y / height + .5) * (v1 - v0));
      };
      for (let i = 0; i < prof.length - 1; i++) {
          const [ax, az] = prof[i], [bx, bz] = prof[i + 1];
          const dx = bx - ax, dz = bz - az;
          const len = Math.hypot(dx, dz) || 1;
          const nx = dz / len, nz = -dx / len;
          push(ax, y0, az, nx, nz); push(bx, y0, bz, nx, nz); push(bx, y1, bz, nx, nz);
          push(ax, y0, az, nx, nz); push(bx, y1, bz, nx, nz); push(ax, y1, az, nx, nz);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      return g;
  }

  // ── 材質 ────────────────────────────────────────────────────
  const MAT = {};
  function makeMaterials(texContainer, texGround, texDetail) {
      MAT.container = new THREE.MeshStandardMaterial({ map: texContainer, roughness: .62, metalness: .08 });
      MAT.ground = new THREE.MeshStandardMaterial({ map: texGround, roughness: .96, metalness: 0 });
      MAT.detail = new THREE.MeshStandardMaterial({ map: texDetail, roughness: .5, metalness: .18 });
      MAT.steel = new THREE.MeshStandardMaterial({ color: '#cfd4d2', roughness: .38, metalness: .62 });
      MAT.dark = new THREE.MeshStandardMaterial({ color: '#191d1b', roughness: .72, metalness: .25 });
      MAT.shell = new THREE.MeshStandardMaterial({ color: '#eceeed', roughness: .58, metalness: .1 });
      MAT.rod = new THREE.MeshStandardMaterial({ color: '#c9cecc', roughness: .34, metalness: .72 });
      MAT.kerb = new THREE.MeshStandardMaterial({ color: '#b2b6b2', roughness: 1 });
      MAT.beacon = new THREE.MeshStandardMaterial({
          color: '#e0483a', roughness: .4, metalness: .1,
          emissive: '#7a1408', emissiveIntensity: .35
      });
  }

  const cast = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // ── 端門開合（移植自 hero-3d.html 的驗證版）───────────────────
  // buildContainer() 會把兩扇門的樞紐填進 doors；setDoorsOpen(p) 依捲動
  // 進度開合（0=關、1=全開）。兩扇小錯開、最大外掀約 129°，
  // 內部照明強度也在這裡一起跟著門的進度走。
  const doors = { a: null, b: null };
  let interiorRoot = null;
  let doorLight = null;
  let doorP = 0;
  function setDoorsOpen(p) {
      doorP = p;
      if (!doors.a) return;
      const ease = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
      doors.a.rotation.y = -2.25 * ease(p / .82);
      doors.b.rotation.y = 2.25 * ease((p - .16) / .84);
      if (doorLight) doorLight.intensity = p * 2.2;
      // 門全關時內裝一定被外殼擋住，但 draw call 照樣付。
      // 這一段有 ~90 個 mesh，關著就整組關掉，捲動大半路程省下來。
      if (interiorRoot) interiorRoot.visible = p > .004;
  }

  // ── 貨櫃 ────────────────────────────────────────────────────
  // 設計稿的鎖桿已經畫在材質圖上；掃描亮度差把畫好的直立鎖桿位置找出來，
  // 3D 鎖桿疊在同一位置補立體感，才不會出現「畫的一組、模型另一組」的疊影
  function detectRods(img, region) {
      const [rx, ry, rw, rh] = region;
      const c = document.createElement('canvas');
      c.width = rw; c.height = rh;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, rx, ry, rw, rh, 0, 0, rw, rh);
      const d = ctx.getImageData(0, 0, rw, rh).data;
      const lum = (x, y) => { const i = (y * rw + x) * 4; return d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114; };
      const bands = [.14, .36, .60, .84].map(f => Math.round(rh * f));
      const hits = new Float32Array(rw);
      bands.forEach(yb => {
          const s = new Float32Array(rw);
          let peak = 0;
          for (let x = 8; x < rw - 8; x++) {
              let v = 0;
              for (let dy = -8; dy <= 8; dy += 4) v += Math.abs(2 * lum(x, yb + dy) - lum(x - 7, yb + dy) - lum(x + 7, yb + dy));
              s[x] = v;
              peak = Math.max(peak, v);
          }
          const th = peak * .42;
          for (let x = 8; x < rw - 8; x++) if (s[x] > th) hits[x] += 1;
      });
      // 四條掃描帶至少三條命中才算鎖桿（文字筆畫只會出現在單一帶）
      const rods = [];
      let x = 8;
      while (x < rw - 8) {
          if (hits[x] >= 3) {
              let end = x, sum = 0, wsum = 0;
              while (end < rw - 8 && hits[end] >= 2) { sum += hits[end] * end; wsum += hits[end]; end++; }
              if (end - x < 24) rods.push(sum / wsum / rw);
              x = end + 10;
          } else x++;
      }
      return rods;
  }

  // 凹凸圖直接取材質圖亮度：門縫（暗）凹、鎖桿（亮）凸，跟彩圖百分之百對齊
  function makeBumpFromImage(img) {
      const c = document.createElement('canvas');
      c.width = c.height = 1024;
      const ctx = c.getContext('2d');
      ctx.filter = 'grayscale(1) contrast(1.4) brightness(1.02)';
      ctx.drawImage(img, 0, 0, 1024, 1024);
      return c;
  }

  let RODS = { left: [], right: [], front: [], rear: [] };

  function buildContainer() {
      const { L, H, W, baseH } = DIM;
      const g = new THREE.Group();
      const body = new THREE.Group();
      const cm = MAT.container;

      // 側牆是平板門扇（設計稿六視圖：整排對開門＋鎖桿，不是浪板牆），
      // 立體感交給掃描出來的 3D 鎖桿與亮度凹凸圖；只有車頂維持浪板幾何
      const right = cast(new THREE.Mesh(panelGeo(L, H, R.right), cm));
      right.position.z = W / 2;
      const left = cast(new THREE.Mesh(panelGeo(L, H, R.left), cm));
      left.rotation.y = Math.PI;
      left.position.z = -W / 2;
      // 浪板加深＋整片微抬：側視圖頂緣才看得到設計稿那排一根一根的稜線
      const roof = cast(new THREE.Mesh(corrugatedGeo(L, W, R.roof, .026, .058), cm));
      roof.rotation.x = -Math.PI / 2;
      roof.position.y = H / 2 + .014;
      const rear = cast(new THREE.Mesh(panelGeo(W, H, R.rear), cm));
      rear.rotation.y = -Math.PI / 2;
      rear.position.x = -L / 2;
      const bottom = cast(new THREE.Mesh(panelGeo(L, W, R.bottom), cm));
      bottom.rotation.x = Math.PI / 2;
      bottom.position.y = -H / 2;
      body.add(right, left, roof, rear, bottom);
      body.position.y = baseH + H / 2;
      g.add(body);

      // ── 端門：front 面改成兩扇對開艙門（移植自 hero-3d.html）────
      // 門板取 front 貼圖的左右半幅、縱向直浪板；內面淺色背板＋包邊
      // 收出門的厚度，樞紐邊四組鉸鏈。所有貼近的面一律留縫，
      // 共面會 z-fighting 閃雜訊。
      const doorHalf = (region, hingeZ) => {
          const grp = new THREE.Group();
          grp.position.set(L / 2, 0, hingeZ);
          const lz = hingeZ > 0 ? -W / 4 : W / 4;
          const leaf = cast(new THREE.Mesh(corrugatedGeo(W / 2, H, region, .012, .055), cm));
          leaf.rotation.y = Math.PI / 2;
          leaf.position.z = lz;
          const back = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - .012, H - .012), MAT.shell);
          back.rotation.y = -Math.PI / 2;
          back.position.set(-.02, 0, lz);
          grp.add(leaf, back);
          [1, -1].forEach(sy => {
              const rail = new THREE.Mesh(new THREE.BoxGeometry(.03, .016, W / 2), MAT.shell);
              rail.position.set(-.008, sy * (H / 2 - .008), lz);
              grp.add(rail);
          });
          const edge = new THREE.Mesh(new THREE.BoxGeometry(.03, H, .016), MAT.shell);
          edge.position.set(-.008, 0, hingeZ > 0 ? -W / 2 + .008 : W / 2 - .008);
          grp.add(edge);
          [-.36, -.12, .12, .36].forEach(f => {
              const lug = new THREE.Mesh(new THREE.BoxGeometry(.026, .07, .045), MAT.steel);
              lug.position.set(.012, H * f, 0);
              grp.add(lug);
              const pin = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .095, 8), MAT.rod);
              pin.position.set(.026, H * f, 0);
              grp.add(pin);
          });
          return grp;
      };
      // R.front 對半切：u 前半落在 +z 那扇、後半落在 -z 那扇
      const [dfx, dfy, dfw, dfh] = R.front;
      const doorA = doorHalf([dfx, dfy, dfw / 2, dfh], W / 2);
      const doorB = doorHalf([dfx + dfw / 2, dfy, dfw / 2, dfh], -W / 2);
      body.add(doorA, doorB);
      doors.a = doorA;
      doors.b = doorB;

      // 端面的鎖桿改掛在門扇上，跟著門一起開（不進 InstancedMesh）
      RODS.front.forEach(u => {
          const z = W / 2 - u * W;
          const door = z >= 0 ? doorA : doorB;
          const lz = z - door.position.z;
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(.0085, .0085, H - .1, 10), MAT.rod);
          rod.position.set(.015, 0, lz);
          door.add(rod);
      });

      // ── 內裝：暗色艙體＋兩側電池模組架（開門才看得見）────────
      // BackSide 盒子從外面看不到、從門口望進去就是內壁。
      // 這段刻意做細：門開到底時鏡頭會推進來，模組面板、匯流排、
      // 線槽、消防瓶這些近距離才看得到的件，少一樣就會露餡。
      const interior = new THREE.Group();
      const cave = new THREE.Mesh(
          new THREE.BoxGeometry(L * .96, H * .97, W * .97),
          new THREE.MeshStandardMaterial({ color: '#414c55', roughness: .85, metalness: .1, side: THREE.BackSide }));
      interior.add(cave);
      const moduleMat = new THREE.MeshStandardMaterial({ color: '#e9edef', roughness: .5, metalness: .08 });
      const modFaceMat = new THREE.MeshStandardMaterial({ color: '#dde4e6', roughness: .42, metalness: .12 });
      const frameMat = new THREE.MeshStandardMaterial({ color: '#242c31', roughness: .7, metalness: .2 });
      const busMat = new THREE.MeshStandardMaterial({ color: '#b08a3c', roughness: .38, metalness: .8 });
      const cableMat = new THREE.MeshStandardMaterial({ color: '#15191c', roughness: .9, metalness: .05 });
      const ledMat = new THREE.MeshBasicMaterial({ color: '#2ee8b8' });
      const ledAmberMat = new THREE.MeshBasicMaterial({ color: '#ffc24d' });

      // 走道地板：防滑板＋兩側收邊條＋橫向踏板紋
      const floor = new THREE.Mesh(new THREE.BoxGeometry(L * .94, .014, W * .36),
          new THREE.MeshStandardMaterial({ color: '#c9d2cf', roughness: .8, metalness: .05 }));
      floor.position.y = -H * .47;
      interior.add(floor);
      [-1, 1].forEach(s => {
          const kerb = new THREE.Mesh(new THREE.BoxGeometry(L * .94, .022, .018), frameMat);
          kerb.position.set(0, -H * .462, s * W * .18);
          interior.add(kerb);
      });
      const gratMat = new THREE.MeshStandardMaterial({ color: '#aab4b1', roughness: .95 });
      for (let i = 0; i < 26; i++) {
          const g = new THREE.Mesh(new THREE.BoxGeometry(.008, .004, W * .34), gratMat);
          g.position.set(-L * .46 + i * (L * .92 / 25), -H * .462, 0);
          interior.add(g);
      }

      // 天花：主線槽＋吊架＋三條電纜束（看得出走線方向）
      const tray = new THREE.Mesh(new THREE.BoxGeometry(L * .88, .028, .15), frameMat);
      tray.position.set(-.06, H * .42, 0);
      interior.add(tray);
      for (let i = 0; i < 7; i++) {
          const hang = new THREE.Mesh(new THREE.BoxGeometry(.01, .05, .01), frameMat);
          hang.position.set(-L * .42 + i * (L * .84 / 6), H * .455, 0);
          interior.add(hang);
      }
      [-.045, 0, .045].forEach((z, i) => {
          const c = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, L * .86, 6), cableMat);
          c.rotation.z = Math.PI / 2;
          c.position.set(-.06, H * .40 + (i === 1 ? .008 : 0), z);
          interior.add(c);
      });

      const NMOD = 8, modH = .082, modGap = .028;
      const ledGeo = new THREE.BoxGeometry(.006, .012, .03);
      [-1, 1].forEach(s => {
          const rack = new THREE.Group();
          rack.position.set(L / 2 - .62, 0, s * W * .3);
          // 機架改成「框」而不是實心盒：上下橫樑＋四支立柱＋背板，
          // 層板之間留得出縫隙，近看才不是一塊磚
          [1, -1].forEach(yy => {
              const beam = new THREE.Mesh(new THREE.BoxGeometry(.9, .022, W * .3), frameMat);
              beam.position.set(-.08, yy * H * .45, 0);
              rack.add(beam);
          });
          [[.505, 1], [.505, -1], [-.53, 1], [-.53, -1]].forEach(([px, zz]) => {
              const post = new THREE.Mesh(new THREE.BoxGeometry(.028, H * .9, .028), frameMat);
              post.position.set(px, 0, zz * (W * .15 + .018));   // 立柱要夾在模組外緣，往內縮就會穿過面板
              rack.add(post);
          });
          const back = new THREE.Mesh(new THREE.BoxGeometry(.9, H * .9, .012), frameMat);
          back.position.set(-.08, 0, s * (W * .15 + .022));   // 背板貼艙壁那一側（s 正負＝機架在哪一側）
          rack.add(back);
          // 直立匯流排：銅色貫穿整架，是儲能櫃最好認的內部特徵
          const bus = new THREE.Mesh(new THREE.BoxGeometry(.014, H * .86, .03), busMat);
          bus.position.set(-.52, 0, s * (W * .12));
          rack.add(bus);

          for (let i = 0; i < NMOD; i++) {
              const modY = -H * .45 + modH / 2 + .02 + i * (modH + modGap);
              const mod = new THREE.Mesh(new THREE.BoxGeometry(.96, modH, W * .3 + .02), moduleMat);
              mod.position.y = modY;
              rack.add(mod);
              // 正面板比本體亮一階，做出抽屜面的層次
              const face = new THREE.Mesh(new THREE.BoxGeometry(.012, modH - .012, W * .3 - .01), modFaceMat);
              face.position.set(.492, modY, 0);
              rack.add(face);
              for (let v = 0; v < 3; v++) {          // 面板散熱溝
                  const vent = new THREE.Mesh(new THREE.BoxGeometry(.004, .006, W * .2), frameMat);
                  vent.position.set(.5, modY - modH * .22 + v * modH * .22, 0);
                  rack.add(vent);
              }
              const grip = new THREE.Mesh(new THREE.BoxGeometry(.008, .008, .06), frameMat);
              grip.position.set(.502, modY + modH * .3, s * W * .07);
              rack.add(grip);
              // 狀態燈：每第四顆給琥珀，一整排才不會死板
              const led = new THREE.Mesh(ledGeo, i % 4 === 3 ? ledAmberMat : ledMat);
              led.position.set(.5, modY + modH * .16, -s * W * .06);
              rack.add(led);
              if (i < NMOD - 1) {                    // 模組間跳線，交錯左右
                  const jump = new THREE.Mesh(new THREE.CylinderGeometry(.005, .005, modGap + modH * .5, 5), cableMat);
                  jump.position.set(-.52, modY + modH * .5 + modGap * .5, s * (W * .12) + (i % 2 ? .012 : -.012));
                  rack.add(jump);
              }
          }
          interior.add(rack);
      });

      // 盡頭：控制櫃＋門縫＋斷路器排＋螢幕
      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(.14, H * .78, W * .32), MAT.shell);
      cabinet.position.set(-L / 2 + .12, -H * .04, 0);
      interior.add(cabinet);
      const cabDoorLine = new THREE.Mesh(new THREE.BoxGeometry(.004, H * .74, .006), frameMat);
      cabDoorLine.position.set(-L / 2 + .192, -H * .04, 0);
      interior.add(cabDoorLine);
      for (let i = 0; i < 6; i++) {
          const br = new THREE.Mesh(new THREE.BoxGeometry(.006, .018, .012), frameMat);
          br.position.set(-L / 2 + .193, -H * .26 + i * .03, W * .05);
          interior.add(br);
      }
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(.07, .05), ledMat);
      screen.rotation.y = Math.PI / 2;
      screen.position.set(-L / 2 + .2, H * .1, 0);   // 離櫃面 .01，貼死會 z-fighting
      interior.add(screen);

      // 消防：鋼瓶組＋管路＋噴頭（貨櫃式儲能的必備件）
      const bottleMat = new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: .55, metalness: .2 });
      [-1, 1].forEach(s => {
          const bottle = new THREE.Mesh(new THREE.CylinderGeometry(.026, .026, .18, 10), bottleMat);
          bottle.position.set(L / 2 - .16, -H * .36, s * W * .33);
          interior.add(bottle);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .03, 8), MAT.steel);
          cap.position.set(L / 2 - .16, -H * .25, s * W * .33);
          interior.add(cap);
      });
      const fireLine = new THREE.Mesh(new THREE.CylinderGeometry(.007, .007, L * .8, 6), bottleMat);
      fireLine.rotation.z = Math.PI / 2;
      fireLine.position.set(-.06, H * .37, W * .12);
      interior.add(fireLine);
      for (let i = 0; i < 4; i++) {
          const noz = new THREE.Mesh(new THREE.ConeGeometry(.009, .014, 6), MAT.steel);
          noz.rotation.x = Math.PI;
          noz.position.set(-L * .3 + i * (L * .6 / 3), H * .355, W * .12);
          interior.add(noz);
      }

      const aisleStrip = new THREE.Mesh(
          new THREE.BoxGeometry(L * .8, .012, .05),
          new THREE.MeshBasicMaterial({ color: '#35e0d2' }));
      aisleStrip.position.set(-.1, H * .455, 0);
      interior.add(aisleStrip);
      doorLight = new THREE.PointLight('#c8f2e8', 0, 3.2, 1.6);
      doorLight.position.set(L / 2 - .45, H * .18, 0);
      interior.add(doorLight);
      // 內裝與門不進線稿模式：buildWires() 會跳過帶 __nowire 的物件
      interior.traverse(o => { o.userData.__nowire = 1; });
      doorA.traverse(o => { o.userData.__nowire = 1; });
      doorB.traverse(o => { o.userData.__nowire = 1; });
      interiorRoot = interior;
      body.add(interior);

      const y0 = baseH + H / 2;

      // 底架：地板樑＋四支堆高機叉孔
      const base = cast(new THREE.Mesh(new THREE.BoxGeometry(L + .01, baseH, W + .01), MAT.dark));
      base.position.y = baseH / 2;
      g.add(base);
      [-1, 1].forEach(s => {
          const pocket = new THREE.Mesh(new THREE.BoxGeometry(.3, .045, .02), MAT.steel);
          pocket.position.set(s * .55, baseH * .55, W / 2 + .006);
          g.add(pocket);
          const pocket2 = pocket.clone();
          pocket2.position.z = -W / 2 - .006;
          g.add(pocket2);
      });

      // 八個角件：外凸一點才有真實貨櫃的塊狀轉角
      const cornerGeo = new THREE.BoxGeometry(.11, .105, .11);
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => [baseH + .052, baseH + H - .052].forEach(cy => {
          const cn = cast(new THREE.Mesh(cornerGeo, MAT.steel));
          cn.position.set(sx * (L / 2 - .005), cy, sz * (W / 2 - .005));
          g.add(cn);
      })));

      // 上下側樑
      [[y0 + H / 2 - .012, .03], [baseH + .02, .036]].forEach(([ry, rh]) => {
          [-1, 1].forEach(sz => {
              const r = new THREE.Mesh(new THREE.BoxGeometry(L - .2, rh, .028), MAT.steel);
              r.position.set(0, ry, sz * (W / 2 + .004));
              g.add(r);
          });
      });

      // 四支角柱：微凸的白色立柱，把每面門牆收出邊框
      const postGeo = new THREE.BoxGeometry(.055, H - .02, .055);
      [-1, 1].forEach(sx => [-1, 1].forEach(sz => {
          const post = cast(new THREE.Mesh(postGeo, MAT.shell));
          post.position.set(sx * (L / 2 - .008), y0, sz * (W / 2 - .008));
          g.add(post);
      }));

      // 鎖桿＋固定夾＋把手：位置來自 detectRods() 掃描結果。
      // 一支一個 Mesh 會爆 draw call（每櫃上百支件），全部改 InstancedMesh
      const placements = [];
      RODS.left.forEach(u => placements.push({ x: L / 2 - u * L, z: -W / 2 - .015, turn: 0 }));
      RODS.right.forEach(u => placements.push({ x: -L / 2 + u * L, z: W / 2 + .015, turn: 0 }));
      // front 面的鎖桿掛在門扇上（見端門段落），這裡不再鋪
      // 設備端只放沒被空調櫃遮住的範圍（櫃體佔 -Z 半側）
      RODS.rear.forEach(u => {
          const z = -W / 2 + u * W;
          if (z > W * .06) placements.push({ x: -L / 2 - .015, z, turn: 1 });
      });
      // 只放直立鎖桿本體：固定夾、把手這類小方塊近看太雜，拿掉
      if (placements.length) {
          const rodInst = new THREE.InstancedMesh(
              new THREE.CylinderGeometry(.0085, .0085, H - .1, 10), MAT.rod, placements.length);
          const dummy = new THREE.Object3D();
          placements.forEach((p, i) => {
              dummy.position.set(p.x, y0, p.z);
              dummy.updateMatrix();
              rodInst.setMatrixAt(i, dummy.matrix);
          });
          rodInst.castShadow = true;
          g.add(rodInst);
      }

      // 車頂：中央接縫壓條＋接縫正中央的小機箱（對齊設計稿 TOP VIEW）
      const seam = cast(new THREE.Mesh(new THREE.BoxGeometry(.05, .016, W - .05), MAT.shell));
      seam.position.set(0, baseH + H + .022, 0);
      g.add(seam);
      const roofBox = cast(new THREE.Mesh(new THREE.BoxGeometry(.2, .09, .16), MAT.shell));
      roofBox.position.set(0, baseH + H + .06, 0);
      const roofBoxLid = cast(new THREE.Mesh(new THREE.BoxGeometry(.17, .018, .13), MAT.steel));
      roofBoxLid.position.set(0, roofBox.position.y + .054, 0);
      g.add(roofBox, roofBoxLid);

      // 設備端大型空調櫃（設計稿 REAR VIEW 的主角）：
      // 佔 -Z 半側、近全高，頂部百葉、下方回風網、頂面向上抽風扇
      const cabW = W * .5, cabH = H * .9, cabD = .16;
      const cabZ = -W * .22;
      const cab = cast(new THREE.Mesh(new THREE.BoxGeometry(cabD, cabH, cabW), MAT.shell));
      cab.position.set(-L / 2 - cabD / 2, y0 + H * .01, cabZ);
      g.add(cab);
      const cabCap = cast(new THREE.Mesh(new THREE.BoxGeometry(cabD + .02, .022, cabW + .02), MAT.steel));
      cabCap.position.set(cab.position.x, cab.position.y + cabH / 2 + .011, cabZ);
      g.add(cabCap);
      const cabLouver = new THREE.Mesh(panelGeo(cabW * .86, cabH * .42, R.louver), MAT.container);
      cabLouver.rotation.y = -Math.PI / 2;
      cabLouver.position.set(-L / 2 - cabD - .002, cab.position.y + cabH * .24, cabZ);
      const cabGrille = new THREE.Mesh(panelGeo(cabW * .7, cabH * .2, R.louver), MAT.container);
      cabGrille.rotation.y = -Math.PI / 2;
      cabGrille.position.set(-L / 2 - cabD - .002, cab.position.y - cabH * .3, cabZ);
      const cabPanel = cast(new THREE.Mesh(new THREE.BoxGeometry(.02, .16, .14), MAT.steel));
      cabPanel.position.set(-L / 2 - cabD - .01, cab.position.y - cabH * .05, cabZ + cabW * .24);
      const cabFan = new THREE.Mesh(new THREE.CircleGeometry(cabW * .34, 32), MAT.container);
      mapUV(cabFan.geometry, R.fan);
      cabFan.rotation.x = -Math.PI / 2;
      cabFan.position.set(cab.position.x, cab.position.y + cabH / 2 + .024, cabZ);
      g.add(cabLouver, cabGrille, cabPanel, cabFan);

      // 側牆高掛設備櫃（設計稿 FRONT／TOP VIEW 突出側牆的那顆）：
      // 近設備端、上緣貼車頂線，與 -Z 半側的後端空調櫃分屬兩側。
      // 開口貼圖沿用主圖的百葉／風扇分區，跟畫好的設計稿同一套圖。
      const scW = .42, scH = .58, scD = .13;
      const scX = -L / 2 + .5;
      const scZ = W / 2 + scD / 2;
      const scY = baseH + H - scH / 2 - .04;
      const sideCab = cast(new THREE.Mesh(new THREE.BoxGeometry(scW, scH, scD), MAT.shell));
      sideCab.position.set(scX, scY, scZ);
      const sideCabCap = cast(new THREE.Mesh(new THREE.BoxGeometry(scW + .02, .018, scD + .015), MAT.steel));
      sideCabCap.position.set(scX, scY + scH / 2 + .009, scZ);
      g.add(sideCab, sideCabCap);
      const scGrille = new THREE.Mesh(panelGeo(scW * .8, scH * .3, R.louver), MAT.container);
      scGrille.position.set(scX, scY - scH * .28, scZ + scD / 2 + .002);
      g.add(scGrille);
      const scVent = new THREE.Mesh(panelGeo(scD * .72, scH * .5, R.louver), MAT.container);
      scVent.rotation.y = Math.PI / 2;
      scVent.position.set(scX + scW / 2 + .002, scY + scH * .08, scZ);
      g.add(scVent);
      const scFan = new THREE.Mesh(new THREE.CircleGeometry(.05, 24), MAT.container);
      mapUV(scFan.geometry, R.fan);
      scFan.rotation.y = -Math.PI / 2;
      scFan.position.set(scX - scW / 2 - .002, scY + scH * .12, scZ);
      g.add(scFan);

      return g;
  }

  // ── 展示基座 ────────────────────────────────────────────────
  function buildStage() {
      const g = new THREE.Group();
      const tex = MAT.ground.map.clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      // 每 2.6m 一張圖，跟其他幾支檔案同一個尺度
      tex.repeat.set(STAGE.radius * 2 / 2.6, STAGE.radius * 2 / 2.6);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .96, metalness: 0 });
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(STAGE.radius, STAGE.radius, .06, 96), mat);
      disc.position.y = .03;
      disc.receiveShadow = true;
      g.add(disc);
      // 外緣收一圈深色，圓盤才不會像浮在背景上
      const ring = new THREE.Mesh(
          new THREE.CylinderGeometry(STAGE.radius + .04, STAGE.radius + .04, .045, 96), MAT.kerb);
      ring.position.y = .0225;
      ring.receiveShadow = true;
      g.add(ring);
      return g;
  }



  // ══ Three.js 基礎 ═══════════════════════════════════════════
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, .05, 200);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvasHost.appendChild(renderer.domElement);
  scene.background = null;
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), .04).texture;

  const hemi = new THREE.HemisphereLight(0xffffff, 0xc9cec9, .5);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -2.6;
  sun.shadow.camera.right = sun.shadow.camera.top = 2.6;
  sun.shadow.camera.near = .5; sun.shadow.camera.far = 30;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = .012;
  const fill = new THREE.DirectionalLight(0xffffff, .55);
  scene.add(hemi, sun, sun.target, fill);

  const root = new THREE.Group();
  scene.add(root);

  let idleSpin = 0;   // 閒置自轉的累積角（時間驅動，與捲動無關）

  // 基準鏡頭：低仰角近地平線的產品視角（?v=true 面板調好後定案的值）
  const CAM = { azimuth: 34, elevation: 3.5, distance: 5.4, targetX: 0, targetY: .57, fov: 35.5 };
  const SUN = { azimuth: 40, elevation: 52, intensity: 1.35, fill: .45, ambient: .42, exposure: .95 };

  function applyCamera() {
    const az = THREE.MathUtils.degToRad(CAM.azimuth), el = THREE.MathUtils.degToRad(CAM.elevation);
    camera.position.set(
      CAM.targetX + CAM.distance * Math.cos(el) * Math.sin(az),
      CAM.targetY + CAM.distance * Math.sin(el),
      CAM.distance * Math.cos(el) * Math.cos(az));
    camera.lookAt(CAM.targetX, CAM.targetY, 0);
    camera.fov = CAM.fov; camera.updateProjectionMatrix();
  }

  function applySun() {
    const az = THREE.MathUtils.degToRad(SUN.azimuth), el = THREE.MathUtils.degToRad(SUN.elevation), r = 9;
    sun.position.set(r * Math.cos(el) * Math.sin(az), r * Math.sin(el), r * Math.cos(el) * Math.cos(az));
    sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld();
    sun.intensity = SUN.intensity;
    fill.position.set(-sun.position.x, sun.position.y * .6, -sun.position.z);
    fill.intensity = SUN.fill; hemi.intensity = SUN.ambient;
    renderer.toneMappingExposure = SUN.exposure;
  }

  // ══ 線稿模式 ════════════════════════════════════════════════
  const WIRE = { p: 0, lines: [], mats: new Set(), applied: -1 };
  const SPIN = { turns: 1 };
  const wireLineMat = new THREE.LineBasicMaterial({ color: 0x24312d, transparent: true, opacity: 0, depthWrite: false });
  const wireInstMat = new THREE.MeshBasicMaterial({ color: 0x24312d, wireframe: true, transparent: true, opacity: 0, depthWrite: false });
  let modelBB = null, model = null;

  function buildWires() {
    WIRE.lines.forEach(l => l.parent && l.parent.remove(l));
    WIRE.lines.length = 0; WIRE.mats.clear();
    model.traverse(o => {
      if (o.userData.__wire) return;
      // 門與內裝不畫線，但材質要跟著線稿轉場一起淡出（不然線稿殼裡
      // 會浮著一組實心電池架）；門在線稿段是關著的，輪廓由角柱邊線補
      if (o.userData.__nowire) {
        if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => WIRE.mats.add(m));
        return;
      }
      if (o.isInstancedMesh) {
        const wm = new THREE.InstancedMesh(o.geometry, wireInstMat, o.count);
        wm.instanceMatrix = o.instanceMatrix; wm.userData.__wire = 1; wm.visible = false;
        o.add(wm); WIRE.lines.push(wm);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => WIRE.mats.add(m));
      } else if (o.isMesh) {
        const line = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25), wireLineMat);
        line.userData.__wire = 1; line.visible = false;
        o.add(line); WIRE.lines.push(line);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => WIRE.mats.add(m));
      }
    });

    // 側牆是整片平面，EdgesGeometry 只會留外框，線稿模式中段一片空白；
    // 補上門縫直線與上下腰線（貼著牆面外推一點，避免跟牆面 z-fighting）
    const { L, H, W, baseH } = DIM;
    const pts = [];
    const seamN = 8;                                  // 側牆分成 8 扇門的直縫
    for (let i = 1; i < seamN; i++) {
      const x = -L / 2 + (L / seamN) * i;
      [-1, 1].forEach(s => pts.push(
        x, baseH + .03, s * (W / 2 + .004),
        x, baseH + H - .03, s * (W / 2 + .004)));
    }
    [-1, 1].forEach(sx => {                           // 門端／設備端也補一條中央直縫
      pts.push(sx * (L / 2 + .004), baseH + .03, 0,
               sx * (L / 2 + .004), baseH + H - .03, 0);
    });
    const seamGeo = new THREE.BufferGeometry();
    seamGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const seams = new THREE.LineSegments(seamGeo, wireLineMat);
    seams.userData.__wire = 1;
    seams.visible = false;
    model.add(seams);
    WIRE.lines.push(seams);
  }

  function applyWire(p, force) {
    if (!force && Math.abs(p - WIRE.applied) < .0005) return;
    WIRE.applied = p;
    const solid = 1 - Math.min(1, p * 1.06);
    WIRE.mats.forEach(m => { m.transparent = p > .001; m.opacity = solid; m.depthWrite = p < .85; });
    const a = Math.min(.85, p * 1.3);
    wireLineMat.opacity = a; wireInstMat.opacity = a;
    const show = p > .004;
    WIRE.lines.forEach(l => { l.visible = show; });
    sun.castShadow = p < .35;
  }

  function rebuild() {
    if (model) root.remove(model);
    model = new THREE.Group();
    if (STAGE.show) model.add(buildStage());
    model.add(buildContainer());
    root.add(model);
    // 不走線稿就不建邊線，省一份 EdgesGeometry（也要把上一版的殘留清掉）
    if (TUNE.wire) buildWires();
    else { WIRE.lines.forEach(l => l.parent && l.parent.remove(l)); WIRE.lines.length = 0; WIRE.mats.clear(); }
    const bb = new THREE.Box3().setFromObject(model);
    // 落地定位要用到三軸尺寸：斜角時投影寬度由 x／z 兩邊一起決定
    modelBB = {
      lenX: bb.max.x - bb.min.x, lenZ: bb.max.z - bb.min.z,
      cx: (bb.min.x + bb.max.x) / 2, cz: (bb.min.z + bb.max.z) / 2,
      bottom: bb.min.y
    };
    applyWire(WIRE.p, true);
  }

  // ══ 落地：縮進 city.png 的 ESS 槽位 ═════════════════════════
  // iw／ih 必須等於 images/city.png 的實際尺寸：這兩個值只用來重算 object-fit:contain
  // 之後圖在畫面上的位置，比例填錯的話落點會整個偏掉（曾經寫成 1580×600 → 貨櫃浮在半空）
  // ax／groundY／fw = 槽位的左右位置、地面線、寬度（都是圖片的比例 0～1）
  // fit＝底圖在畫布裡的縮放規則，必須跟 .bess-city 的 CSS 完全一致，
  // 否則貨櫃會對到一條「算出來的」地面線，而不是眼睛看到的那一條：
  //   'contain' object-fit:contain —— 長短邊都不裁，短邊留白
  //   'cover'   object-fit:cover   —— 填滿視窗，長邊裁掉
  //   'width'   只看寬度 —— 底圖永遠等寬、貼齊底部，高度多的往上裁、少的補天空。
  //             槽位與大小因此只跟視窗寬度有關，瀏覽器高度再怎麼變都不會位移。
  const CITY = { iw: 1672, ih: 941, ax: .451, groundY: .878, fw: .261, fit: 'contain' };
  Object.assign(CITY, opts.slot || {});   // 注意：opts.city 是底圖的 DOM，不要拿來傳數值
  const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const CAM0 = { az: CAM.azimuth, el: CAM.elevation, dist: CAM.distance };
  // 落地定位用的暫存向量（每幀重複使用，不要在迴圈裡 new）
  const camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
  const landPos = new THREE.Vector3(), landAnchor = new THREE.Vector3();
  const AXIS_Y = new THREE.Vector3(0, 1, 0);

  // 3D 編排只佔 section 的前一段（後面可能還接了卡片橫移），
  // 所以進度要除以「3D 段長度」而不是整個 section 高度。
  function sectionProgress() {
    const r = section.getBoundingClientRect();
    const span = typeof opts.d3Span === 'function'
      ? opts.d3Span()
      : (opts.d3Span || (r.height - innerHeight));
    return span <= 0 ? 0 : Math.min(1, Math.max(0, -r.top / span));
  }

  // 目標進度再做一層指數逼近：Lenis 已經把捲動位置磨順了，
  // 這層負責吸收捲動事件之間的細微鋸齒，讓旋轉與縮放的速度連續。
  let pSmooth = 0, pInit = false;

  // ── 三幕編排 ────────────────────────────────────────────────
  //  第一幕（hero-3d.html 的動作）：貨櫃轉一圈、
  //    收在門端朝鏡頭的展示角，兩扇艙門掀開、鏡頭輕推看進內裝。
  //  第二幕（核心設計，保留）：關門、再轉一圈回正，同時實體淡出成線稿。
  //  第三幕（保留）：線稿貨櫃縮進 city.png 的 ESS 槽位落地，交棒卡片。
  // 所有可調參數集中在 TUNE（?v=true 的調參面板直接綁這顆）。
  // 時間值都是 section 3D 段的進度（0～1）。
  const TUNE = {
    base: .5,             // 整體縮放（相對原始尺寸；落地縮放由此出發）
    idleSpeed: .0032,     // 閒置自轉速度（弧度/幀）
    doorYaw: .34,         // 門端展示角偏移（0=正對鏡頭，正值偏 3/4）
    doorStart: .06, doorLen: .26,     // 關門時間窗（開場門是全開的）
    rotSpan: .34,         // 關門後轉一圈回正所佔進度
    wire: 1,              // 1 = 實體淡出成線稿；0 = 全程維持實體（落地時就是實拍風格）
    wireStart: .52, wireLen: .22,     // 線稿轉場（同時也是鏡頭收位的時間窗）
    landStart: .7,  landLen: .25,     // 落地進 city 槽位
    // 落地時的鏡頭：預設收成正側視；給角度就會停在斜角（對齊 city.png 裡貨櫃的視角）
    landAz: 0, landEl: 0, landDist: 6.5,
    landScaleY: 1,        // 落地後的垂直拉伸（1 = 原比例；>1 會把側牆貼圖一起拉長）
    cityStart: .68, cityLen: .22,     // city 圖淡入
    uiFadeStart: .5, uiFadeLen: .14   // hero 式覆蓋層淡出
  };
  Object.assign(TUNE, opts.tune || {});
  function frame() {
    resize();               // 每幀先對一次尺寸，尺寸沒變就直接返回（見 resize 的說明）
    const target = sectionProgress();
    if (!pInit) { pSmooth = target; pInit = true; }
    pSmooth += (target - pSmooth) * .14;
    if (Math.abs(target - pSmooth) < .0004) pSmooth = target;
    const p = WIRE.p = pSmooth;

    // 第一幕：開場門就全開、內裝亮著（門端朝鏡頭的展示角）；
    // 往下捲，門先關上（doorStart→doorStart+doorLen）。
    // doorYawBase：門端（+x）朝鏡頭的 root yaw ≈ az−90°，加 doorYaw 偏 3/4。
    const doorYawBase = THREE.MathUtils.degToRad(CAM0.az - 90) + TUNE.doorYaw;
    setDoorsOpen(1 - sm((p - TUNE.doorStart) / TUNE.doorLen));

    // 閒置自轉：停著不捲時貨櫃持續慢轉（開著門的展示台）；
    // 一往下捲，閒置角就順向補到整圈（2π ≡ 0），永遠向前、不會倒轉，
    // 展示角與落地回正的對位都不受影響。
    const idleGate = 1 - sm((p - .04) / .28);
    idleSpin = (idleSpin + TUNE.idleSpeed * idleGate) % (Math.PI * 2);
    const idleOffset = idleSpin + (Math.PI * 2 - idleSpin) * (1 - idleGate);

    // 第二幕：關門後轉一圈回正（收在 2π ≡ 0 的正側視，落地對位），
    // 同時實體 → 線稿（核心設計）。
    applyWire(TUNE.wire ? sm((p - TUNE.wireStart) / TUNE.wireLen) : 0);
    const turn = sm((p - TUNE.doorStart - TUNE.doorLen) / TUNE.rotSpan);
    root.rotation.y = doorYawBase + turn * (Math.PI * 2 - doorYawBase) + idleOffset;

    // 鏡頭：基準視角維持到轉場段，再收到落地視角（TUNE.landAz／landEl）
    const e1 = sm((p - TUNE.wireStart) / (TUNE.wireLen + .02));
    CAM.azimuth = CAM0.az + (TUNE.landAz - CAM0.az) * e1;
    CAM.elevation = CAM0.el + (TUNE.landEl - CAM0.el) * e1;
    CAM.distance = CAM0.dist + (TUNE.landDist - CAM0.dist) * e1;
    applyCamera();

    // 第三幕：縮進 city 槽位落地。
    // 位移沿「鏡頭的右／上向量」算，不是世界 x／y —— 斜角鏡頭下才對得準。
    const e2 = sm((p - TUNE.landStart) / TUNE.landLen);
    if (e2 > 0 && modelBB) {
      // 尺寸一律取 resize() 記下的那組（＝相機投影當下用的那組）。
      // 直接讀 clientWidth/Height 的話，會出現「換算用新尺寸、投影還是舊尺寸」
      // 的半拍不同步，貨櫃就浮在半空或陷進地面。
      const vw = viewW, vh = viewH;
      const s = CITY.fit === 'width' ? vw / CITY.iw
              : CITY.fit === 'cover' ? Math.max(vw / CITY.iw, vh / CITY.ih)
              :                        Math.min(vw / CITY.iw, vh / CITY.ih);
      const dw = CITY.iw * s, dh = CITY.ih * s;
      const slotPx = (vw - dw) / 2 + CITY.ax * dw;
      // 垂直用 bottom 對齊（跟 CSS 的 object-position: center bottom 同一套規則）：
      // 視窗比圖高時留白全在上方，地面線貼著視窗底部，貨櫃才落得到地
      const slotPy = (vh - dh) + CITY.groundY * dh;
      const wpp = 2 * CAM.distance * Math.tan(THREE.MathUtils.degToRad(CAM.fov) / 2) / vh;

      // 投影寬度：斜角時看到的是長邊與短邊的合成，用它換算才會剛好塞滿槽位寬
      const a = root.rotation.y - THREE.MathUtils.degToRad(CAM.azimuth);
      const projW = Math.abs(modelBB.lenX * Math.cos(a)) + Math.abs(modelBB.lenZ * Math.sin(a));
      const sc = TUNE.base + ((CITY.fw * dw * wpp) / projW - TUNE.base) * e2;
      const sy = sc * (1 + (TUNE.landScaleY - 1) * e2);    // 垂直拉伸只在落地段生效
      root.scale.set(sc, sy, sc);

      camera.updateMatrixWorld();
      camRight.setFromMatrixColumn(camera.matrixWorld, 0);
      camUp.setFromMatrixColumn(camera.matrixWorld, 1);
      const dx = (slotPx - vw / 2) * wpp, dy = -(slotPy - vh / 2) * wpp;
      // 槽位的世界座標
      landPos.set(CAM.targetX, CAM.targetY, 0)
        .addScaledVector(camRight, dx).addScaledVector(camUp, dy);
      // 扣掉模型自身的錨點（底面中心）在旋轉縮放後的偏移，貨櫃才會「腳踩」在槽位上
      landAnchor.set(modelBB.cx * sc, modelBB.bottom * sy, modelBB.cz * sc)
        .applyAxisAngle(AXIS_Y, root.rotation.y);
      root.position.copy(landPos).sub(landAnchor).multiplyScalar(e2);
    } else {
      root.scale.setScalar(TUNE.base); root.position.set(0, 0, 0);
    }

    if (cityEl) cityEl.style.opacity = sm((p - TUNE.cityStart) / TUNE.cityLen).toFixed(3);
    // hero 式覆蓋層（大標／散落標籤／清單）在線稿轉場前淡出
    if (titleEl) titleEl.style.opacity = (1 - sm((p - TUNE.uiFadeStart) / TUNE.uiFadeLen)).toFixed(3);

    renderer.render(scene, camera);
  }

  // 畫布尺寸的唯一來源。落地換算用的 vh 與相機投影用的 vh 必須是同一個值，
  // 所以尺寸只在這裡更新，frame() 每幀先呼叫一次（沒變就立刻返回）。
  // 光靠 window 的 resize 事件不夠：書籤列開合、開發者工具、行動版網址列
  // 收合、側欄推擠都會改變 host 高度卻不見得發事件，一旦 renderer／相機
  // 停在舊尺寸，貨櫃就會浮在地面上方或陷進地面。
  let viewW = 0, viewH = 0;
  function resize() {
    const w = canvasHost.clientWidth || 1, h = canvasHost.clientHeight || 1;
    if (w === viewW && h === viewH) return;
    viewW = w; viewH = h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // updateStyle=false：畫布的顯示尺寸交給 CSS 的 100%/100%，
    // 這樣即使某一幀來不及重設，畫布也永遠貼齊 host，不會整層位移
    renderer.setSize(w, h, false);
  }

  // ══ 啟動 ════════════════════════════════════════════════════
  // flipY 一定要是 true（跟 3d-bess-container.html 一致）：
  // uvRect 的 v 是從圖片底部量的，flipY=false 會讓整張圖上下顛倒、分區互換
  const loader = new THREE.TextureLoader();
  const load = f => new Promise(ok => loader.load(TEX_DIR + f, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = true; ok(t);
  }, undefined, () => ok(null)));

  (async () => {
    const [tc, tg, td] = await Promise.all([
      load(TEX_FILES.container), load(TEX_FILES.ground), load(TEX_FILES.detail)]);
    // CanvasTexture 的 flipY 預設就是 true，跟上面的 load() 同向
    let ground = tg;
    if (!ground) {
      ground = new THREE.CanvasTexture(bakeGround());
      ground.colorSpace = THREE.SRGBColorSpace;
    }
    let cont = tc;
    if (!cont) {
      const c = document.createElement('canvas'); c.width = c.height = ATLAS;
      cont = new THREE.CanvasTexture(c); cont.colorSpace = THREE.SRGBColorSpace;
    }
    // 細節圖：手繪的 Detail_baseColor.jpg 還沒放進資料夾前，先用程序化底稿頂著
    let detail = td;
    if (!detail) {
      detail = new THREE.CanvasTexture(bakeDetail());
      detail.colorSpace = THREE.SRGBColorSpace;
    }
    if (tc && tc.image) {
      try {
        RODS = {
          left: detectRods(tc.image, R.left), right: detectRods(tc.image, R.right),
          front: detectRods(tc.image, R.front), rear: detectRods(tc.image, R.rear)
        };
      } catch (e) { /* 掃描失敗就用空陣列，鎖桿少畫但不影響其他部分 */ }
    }
    makeMaterials(cont, ground, detail);
    rebuild(); applyCamera(); applySun(); resize(); frame();
    section.classList.add('is-ready');
  })();

  // host 的尺寸只要一變就立刻重畫，不必等下一次捲動（停在落地畫面調整
  // 視窗高度時，沒有這一段就會維持舊構圖直到使用者再捲一下）
  const onResize = () => { resize(); frame(); };
  addEventListener('resize', onResize);
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvasHost);
  return { frame, resize, scene, camera, renderer, root, CAM, CAM0, SUN, CITY, WIRE, SPIN, TUNE, rebuild, applyWire, applySun, setDoorsOpen, doors };
}
