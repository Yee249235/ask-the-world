// 雨落在毛玻璃上：模糊的窗外光斑 + 一层水雾 + 静止的小水珠 + 往下滑的水珠（会擦出一道清晰的水痕，水雾再慢慢回来）
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkMQ = matchMedia("(prefers-color-scheme: dark)");

  const cv = document.createElement("canvas");
  cv.id = "rain";
  cv.setAttribute("aria-hidden", "true");
  document.body.prepend(cv);
  const ctx = cv.getContext("2d");

  const bg = document.createElement("canvas"); // 窗外的景（模糊光斑）
  const fog = document.createElement("canvas"); // 水雾
  const bgx = bg.getContext("2d"), fx = fog.getContext("2d");
  let sprite = null;

  let W = 0, H = 0, dpr = 1, dark = darkMQ.matches;
  let drops = [], runners = [], last = performance.now(), raf = 0;

  // 一颗水珠的贴图：边缘暗、左上高光，看起来像有折射
  function makeSprite() {
    const s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d");
    const grad = g.createRadialGradient(25, 23, 1, 32, 33, 30);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.16, dark ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.55)");
    grad.addColorStop(0.55, dark ? "rgba(180,200,255,0.10)" : "rgba(255,255,255,0.12)");
    grad.addColorStop(0.86, dark ? "rgba(0,0,0,0.45)" : "rgba(40,55,80,0.38)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(32, 33, 30, 31, 0, 0, Math.PI * 2); g.fill();
    // 底部一点反光
    g.fillStyle = dark ? "rgba(255,220,170,0.35)" : "rgba(255,255,255,0.5)";
    g.beginPath(); g.ellipse(34, 52, 10, 4, 0, 0, Math.PI * 2); g.fill();
    return s;
  }

  const rand = (a, b) => a + Math.random() * (b - a);

  function paintScene() {
    bg.width = W; bg.height = H;
    const g = bgx.createLinearGradient(0, 0, 0, H);
    if (dark) { g.addColorStop(0, "#0a1020"); g.addColorStop(0.5, "#121a30"); g.addColorStop(1, "#231d2c"); }
    else { g.addColorStop(0, "#b8c6d6"); g.addColorStop(0.5, "#c9d3de"); g.addColorStop(1, "#d8d2cb"); }
    bgx.fillStyle = g; bgx.fillRect(0, 0, W, H);
    // 窗外的灯光，模糊成光斑
    const lights = dark
      ? ["#f2b45a", "#ff8f6b", "#5fc7c0", "#8aa2ff", "#f7d38a", "#ff6f91"]
      : ["#ffffff", "#f6d7a8", "#9fc3dc", "#b7d8c6", "#efb8ab", "#7f98b4"];
    bgx.filter = `blur(${Math.round(22 * dpr)}px)`;
    // 远处的大色块（建筑、树）
    for (let i = 0; i < 6; i++) {
      bgx.globalAlpha = dark ? 0.35 : 0.3;
      bgx.fillStyle = dark ? ["#1d2a4a", "#2a2140", "#14304a"][i % 3] : ["#8ea3b8", "#a9b5a2", "#9aa6be"][i % 3];
      bgx.fillRect(rand(-W * 0.1, W), rand(H * 0.35, H * 0.8), rand(W * 0.15, W * 0.45), H);
    }
    const n = Math.round((W * H) / (dark ? 14000 : 20000) / (dpr * dpr));
    for (let i = 0; i < n; i++) {
      bgx.globalAlpha = dark ? rand(0.35, 0.85) : rand(0.4, 0.85);
      bgx.fillStyle = lights[(Math.random() * lights.length) | 0];
      const y = dark ? rand(H * 0.2, H) : rand(H * 0.1, H);
      bgx.beginPath(); bgx.arc(rand(0, W), y, rand(10, 46) * dpr, 0, Math.PI * 2); bgx.fill();
    }
    bgx.filter = "none"; bgx.globalAlpha = 1;
  }

  function fogColor(a) { return dark ? `rgba(30,38,60,${a})` : `rgba(245,248,252,${a})`; }
  function paintFog() {
    fog.width = W; fog.height = H;
    fx.fillStyle = fogColor(dark ? 0.6 : 0.62);
    fx.fillRect(0, 0, W, H);
  }

  function addDrop(x = rand(0, W), y = rand(0, H), r = Math.pow(Math.random(), 2.2) * 3.6 * dpr + 0.8 * dpr) { drops.push({ x, y, r }); }
  function seed() {
    drops = []; runners = [];
    const n = Math.min(320, Math.round((W * H) / (3200 * dpr * dpr)));
    for (let i = 0; i < n; i++) addDrop();
  }

  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    sprite = makeSprite();
    W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
    cv.width = W; cv.height = H;
    paintScene(); paintFog(); seed();
  }

  function spawnRunner() {
    // 从一颗比较大的水珠开始往下滑；没有就从上方新出现一颗
    const big = drops.filter((d) => d.r > 2 * dpr);
    let x, y, r;
    if (big.length && Math.random() < 0.7) {
      const d = big[(Math.random() * big.length) | 0];
      drops.splice(drops.indexOf(d), 1);
      ({ x, y } = d); r = d.r * 1.6;
    } else { x = rand(0, W); y = rand(-20, H * 0.4); r = rand(3.5, 6.5) * dpr; }
    runners.push({ x, y, r, vy: 0, wob: rand(0, 6.28), lastTrail: y, stall: 0 });
  }

  function step(dt) {
    // 新落下的雨点
    const rate = (W * H) / 9e5;
    for (let i = 0; i < rate * dt * 0.06; i++) if (drops.length < 400) addDrop();
    if (runners.length < Math.max(3, W / (140 * dpr)) && Math.random() < 0.02 * dt / 16) spawnRunner();

    // 水雾慢慢回来
    fx.globalCompositeOperation = "source-over";
    fx.fillStyle = fogColor(0.003 * dt / 16);
    fx.fillRect(0, 0, W, H);

    fx.globalCompositeOperation = "destination-out";
    for (let i = runners.length - 1; i >= 0; i--) {
      const r = runners[i];
      // 走走停停，像真的水珠
      if (r.stall > 0) { r.stall -= dt; continue; }
      r.vy = Math.min(r.vy + 0.012 * dt * (r.r / (4 * dpr)), 0.9 * dpr * (r.r / (4 * dpr)) + 0.2);
      if (Math.random() < 0.004) r.stall = rand(150, 600);
      const ny = r.y + r.vy * dt / 4;
      r.wob += 0.05;
      const nx = r.x + Math.sin(r.wob) * 0.25 * dpr;
      // 擦出水痕
      fx.lineCap = "round"; fx.lineWidth = r.r * 1.7;
      fx.strokeStyle = "rgba(0,0,0,0.9)";
      fx.beginPath(); fx.moveTo(r.x, r.y); fx.lineTo(nx, ny); fx.stroke();
      r.x = nx; r.y = ny;
      // 吃掉路上的小水珠，自己变大一点
      for (let j = drops.length - 1; j >= 0; j--) {
        const d = drops[j];
        if (Math.abs(d.y - r.y) < r.r + d.r && Math.abs(d.x - r.x) < r.r + d.r) { drops.splice(j, 1); r.r = Math.min(r.r + d.r * 0.08, 8 * dpr); }
      }
      // 身后留下一串小水珠
      if (r.y - r.lastTrail > rand(10, 26) * dpr) { addDrop(r.x + rand(-1, 1) * dpr, r.y - r.r * 1.2, r.r * rand(0.22, 0.38)); r.lastTrail = r.y; r.r *= 0.985; }
      if (r.y - r.r > H || r.r < 1.5 * dpr) runners.splice(i, 1);
    }
    fx.globalCompositeOperation = "source-over";
  }

  function draw() {
    ctx.drawImage(bg, 0, 0);
    ctx.drawImage(fog, 0, 0);
    for (const d of drops) ctx.drawImage(sprite, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2.1);
    for (const r of runners) ctx.drawImage(sprite, r.x - r.r, r.y - r.r * 1.15, r.r * 2, r.r * 2.4);
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (t - last < 31) return; // 大约 30 帧
    const dt = Math.min(80, t - last); last = t;
    step(dt); draw();
  }

  function start() {
    cancelAnimationFrame(raf);
    if (reduce) { draw(); return; }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  let rt;
  addEventListener("resize", () => {
    // 手机地址栏伸缩会触发 resize，只在宽度变化或高度变化较大时重画
    clearTimeout(rt);
    rt = setTimeout(() => {
      if (Math.abs(innerWidth * Math.min(devicePixelRatio || 1, 1.5) - W) > 2 || Math.abs(innerHeight * dpr - H) > 160 * dpr) { resize(); start(); }
    }, 200);
  });
  darkMQ.addEventListener?.("change", (e) => { dark = e.matches; sprite = makeSprite(); paintScene(); paintFog(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });

  resize();
  start();
})();
