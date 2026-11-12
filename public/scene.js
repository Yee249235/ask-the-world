// 雾窗：窗外的景色跟着真实的天气、时间和季节变化
//   天气：晴 / 多云 / 雾 / 小雨 / 雨 / 雷雨 / 雪
//   时间：白天 / 黄昏（日出日落前后）/ 夜晚
//   季节：春（花瓣）/ 夏（绿叶、阳光里的浮尘）/ 秋（枫叶）/ 冬（枯枝，下雪时枝头积雪）
// 玻璃上：下雨时有水雾、水珠、滑落的水痕；下雪时边角结霜；晴天是透过玻璃的柔和光束
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const root = document.documentElement;

  const cv = document.createElement("canvas");
  cv.id = "rain";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");
  const mk = () => document.createElement("canvas");
  const bg = mk(), plants = mk(), fog = mk(), beams = mk(), land = mk();
  const lx = land.getContext("2d");
  const bgx = bg.getContext("2d"), px = plants.getContext("2d"), fx = fog.getContext("2d"), bx = beams.getContext("2d");

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];
  const mix = (a, b, t) => {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [p(a), p(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  };

  // ---------- 状态 ----------
  const S = { weather: "rain", time: "day", dusk: 0, season: seasonOf(new Date().getMonth(), 35), real: null };
  // 开窗：0 = 关着（隔着玻璃），1 = 完全打开（看清窗外）
  let openK = 0, openTarget = 0, streaks = [];
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, t0 = performance.now();
  let drops = [], runners = [], flakes = [], sprite = null, flash = 0;

  function seasonOf(month, lat = 35) {
    let m = month; // 0-11
    if (lat < 0) m = (m + 6) % 12; // 南半球季节相反
    if (m >= 2 && m <= 4) return "spring";
    if (m >= 5 && m <= 7) return "summer";
    if (m >= 8 && m <= 10) return "autumn";
    return "winter";
  }

  // 根据日出日落算出：白天 / 黄昏程度 / 夜晚
  function timeOf(now, sunrise, sunset) {
    const h = now.getHours() + now.getMinutes() / 60;
    const toH = (s, d) => { const m = /T(\d+):(\d+)/.exec(s || ""); return m ? +m[1] + m[2] / 60 : d; };
    const rise = toH(sunrise, 6), set = toH(sunset, 17.5);
    const dist = Math.min(Math.abs(h - rise), Math.abs(h - set));
    const night = h < rise - 0.4 || h > set + 0.4;
    const dusk = Math.max(0, 1 - dist / 1.1); // 日出日落前后一小时左右
    return { time: night ? "night" : dusk > 0.35 ? "dusk" : "day", dusk };
  }

  const wet = () => ["rain", "drizzle", "storm"].includes(S.weather);
  const isNight = () => S.time === "night";

  // ---------- 一颗水珠的贴图 ----------
  function makeSprite() {
    const s = mk(); s.width = s.height = 64;
    const g = s.getContext("2d");
    const grad = g.createRadialGradient(25, 23, 1, 32, 33, 30);
    const night = isNight();
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.16, night ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)");
    grad.addColorStop(0.55, night ? "rgba(180,200,255,0.10)" : "rgba(255,255,255,0.12)");
    grad.addColorStop(0.86, night ? "rgba(0,0,0,0.45)" : "rgba(40,55,80,0.38)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad; g.beginPath(); g.ellipse(32, 33, 30, 31, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = night ? "rgba(255,220,170,0.35)" : "rgba(255,255,255,0.5)";
    g.beginPath(); g.ellipse(34, 52, 10, 4, 0, 0, Math.PI * 2); g.fill();
    return s;
  }

  // ---------- 窗外的天空和远景 ----------
  function skyColors() {
    const w = S.weather, n = isNight();
    if (n) {
      if (w === "clear") return ["#070d1e", "#101a33", "#1c2140"];
      if (w === "snow") return ["#121a2c", "#1d2638", "#2a3142"];
      return ["#0a1020", "#121a30", "#231d2c"];
    }
    const base = {
      clear: ["#8fbfe6", "#cfe4f0", "#f6ead6"],
      cloudy: ["#aebbc8", "#d0d6dc", "#e6e1da"],
      fog: ["#d3d8dc", "#dfe2e4", "#e6e5e2"],
      drizzle: ["#a9b7c5", "#cad1d8", "#d9d3cb"],
      rain: ["#97a8ba", "#bec8d3", "#d2ccc5"],
      storm: ["#6f7d8d", "#8f99a6", "#a7a39f"],
      snow: ["#c7d2de", "#e5ebf1", "#f5f7f9"],
    }[w];
    if (S.time !== "dusk" && S.dusk < 0.2) return base;
    // 黄昏：地平线染上橘色和粉色
    const k = Math.min(1, S.dusk) * (w === "clear" ? 0.85 : 0.45);
    return [mix(base[0], "#7d86b8", k * 0.6), mix(base[1], "#f0b088", k), mix(base[2], "#f7c28a", k)];
  }

  function paintScene() {
    bg.width = W; bg.height = H;
    const [c0, c1, c2] = skyColors();
    const g = bgx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c0); g.addColorStop(0.55, c1); g.addColorStop(1, c2);
    bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
    const n = isNight(), w = S.weather;

    bgx.filter = `blur(${Math.round(24 * dpr)}px)`;
    // 太阳 / 月亮的光晕
    if (w === "clear" || (w === "cloudy" && !n)) {
      const sx = W * 0.78, sy = H * (S.time === "dusk" ? 0.55 : 0.16);
      const r = Math.max(W, H) * (n ? 0.18 : 0.45);
      const sg = bgx.createRadialGradient(sx, sy, 0, sx, sy, r);
      sg.addColorStop(0, n ? "rgba(220,230,255,0.55)" : S.time === "dusk" ? "rgba(255,190,120,0.9)" : "rgba(255,246,222,0.95)");
      sg.addColorStop(1, "rgba(255,255,255,0)");
      bgx.filter = "none"; bgx.fillStyle = sg; bgx.fillRect(0, 0, W, H);
      bgx.filter = `blur(${Math.round(24 * dpr)}px)`;
    }
    // 远处的建筑和树
    for (let i = 0; i < 7; i++) {
      bgx.globalAlpha = n ? 0.4 : w === "fog" ? 0.12 : 0.26;
      bgx.fillStyle = n ? pick(["#1d2a4a", "#2a2140", "#14304a"]) : pick(["#8ea3b8", "#9fb09a", "#9aa6be", "#b7a99a"]);
      bgx.fillRect(rand(-W * 0.1, W), rand(H * 0.45, H * 0.8), rand(W * 0.12, W * 0.4), H);
    }
    // 云
    if (["cloudy", "rain", "drizzle", "storm", "snow"].includes(w) && !n) {
      for (let i = 0; i < 9; i++) {
        bgx.globalAlpha = rand(0.25, 0.55);
        bgx.fillStyle = w === "storm" ? "#cfd3d8" : "#ffffff";
        bgx.beginPath(); bgx.ellipse(rand(0, W), rand(0, H * 0.4), rand(60, 160) * dpr, rand(25, 60) * dpr, 0, 0, Math.PI * 2); bgx.fill();
      }
    }
    // 夜里窗外的灯
    if (n) {
      const lights = ["#f2b45a", "#ff8f6b", "#5fc7c0", "#8aa2ff", "#f7d38a", "#ff6f91"];
      const cnt = Math.round((W * H) / (wet() ? 14000 : 22000) / (dpr * dpr));
      for (let i = 0; i < cnt; i++) {
        bgx.globalAlpha = rand(0.35, 0.85); bgx.fillStyle = pick(lights);
        bgx.beginPath(); bgx.arc(rand(0, W), rand(H * 0.3, H), rand(8, 40) * dpr, 0, Math.PI * 2); bgx.fill();
      }
    } else if (wet() || w === "cloudy") {
      // 白天雨天：街上的颜色被雨打散成光斑
      const lights = ["#ffffff", "#f6d7a8", "#9fc3dc", "#b7d8c6", "#efb8ab"];
      for (let i = 0; i < 18; i++) {
        bgx.globalAlpha = rand(0.25, 0.6); bgx.fillStyle = pick(lights);
        bgx.beginPath(); bgx.arc(rand(0, W), rand(H * 0.35, H), rand(10, 40) * dpr, 0, Math.PI * 2); bgx.fill();
      }
    }
    bgx.filter = "none"; bgx.globalAlpha = 1;
    // 晴朗的夜里有几颗星
    if (n && w === "clear") {
      for (let i = 0; i < 70; i++) {
        bgx.globalAlpha = rand(0.3, 0.9); bgx.fillStyle = "#fff";
        bgx.beginPath(); bgx.arc(rand(0, W), rand(0, H * 0.5), rand(0.4, 1.3) * dpr, 0, Math.PI * 2); bgx.fill();
      }
      bgx.globalAlpha = 1;
    }
  }

  // ---------- 开窗后看到的清晰风景：一层层的远山和森林 ----------
  function ridge(g, baseY, amp, color, seed, rough) {
    g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 6 * dpr) {
      const t = x / W;
      const y = baseY - amp * (0.55 * Math.sin(t * 3.1 + seed) + 0.3 * Math.sin(t * 7.3 + seed * 2.1) + rough * 0.15 * Math.sin(t * 23 + seed * 5));
      g.lineTo(x, y);
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  const TREE = {
    spring: ["#3f6b3a", "#557d45", "#e8a9bb", "#f3c6d2"],
    summer: ["#24502a", "#2f6331", "#3d7a3a", "#1d4424"],
    autumn: ["#b8402a", "#d9622b", "#e8913a", "#7a4a2a", "#3e5a32"],
    winter: ["#2f3d3a", "#3a4745", "#4a5450"],
  };
  function paintLand() {
    land.width = W; land.height = H;
    const [c0, c1, c2] = skyColors();
    const g = lx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, c0); g.addColorStop(0.5, c1); g.addColorStop(1, c2);
    lx.fillStyle = g; lx.fillRect(0, 0, W, H);
    const n = isNight(), w = S.weather;
    // 日、月、星
    if (n && w === "clear") {
      for (let i = 0; i < 160; i++) { lx.globalAlpha = rand(0.3, 1); lx.fillStyle = "#fff"; lx.beginPath(); lx.arc(rand(0, W), rand(0, H * 0.55), rand(0.4, 1.4) * dpr, 0, Math.PI * 2); lx.fill(); }
      lx.globalAlpha = 1;
      const mx = W * 0.74, my = H * 0.17, mr = 20 * dpr;
      const mg = lx.createRadialGradient(mx, my, mr * 0.5, mx, my, mr * 6); mg.addColorStop(0, "rgba(240,236,220,0.35)"); mg.addColorStop(1, "rgba(240,236,220,0)");
      lx.fillStyle = mg; lx.fillRect(0, 0, W, H); lx.fillStyle = "#f3efe2"; lx.beginPath(); lx.arc(mx, my, mr, 0, Math.PI * 2); lx.fill();
    } else if (!n && (w === "clear" || w === "cloudy")) {
      const sx = W * 0.72, sy = H * (S.time === "dusk" ? 0.42 : 0.16), sr = 26 * dpr;
      const sg = lx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 9);
      sg.addColorStop(0, S.time === "dusk" ? "rgba(255,190,120,0.75)" : "rgba(255,248,225,0.8)"); sg.addColorStop(1, "rgba(255,255,255,0)");
      lx.fillStyle = sg; lx.fillRect(0, 0, W, H);
      lx.fillStyle = S.time === "dusk" ? "#ffd2a0" : "#fffaf0"; lx.beginPath(); lx.arc(sx, sy, sr, 0, Math.PI * 2); lx.fill();
    }
    // 云
    if (w !== "clear" || !n) {
      lx.filter = `blur(${Math.round(10 * dpr)}px)`;
      const cc = w === "clear" ? 3 : w === "cloudy" ? 8 : 12;
      for (let i = 0; i < cc; i++) {
        lx.globalAlpha = n ? 0.15 : w === "storm" ? 0.55 : rand(0.35, 0.7);
        lx.fillStyle = n ? "#3a4560" : w === "storm" ? "#7d8794" : "#ffffff";
        lx.beginPath(); lx.ellipse(rand(0, W), rand(H * 0.05, H * 0.35), rand(70, 180) * dpr, rand(18, 45) * dpr, 0, 0, Math.PI * 2); lx.fill();
      }
      lx.filter = "none"; lx.globalAlpha = 1;
    }
    // 远山：越远越淡，带一点空气的颜色
    const mtn = n ? ["#1b2540", "#16203a", "#111a30", "#0c1426"] : S.season === "winter" || w === "snow" ? ["#a9b6c6", "#8f9db0", "#76869a", "#5e6e82"] : ["#8fa3b8", "#728aa0", "#5a7287", "#435b6e"];
    for (let i = 0; i < 4; i++) {
      const haze = w === "fog" ? 0.75 : wet() ? 0.45 : 0.25;
      ridge(lx, H * (0.42 + i * 0.08), H * (0.13 - i * 0.02), mix(mtn[i], c2, haze * (1 - i * 0.22)), i * 1.7 + 0.5, i);
      if (!n && (S.season === "winter" || w === "snow") && i < 2) { // 远山顶上的雪
        lx.save(); lx.globalCompositeOperation = "source-atop"; lx.fillStyle = "rgba(255,255,255,0.55)"; lx.fillRect(0, 0, W, H * (0.36 + i * 0.08)); lx.restore();
      }
    }
    // 近处的森林
    const pal = TREE[S.season];
    const baseY = H * 0.82;
    for (let x = -20 * dpr; x < W + 20 * dpr; x += rand(10, 22) * dpr) {
      const h = rand(50, 120) * dpr, y = baseY + rand(-10, 30) * dpr;
      let c = pick(pal); if (n) c = mix(c, "#070b16", 0.75); else if (w === "fog") c = mix(c, c2, 0.5); else if (wet()) c = mix(c, c2, 0.2);
      lx.fillStyle = c;
      if (S.season === "autumn" || S.season === "spring") { // 阔叶树：圆圆的树冠
        lx.beginPath(); lx.ellipse(x, y - h * 0.55, h * 0.32, h * 0.45, 0, 0, Math.PI * 2); lx.fill();
        lx.fillRect(x - 2 * dpr, y - h * 0.2, 4 * dpr, h * 0.2 + H);
      } else { // 松树
        lx.beginPath(); lx.moveTo(x, y - h); lx.lineTo(x + h * 0.28, y); lx.lineTo(x - h * 0.28, y); lx.closePath(); lx.fill();
        if (S.season === "winter" && !n) { lx.fillStyle = "rgba(255,255,255,0.7)"; lx.beginPath(); lx.moveTo(x, y - h); lx.lineTo(x + h * 0.1, y - h * 0.65); lx.lineTo(x - h * 0.1, y - h * 0.65); lx.closePath(); lx.fill(); }
      }
    }
    lx.fillStyle = n ? "#060a14" : mix(pal[0], "#1a2418", 0.5);
    lx.fillRect(0, baseY + 20 * dpr, W, H);
    // 雾和雨天的山间云雾
    if (w === "fog" || wet()) {
      const fg = lx.createLinearGradient(0, H * 0.45, 0, H * 0.85);
      fg.addColorStop(0, "rgba(255,255,255,0)"); fg.addColorStop(0.5, n ? "rgba(120,130,160,0.18)" : `rgba(240,242,245,${w === "fog" ? 0.55 : 0.3})`); fg.addColorStop(1, "rgba(255,255,255,0)");
      lx.fillStyle = fg; lx.fillRect(0, 0, W, H);
    }
  }
  function seedStreaks() {
    streaks = [];
    if (!wet()) return;
    const n = S.weather === "drizzle" ? 70 : S.weather === "storm" ? 220 : 140;
    for (let i = 0; i < n; i++) streaks.push({ x: rand(0, W), y: rand(0, H), l: rand(10, 24) * dpr, v: rand(12, 20) * dpr });
  }

  // ---------- 窗外的植物（跟着季节换） ----------
  const PALETTE = {
    spring: { branch: "#5b4636", leaf: ["#f6c1cf", "#f9dbe3", "#fbe9ee", "#e7a5b8"], leafy: 0.9 },
    summer: { branch: "#3f4a2c", leaf: ["#4f8a3a", "#6aa84f", "#2f6b2a", "#88b864"], leafy: 1 },
    autumn: { branch: "#4a3527", leaf: ["#d9622b", "#e8913a", "#b8402a", "#f2b84b", "#c9532a"], leafy: 0.8 },
    winter: { branch: "#4b4440", leaf: ["#9b7b5a", "#8a6d50"], leafy: 0.08 },
  };
  function leaf(g, x, y, size, ang, color) {
    g.save(); g.translate(x, y); g.rotate(ang); g.fillStyle = color;
    g.beginPath(); g.moveTo(0, -size); g.quadraticCurveTo(size * 0.7, 0, 0, size); g.quadraticCurveTo(-size * 0.7, 0, 0, -size); g.fill();
    g.restore();
  }
  function branch(g, x, y, ang, len, width, depth, pal) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.strokeStyle = pal.branch; g.lineWidth = width; g.lineCap = "round";
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + rand(-8, 8) * dpr, (y + y2) / 2 + rand(-8, 8) * dpr, x2, y2); g.stroke();
    const leaves = Math.round((depth < 2 ? 9 : 4) * pal.leafy);
    for (let i = 0; i < leaves; i++) {
      const t = Math.random();
      leaf(g, x + (x2 - x) * t + rand(-14, 14) * dpr, y + (y2 - y) * t + rand(-14, 14) * dpr, rand(5, 11) * dpr, rand(0, Math.PI * 2), pick(pal.leaf));
    }
    if (S.season === "winter" && S.weather === "snow") { // 枝头积雪
      g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = Math.max(1, width * 0.5);
      g.beginPath(); g.moveTo(x, y - width * 0.4); g.lineTo(x2, y2 - width * 0.4); g.stroke();
    }
    if (depth <= 0) return;
    const n = depth > 2 ? 2 : 3;
    for (let i = 0; i < n; i++) branch(g, x2, y2, ang + rand(-0.75, 0.75), len * rand(0.55, 0.78), Math.max(1, width * 0.65), depth - 1, pal);
  }
  function paintPlants() {
    plants.width = W; plants.height = H;
    if (S.weather === "fog") return; // 大雾里看不见
    const pal = PALETTE[S.season];
    px.save();
    px.filter = `blur(${Math.round(2.2 * dpr)}px)`;
    px.globalAlpha = isNight() ? 0.35 : 0.85;
    // 左上角伸进来的树枝
    branch(px, -10 * dpr, H * 0.06, 0.35, Math.min(W, H) * 0.32, 9 * dpr, 4, pal);
    // 右下角的一丛
    branch(px, W + 10 * dpr, H * 0.88, Math.PI + 0.45, Math.min(W, H) * 0.28, 8 * dpr, 4, pal);
    px.restore();
    if (isNight()) { // 夜里植物是暗的剪影
      px.globalCompositeOperation = "source-atop"; px.fillStyle = "rgba(8,12,24,0.55)"; px.fillRect(0, 0, W, H);
      px.globalCompositeOperation = "source-over";
    }
  }

  // ---------- 晴天透过玻璃的光束 ----------
  function paintBeams() {
    beams.width = W; beams.height = H;
    if (!(S.weather === "clear" && !isNight())) return;
    bx.filter = `blur(${Math.round(18 * dpr)}px)`;
    const warm = S.time === "dusk" ? "255,200,140" : "255,244,220";
    for (let i = 0; i < 4; i++) {
      const x = W * (0.3 + i * 0.2);
      const g = bx.createLinearGradient(x, 0, x - W * 0.5, H);
      g.addColorStop(0, `rgba(${warm},0.32)`); g.addColorStop(1, `rgba(${warm},0)`);
      bx.fillStyle = g;
      bx.beginPath(); bx.moveTo(x, -10); bx.lineTo(x + W * 0.08, -10); bx.lineTo(x - W * 0.35, H); bx.lineTo(x - W * 0.5, H); bx.closePath(); bx.fill();
    }
    bx.filter = "none";
  }

  // ---------- 玻璃上的雾 ----------
  const fogAmount = () => ({ rain: 0.6, drizzle: 0.48, storm: 0.66, fog: 0.8, snow: 0.3, cloudy: 0.12, clear: 0 }[S.weather] ?? 0);
  const fogColor = (a) => (isNight() ? `rgba(30,38,60,${a})` : `rgba(245,248,252,${a})`);
  function paintFog() {
    fog.width = W; fog.height = H;
    const a = fogAmount();
    if (a) { fx.fillStyle = fogColor(a); fx.fillRect(0, 0, W, H); }
    if (S.weather === "snow") { // 冬天玻璃四角结霜
      for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
        const g = fx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W, H) * 0.45);
        g.addColorStop(0, "rgba(255,255,255,0.7)"); g.addColorStop(1, "rgba(255,255,255,0)");
        fx.fillStyle = g; fx.fillRect(0, 0, W, H);
      }
    }
  }

  // ---------- 水珠 ----------
  const addDrop = (x = rand(0, W), y = rand(0, H), r = Math.pow(Math.random(), 2.2) * 3.6 * dpr + 0.8 * dpr) => drops.push({ x, y, r });
  function seedGlass() {
    drops = []; runners = [];
    const base = (W * H) / (3200 * dpr * dpr);
    const n = Math.min(320, Math.round(base * ({ rain: 1, storm: 1.2, drizzle: 0.7, cloudy: 0.12, fog: 0.25 }[S.weather] || 0)));
    for (let i = 0; i < n; i++) addDrop();
  }
  function seedFlakes() {
    flakes = [];
    const w = S.weather, n = isNight();
    let kind = null, count = 0;
    if (w === "snow") { kind = "snow"; count = 90; }
    else if (!wet() && w !== "fog" && !n) {
      if (S.season === "spring") { kind = "petal"; count = 16; }
      else if (S.season === "autumn") { kind = "leaf"; count = 9; }
      else if (w === "clear") { kind = "mote"; count = 26; }
    }
    for (let i = 0; i < count; i++) flakes.push(newFlake(kind, true));
  }
  function newFlake(kind, anywhere) {
    const f = { kind, x: rand(0, W), y: anywhere ? rand(0, H) : -20 * dpr, r: rand(1, 3.5) * dpr, a: rand(0, 6.28), spin: rand(-0.02, 0.02), vy: 0, vx: 0 };
    if (kind === "snow") { f.vy = rand(0.25, 0.8) * dpr; f.vx = rand(-0.2, 0.2) * dpr; }
    if (kind === "petal") { f.vy = rand(0.3, 0.7) * dpr; f.vx = rand(0.2, 0.6) * dpr; f.r = rand(3, 5) * dpr; f.c = pick(PALETTE.spring.leaf); }
    if (kind === "leaf") { f.vy = rand(0.4, 0.9) * dpr; f.vx = rand(-0.3, 0.3) * dpr; f.r = rand(5, 8) * dpr; f.c = pick(PALETTE.autumn.leaf); }
    if (kind === "mote") { f.vy = rand(-0.12, -0.03) * dpr; f.vx = rand(-0.05, 0.08) * dpr; f.r = rand(0.8, 2) * dpr; if (!anywhere) f.y = H + 10; }
    return f;
  }

  function spawnRunner() {
    const big = drops.filter((d) => d.r > 2 * dpr);
    let x, y, r;
    if (big.length && Math.random() < 0.7) { const d = pick(big); drops.splice(drops.indexOf(d), 1); ({ x, y } = d); r = d.r * 1.6; }
    else { x = rand(0, W); y = rand(-20, H * 0.4); r = rand(3.5, 6.5) * dpr; }
    runners.push({ x, y, r, vy: 0, wob: rand(0, 6.28), lastTrail: y, stall: 0 });
  }

  function step(dt) {
    const w = S.weather;
    // 新雨点、滑落的水珠
    if (wet()) {
      const rate = (W * H) / 9e5 * (w === "drizzle" ? 0.5 : w === "storm" ? 1.6 : 1);
      for (let i = 0; i < rate * dt * 0.06; i++) if (drops.length < 400) addDrop();
      const maxRun = Math.max(2, W / (140 * dpr)) * (w === "drizzle" ? 0.5 : w === "storm" ? 1.6 : 1);
      if (runners.length < maxRun && Math.random() < (w === "storm" ? 0.04 : 0.02) * dt / 16) spawnRunner();
      if (w === "storm" && Math.random() < 0.0015 * dt / 16) flash = 1; // 偶尔一道闪电
    }
    // 水雾慢慢回来
    const a = fogAmount();
    if (a) { fx.globalCompositeOperation = "source-over"; fx.fillStyle = fogColor(0.003 * dt / 16 * (a / 0.6)); fx.fillRect(0, 0, W, H); }
    fx.globalCompositeOperation = "destination-out";
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i];
      if (r.stall > 0) { r.stall -= dt; continue; }
      r.vy = Math.min(r.vy + 0.012 * dt * (r.r / (4 * dpr)), 0.9 * dpr * (r.r / (4 * dpr)) + 0.2);
      if (Math.random() < 0.004) r.stall = rand(150, 600);
      const ny = r.y + r.vy * dt / 4; r.wob += 0.05;
      const nx = r.x + Math.sin(r.wob) * 0.25 * dpr;
      if (a) { fx.lineCap = "round"; fx.lineWidth = r.r * 1.7; fx.strokeStyle = "rgba(0,0,0,0.9)"; fx.beginPath(); fx.moveTo(r.x, r.y); fx.lineTo(nx, ny); fx.stroke(); }
      r.x = nx; r.y = ny;
      for (let j = drops.length - 1; j >= 0; j--) {
        const d = drops[j];
        if (Math.abs(d.y - r.y) < r.r + d.r && Math.abs(d.x - r.x) < r.r + d.r) { drops.splice(j, 1); r.r = Math.min(r.r + d.r * 0.08, 8 * dpr); }
      }
      if (r.y - r.lastTrail > rand(10, 26) * dpr) { addDrop(r.x + rand(-1, 1) * dpr, r.y - r.r * 1.2, r.r * rand(0.22, 0.38)); r.lastTrail = r.y; r.r *= 0.985; }
      if (r.y - r.r > H || r.r < 1.5 * dpr) runners.splice(i, 1);
    }
    fx.globalCompositeOperation = "source-over";
    // 窗外飘落的东西
    for (const f of flakes) {
      f.a += f.spin * dt / 16;
      f.x += (f.vx + Math.sin(f.a) * 0.15 * dpr) * dt / 16;
      f.y += f.vy * dt / 16;
      if (f.y > H + 20 * dpr || f.y < -30 * dpr || f.x < -30 * dpr || f.x > W + 30 * dpr) Object.assign(f, newFlake(f.kind, false), f.kind === "mote" ? {} : { x: rand(-W * 0.2, W) });
    }
    if (flash > 0) flash = Math.max(0, flash - dt / 260);
    if (openK > 0) for (const r of streaks) { r.y += r.v * dt / 16; r.x -= r.v * 0.15 * dt / 16; if (r.y > H) { r.y = -r.l; r.x = rand(0, W * 1.1); } }
  }

  function draw(now) {
    // 开窗/关窗的过渡
    if (openK !== openTarget) { openK += (openTarget - openK) * 0.08; if (Math.abs(openTarget - openK) < 0.01) openK = openTarget; }
    ctx.globalAlpha = 1;
    ctx.drawImage(bg, 0, 0);
    if (openK > 0) {
      ctx.globalAlpha = openK; ctx.drawImage(land, 0, 0);
      // 打开的窗外，雨是一条条落下的雨丝
      if (streaks.length) {
        ctx.strokeStyle = isNight() ? "rgba(200,210,240,0.35)" : "rgba(255,255,255,0.55)"; ctx.lineWidth = 1 * dpr; ctx.beginPath();
        for (const r of streaks) { ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.l * 0.15, r.y + r.l); }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // 植物轻轻摇晃
    const sway = reduce ? 0 : Math.sin((now - t0) / 2600) * 4 * dpr;
    ctx.drawImage(plants, sway, sway * 0.3);
    // 窗外飘的
    for (const f of flakes) {
      if (f.kind === "snow" || f.kind === "mote") {
        ctx.globalAlpha = f.kind === "mote" ? 0.55 + Math.sin(f.a * 3) * 0.3 : 0.85;
        ctx.fillStyle = f.kind === "mote" ? "#fff6dc" : "#ffffff";
        ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.globalAlpha = 0.85;
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a); ctx.scale(1, Math.abs(Math.cos(f.a * 1.7)) * 0.7 + 0.3);
        ctx.fillStyle = f.c; ctx.beginPath(); ctx.moveTo(0, -f.r); ctx.quadraticCurveTo(f.r * 0.8, 0, 0, f.r); ctx.quadraticCurveTo(-f.r * 0.8, 0, 0, -f.r); ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    // 光束（慢慢地明暗变化）
    if (S.weather === "clear" && !isNight()) { ctx.globalAlpha = 0.75 + Math.sin((now - t0) / 4000) * 0.25; ctx.drawImage(beams, 0, 0); ctx.globalAlpha = 1; }
    // 玻璃（雾、水珠）在开窗时慢慢消失
    ctx.globalAlpha = 1 - openK;
    if (openK < 1) {
      ctx.drawImage(fog, 0, 0);
      for (const d of drops) ctx.drawImage(sprite, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2.1);
      for (const r of runners) ctx.drawImage(sprite, r.x - r.r, r.y - r.r * 1.15, r.r * 2, r.r * 2.4);
    }
    ctx.globalAlpha = 1;
    if (flash > 0) { ctx.fillStyle = `rgba(235,240,255,${flash * 0.35})`; ctx.fillRect(0, 0, W, H); }
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 31) return; // 大约 30 帧，省电
    const dt = Math.min(80, t - last); last = t;
    step(dt); draw(t);
  }
  function start() {
    cancelAnimationFrame(raf);
    if (reduce) { draw(performance.now()); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  // 整个场景重画（天气、时间、季节变了，或者屏幕尺寸变了）
  function rebuild() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    cv.width = W; cv.height = H;
    root.dataset.sky = isNight() ? "night" : "day";
    root.dataset.weather = S.weather;
    root.dataset.season = S.season;
    sprite = makeSprite();
    paintScene(); paintPlants(); paintBeams(); paintFog(); paintLand(); seedGlass(); seedFlakes(); seedStreaks();
    start();
    const meta = document.querySelector('meta[name="theme-color"]:not([media])') || (() => { const m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); return m; })();
    meta.content = skyColors()[0];
  }

  // ---------- 对外的接口：app.js 拿到天气后调用 ----------
  const PREVIEW_KEY = "sky-preview";
  const preview = () => { try { return JSON.parse(localStorage.getItem(PREVIEW_KEY) || "{}"); } catch { return {}; } };
  function apply() {
    const p = preview(), r = S.real;
    const now = new Date();
    const tm = timeOf(now, r?.sunrise, r?.sunset);
    S.weather = p.weather && p.weather !== "auto" ? p.weather : r?.scene || "rain";
    S.time = p.time && p.time !== "auto" ? p.time : r ? (r.isDay ? (tm.time === "night" ? "dusk" : tm.time) : "night") : tm.time;
    S.dusk = S.time === "dusk" ? Math.max(0.6, tm.dusk) : tm.dusk * 0.5;
    S.season = p.season && p.season !== "auto" ? p.season : seasonOf(now.getMonth(), r?.lat ?? 35);
    rebuild();
  }
  window.Sky = {
    setReal(w) { S.real = w; apply(); },
    setPreview(p) { try { localStorage.setItem(PREVIEW_KEY, JSON.stringify(p)); } catch {} apply(); },
    preview,
    state: () => ({ ...S }),
    setOpen(v) { openTarget = v ? 1 : 0; if (reduce) { openK = openTarget; draw(performance.now()); } },
  };

  let rt;
  addEventListener("resize", () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const d = Math.min(devicePixelRatio || 1, 1.5);
      if (Math.abs(innerWidth * d - W) > 2 || Math.abs(innerHeight * d - H) > 160 * d) rebuild();
    }, 200);
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  setInterval(() => { if (!document.hidden) apply(); }, 10 * 60 * 1000); // 每 10 分钟按时间重新判断白天黑夜

  // 预览用：网址后面加 ?sky=snow&time=night&season=winter
  const q = new URLSearchParams(location.search);
  if (q.has("sky") || q.has("time") || q.has("season")) {
    try { localStorage.setItem(PREVIEW_KEY, JSON.stringify({ weather: q.get("sky") || "auto", time: q.get("time") || "auto", season: q.get("season") || "auto" })); } catch {}
  }
  apply();
})();
