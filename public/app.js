// 问世界 · 前端（无需构建，原生 JS）

const VERSION = "11122224";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");

const S = { categories: [], topics: [], questions: [], links: [], settings: {}, providers: [] };
const UI = { cat: "all", onlyOpen: false, ideas: {}, busy: {} };

const EMOJIS = [
  "🏠", "🍳", "📱", "💻", "🎮", "📚", "🔭", "🔍", "🧭", "💡", "🧠", "🌍",
  "🍉", "🍎", "🍜", "☕", "🍰", "🥬", "🐱", "🐶", "🌱", "🌸", "🌙", "☀️",
  "🧪", "🔬", "🎨", "🎵", "🎬", "📷", "✈️", "🚗", "🏃", "⚽", "💰", "📈",
  "🛠️", "⚙️", "🩺", "💊", "👕", "🧹", "🛒", "🎁", "❤️", "😴", "🤔", "✨",
];
const SRC = { site_ai: "✨ 站内 AI", external_ai: "🌐 外部 AI", self: "✍️ 自己写" };

// ---------- 工具 ----------
async function api(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401 && path !== "login") { renderLogin(); throw new Error("请先登录"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}
let toastT;
function toast(msg, action) {
  if (action) return snack(msg, action);
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2400);
}
let snackT;
function snack(msg, action) {
  let el = $("#snack");
  if (!el) { el = document.createElement("div"); el.id = "snack"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.innerHTML = `<span class="sm">${esc(msg)}</span><button class="btn small primary" data-go>查看</button><button class="btn small ghost" data-x aria-label="关闭">✕</button>`;
  const hide = () => { el.classList.remove("show"); clearTimeout(snackT); };
  el.onclick = (e) => {
    e.stopPropagation();
    if (e.target.closest("[data-x]")) return hide();
    hide(); action();
  };
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(snackT);
  snackT = setTimeout(hide, 9000);
}
// 和 lib/text.js 里的一样：把 Markdown 变成干净的纯文本（贴进来的别的 AI 回答也用它）
function plainText(t) {
  return String(t || "")
    .replace(/```[a-zA-Z]*\n?/g, "")
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, "")
    .replace(/\*\*\s*(.+?)\s*\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\*)/g, "$1$2")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/^[ \t]*[-*+•][ \t]+/gm, "・")
    .replace(/^[ \t]*>[ \t]?/gm, "")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1")
    .replace(/^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm, "")
    .replace(/\*{2,}/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const catOf = (id) => S.categories.find((c) => c.id === id);
const topicOf = (id) => S.topics.find((t) => t.id === id);
const qOf = (id) => S.questions.find((q) => q.id === id);
const childrenOf = (id) => S.questions.filter((q) => q.parent_id === id).sort((a, b) => a.created_at - b.created_at);
const hasAI = () => S.providers.length > 0;
const pad = (n) => String(n).padStart(2, "0");
const hm = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const ymd = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
function dayLabel(ms) {
  const d = new Date(ms), today = ymd(Date.now()), yest = ymd(Date.now() - 864e5);
  const k = ymd(ms);
  if (k === today) return ["今天", `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`];
  if (k === yest) return ["昨天", `${d.getMonth() + 1}月${d.getDate()}日 ${WEEK[d.getDay()]}`];
  return [`${d.getMonth() + 1}月${d.getDate()}日`, `${d.getFullYear()} ${WEEK[d.getDay()]}`];
}
function upsertQ(q) {
  const i = S.questions.findIndex((x) => x.id === q.id);
  if (i >= 0) S.questions[i] = q; else S.questions.unshift(q);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast("已复制 📋"); }
  catch { toast("复制失败，请手动选择文字复制"); }
}
function copyQuestion(q) {
  let text = q.text + (q.context ? `\n（场景：${q.context}）` : "");
  if (S.settings.copy_with_template === "1") {
    const t = topicOf(q.topic_id);
    const tpl = t
      ? S.settings.template_topic.replaceAll("{topic}", t.name).replaceAll("{goal}", t.goal ? `，目标是：${t.goal}` : "")
      : S.settings.template_daily;
    text = `${tpl}\n请用纯文本回答，不要使用 Markdown 符号。\n\n我的问题：${text}`;
  }
  copyText(text);
}

const onlineFirst = () => !!S.search;
function answerButtons(busy) {
  return `<button class="btn small brass" id="sh-ai" ${busy.answer ? "disabled" : ""}>${busy.answer ? `<span class="spin">✨</span> ${onlineFirst() ? "搜索并思考中…" : "思考中…"}` : "✨ AI 回答"}</button>`;
}

// 记下问题后马上在后台回答
async function answerInBackground(id) {
  UI.answering ||= new Set();
  UI.answering.add(id);
  keepScroll(render);
  try {
    const q = await api("ai/answer", { method: "POST", body: { id, online: onlineFirst() } });
    if (q._note) toast(q._note);
    delete q._note;
    upsertQ(q);
    UI.recent ||= new Set();
    UI.recent.add(id);
    UI.fresh = id;
    toast(`答好了：${(qOf(id)?.text || "").slice(0, 16)}`, () => openQ(id));
  } catch (e) { toast(e.message.slice(0, 90)); }
  UI.answering.delete(id);
  if (sheetEl && route().id === id) refreshSheet(id); else keepScroll(render);
}

// 答案里出现的网址，在框下面列成可以点的链接
function linksIn(text) {
  const urls = [...new Set(String(text || "").match(/https?:\/\/[^\s<>"'）)]+/g) || [])].slice(0, 8);
  if (!urls.length) return "";
  return `<div class="ans-links">${urls.map((u) => { let h = u; try { h = new URL(u).hostname.replace(/^www\./, ""); } catch {} return `<a href="${esc(u)}" target="_blank" rel="noopener">🔗 ${esc(h)}</a>`; }).join("")}</div>`;
}

// ---------- 删除 ----------
function descendants(id) {
  const out = [];
  const walk = (pid) => S.questions.filter((q) => q.parent_id === pid).forEach((k) => { out.push(k.id); walk(k.id); });
  walk(id);
  return out;
}
async function deleteQuestions(ids, withFollowups) {
  const r = await api("questions/delete", { method: "POST", body: { ids, withFollowups } });
  Object.assign(S, await api("state"));
  toast(`已删除 ${r.deleted.length} 个问题`);
  return r;
}

// ---------- 长按换分类 ----------
function openMoveSheet(id) {
  const q = qOf(id);
  if (!q) return;
  if (q.topic_id) return openMoveTopicSheet(id);
  const kids = descendants(id).length;
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet move-sheet" role="dialog" aria-label="换分类">
    <div class="sheet-head"><b>移到哪个分类？</b><button class="btn small ghost" data-mv="x">取消</button></div>
    <p class="mv-q">${esc(q.text)}</p>
    ${kids ? `<p class="muted" style="font-size:13px;margin:0 0 10px">它下面的 ${kids} 个追问会一起移过去</p>` : ""}
    <div class="mv-grid">
      ${S.categories.map((c) => `<button class="mv ${c.id === q.category_id ? "on" : ""}" data-mv="${c.id}"><span>${c.emoji}</span>${esc(c.name)}</button>`).join("")}
      <button class="mv ${!q.category_id ? "on" : ""}" data-mv=""><span>📥</span>未分类</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = async (e) => {
    if (e.target === bg) return close();
    const b = e.target.closest("[data-mv]");
    if (!b) return;
    if (b.dataset.mv === "x") return close();
    const cat = b.dataset.mv || null;
    try {
      const r = await api("questions/move", { method: "POST", body: { id, category_id: cat } });
      r.moved.forEach((qid) => { const x = qOf(qid); if (x) x.category_id = cat; });
      const c = catOf(cat);
      toast(`已移到 ${c ? c.emoji + " " + c.name : "📥 未分类"}${r.moved.length > 1 ? `（共 ${r.moved.length} 个）` : ""}`);
    } catch (err) { toast(err.message); }
    close();
    keepScroll(render);
  };
}

// 改分类名字（长按分类标签，或在「管理分类」里点 ✎）
function openCatSheet(id) {
  const c = catOf(id);
  if (!c) return;
  setDrawer(false); // 从抽屉里长按时，先把抽屉收起，不然改名窗口会被挡住
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<form class="sheet move-sheet" role="dialog" aria-label="修改分类" data-cat-id="${id}">
    <div class="sheet-head"><b>修改分类</b><button type="button" class="btn small ghost" data-x>取消</button></div>
    <div class="bar"><input class="input emo" name="emoji" value="${esc(c.emoji)}" aria-label="emoji，可以用键盘输入任意表情" autocomplete="off" style="width:64px;text-align:center;font-size:22px" />
      <input class="input" name="name" value="${esc(c.name)}" maxlength="12" style="flex:1" aria-label="分类名字" /></div>
    ${emojiPicker("emoji", c.emoji)}
    <div class="bar space" style="margin-top:12px"><a href="#/cats" class="muted" style="font-size:13px" data-x>管理全部分类</a>
      <button class="btn primary">保存</button></div>
  </form>`;
  document.body.appendChild(bg);
  const f = $("form", bg);
  f.name.focus(); f.name.select();
  const close = () => bg.remove();
  bg.onclick = (e) => {
    if (e.target === bg || e.target.closest("[data-x]")) return close();
    const em = e.target.closest("[data-emo]");
    if (em) { f.emoji.value = em.dataset.emo; f.emoji.dispatchEvent(new Event("input", { bubbles: true })); }
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = { name: f.name.value.trim(), emoji: f.emoji.value.trim() || c.emoji };
    if (!body.name) return f.name.focus();
    try { Object.assign(c, await api(`categories/${id}`, { method: "PATCH", body })); toast("分类已修改"); }
    catch (err) { toast(err.message); }
    close();
    keepScroll(render);
  };
}

// 课题里的问题：长按换到别的课题，或者放回火花
function openMoveTopicSheet(id) {
  const q = qOf(id);
  const kids = descendants(id).length;
  const bg = document.createElement("div");
  bg.className = "sheet-bg";
  bg.innerHTML = `<div class="sheet move-sheet" role="dialog" aria-label="移到别的课题">
    <div class="sheet-head"><b>移到哪里？</b><button class="btn small ghost" data-mv="x">取消</button></div>
    <p class="mv-q">${esc(q.text)}</p>
    ${kids ? `<p class="muted" style="font-size:13px;margin:0 0 10px">它下面的 ${kids} 个追问会一起移过去</p>` : ""}
    <div class="mv-grid">
      ${S.topics.filter((t) => t.status !== "done").map((t) => `<button class="mv ${t.id === q.topic_id ? "on" : ""}" data-mv="${t.id}"><span>${t.emoji}</span>${esc(t.name)}</button>`).join("")}
      <button class="mv" data-mv=""><span>✨</span>放回火花</button>
    </div>
  </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.onclick = async (e) => {
    if (e.target === bg) return close();
    const b = e.target.closest("[data-mv]");
    if (!b) return;
    if (b.dataset.mv === "x") return close();
    const tid = b.dataset.mv || null;
    try {
      const r = await api("questions/move", { method: "POST", body: { id, topic_id: tid || "" } });
      r.moved.forEach((qid) => { const x = qOf(qid); if (x) x.topic_id = tid; });
      qOf(id).parent_id = null;
      const t = topicOf(tid);
      toast(`已移到 ${t ? t.emoji + " " + t.name : "✨ 火花"}${r.moved.length > 1 ? `（共 ${r.moved.length} 个）` : ""}`);
    } catch (err) { toast(err.message); }
    close();
    keepScroll(render);
  };
}

// 长按（手机）或右键（电脑）一张卡片
function bindLongPress(el, fn) {
  let timer = null, sx = 0, sy = 0;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(() => { timer = null; el.dataset.longpressed = "1"; navigator.vibrate?.(15); fn(); }, 500);
  });
  el.addEventListener("pointermove", (e) => { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) cancel(); });
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("contextmenu", (e) => { e.preventDefault(); cancel(); fn(); });
}

// ---------- 路由 ----------
function route() {
  const h = location.hash.replace(/^#\/?/, "");
  const [view, id] = h.split("/");
  return { view: view || "home", id };
}
function go(hash) { location.hash = hash; }


// ---------- 登录 ----------
function renderLogin() {
  app.innerHTML = `
  <div class="login"><form id="lf">
    <div class="big">🪟</div>
    <h1>雾窗</h1>
    <p class="muted">在起雾的玻璃上，写下对世界的疑问</p>
    <input class="input" id="pw" type="password" placeholder="密码" autocomplete="current-password" />
    <button class="btn primary" style="justify-content:center">进入</button>
    <div class="err" id="le"></div>
  </form></div>`;
  $("#lf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("login", { method: "POST", body: { password: $("#pw").value } });
      await load();
    } catch (err) { $("#le").textContent = err.message; }
  };
  $("#pw").focus();
}

async function load() {
  Object.assign(S, await api("state"));
  render();
  loadWeather();
}

function skySelect(key, label, opts) {
  const cur = window.Sky?.preview?.()[key] || "auto";
  return `<label class="label" for="pv-${key}">${label}</label><select class="input" id="pv-${key}" data-pv="${key}">${Object.entries(opts).map(([v, l]) => `<option value="${v}" ${v === cur ? "selected" : ""}>${l}</option>`).join("")}</select>`;
}

// ---------- 窗外的天气 ----------
let WX = null;
const WX_EMOJI = { clear: "☀️", cloudy: "⛅", fog: "🌫", drizzle: "🌦", rain: "🌧", storm: "⛈", snow: "🌨" };
const WX_NAME = { clear: "晴", cloudy: "多云", fog: "雾", drizzle: "小雨", rain: "雨", storm: "雷雨", snow: "雪" };
const SEASON_NAME = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };
const TIME_NAME = { day: "白天", dusk: "黄昏", night: "夜里" };
async function loadWeather() {
  try {
    WX = await api("weather");
    window.Sky?.setReal(WX);
    const b = $("#sky-badge"); if (b) b.outerHTML = skyBadge();
  } catch (e) { console.warn("weather", e); }
  clearTimeout(loadWeather.t);
  loadWeather.t = setTimeout(loadWeather, 20 * 60 * 1000);
}
function skyBadge() {
  const st = window.Sky?.state?.() || {};
  const pv = window.Sky?.preview?.() || {};
  const previewing = ["weather", "time", "season"].some((k) => pv[k] && pv[k] !== "auto");
  const w = st.weather || "rain";
  const parts = [`${WX_EMOJI[w]} ${WX_NAME[w]}`];
  if (WX && !previewing) parts.push(`${WX.temp}°`);
  if (WX?.city && !previewing) parts.push(esc(WX.city));
  parts.push(`${SEASON_NAME[st.season] || ""}${TIME_NAME[st.time] ? "·" + TIME_NAME[st.time] : ""}`);
  return `<div class="sky-badge" id="sky-badge" title="窗外的天气跟着你所在地的真实天气变化">${parts.join("<i></i>")}${previewing ? `<a href="#/settings" class="pv">预览中</a>` : ""}</div>`;
}

// ---------- 外框 ----------
function shell(inner, active) {
  const tabs = [["home", "#/", "✨ 火花"], ["topics", "#/topics", "🧭 课题"], ["review", "#/review", "🕸 回顾"], ["settings", "#/settings", "⚙️"]];
  return `
  <header class="top"><div class="wrap">
    <div class="brand-row">
      <button class="menu-btn" id="menu-btn" aria-label="${active === "topics" ? "打开课题列表" : "打开分类"}" aria-controls="drawer" aria-expanded="false"><span></span><span></span><span></span></button>
      <a class="brand" href="#/"><b>雾窗</b><small>问世界</small></a>
    </div>
    <nav class="nav">${tabs.map(([k, h, l]) => `<a href="${h}" class="${active === k ? "on" : ""}">${l}</a>`).join("")}</nav>
  </div></header>
  <main class="wrap">${inner}</main>
  ${drawerHTML()}`;
}

// ---------- 左侧分类抽屉 ----------
function drawerHTML() {
  const v = route().view;
  if (v === "topics" || v === "topic") return topicDrawerHTML();
  const sparks = S.questions.filter((q) => !q.topic_id);
  const count = (id) => sparks.filter((q) => q.category_id === id).length;
  const uncat = sparks.filter((q) => !q.category_id).length;
  const open = sparks.filter((q) => !q.answer).length;
  const item = (key, emoji, name, n) => `<button class="dr-item ${UI.cat === key ? "on" : ""}" data-cat="${key}"><span class="de">${emoji}</span><span class="dn">${esc(name)}</span><span class="dc">${n}</span></button>`;
  return `<div class="drawer-bg" id="drawer-bg" hidden></div>
  <aside class="drawer" id="drawer" aria-label="分类" aria-hidden="true">
    <div class="dr-head"><b>分类</b><button class="btn small ghost" id="drawer-close" aria-label="关闭">✕</button></div>
    <div class="dr-list">
      ${item("all", "✨", "全部火花", sparks.length)}
      ${S.categories.map((c) => item(c.id, c.emoji, c.name, count(c.id))).join("")}
      ${uncat ? item("none", "📥", "未分类", uncat) : ""}
    </div>
    <div class="dr-sec">
      <button class="dr-item ${UI.onlyOpen ? "on" : ""}" id="only-open"><span class="de">🌱</span><span class="dn">只看未解答</span><span class="dc">${open}</span></button>
      ${open ? `<button class="dr-item" id="dice"><span class="de">🎲</span><span class="dn">随机抽一个未解答</span></button>` : ""}
      ${sparks.length ? `<button class="dr-item" id="sel-mode"><span class="de">☑</span><span class="dn">批量删除</span></button>` : ""}
      <a class="dr-item" href="#/cats"><span class="de">⚙︎</span><span class="dn">管理分类</span></a>
    </div>
    <p class="dr-tip">长按分类可以改名字和 emoji</p>
  </aside>`;
}
function topicDrawerHTML() {
  const cur = route().id;
  const item = (t) => {
    const qs = S.questions.filter((q) => q.topic_id === t.id), done = qs.filter((q) => q.answer).length;
    return `<a class="dr-item ${cur === t.id ? "on" : ""}" href="#/topic/${t.id}" data-close-drawer><span class="de">${t.emoji}</span><span class="dn">${esc(t.name)}</span><span class="dc">${done}/${qs.length}</span></a>`;
  };
  const active = S.topics.filter((t) => t.status !== "done"), done = S.topics.filter((t) => t.status === "done");
  return `<div class="drawer-bg" id="drawer-bg" hidden></div>
  <aside class="drawer" id="drawer" aria-label="课题" aria-hidden="true">
    <div class="dr-head"><b>课题</b><button class="btn small ghost" id="drawer-close" aria-label="关闭">✕</button></div>
    <div class="dr-list">
      ${active.map(item).join("") || `<p class="dr-tip" style="margin:0 6px">还没有进行中的课题</p>`}
    </div>
    ${done.length ? `<div class="dr-sec"><p class="dr-tip" style="margin:0 6px 4px">已完成</p>${done.map(item).join("")}</div>` : ""}
    <div class="dr-sec">
      <a class="dr-item" href="#/topics" data-close-drawer data-new-topic><span class="de">＋</span><span class="dn">新课题</span></a>
      <a class="dr-item" href="#/topics" data-close-drawer><span class="de">🗺</span><span class="dn">全部课题</span></a>
    </div>
    <p class="dr-tip">每个课题是一条独立的探索路线，不需要分类</p>
  </aside>`;
}

function setDrawer(open) {
  const d = $("#drawer"), bg = $("#drawer-bg"), b = $("#menu-btn");
  if (!d) return;
  UI.drawer = open;
  d.classList.toggle("open", open);
  d.setAttribute("aria-hidden", String(!open));
  bg.hidden = !open;
  b?.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("drawer-open", open);
}

let navCount = 0, baseHash = "#/";
window.addEventListener("hashchange", () => { navCount++; if (route().view !== "q") sheetPushed = false; render(); });
function render() {
  let r = route();
  const sheetId = r.view === "q" ? r.id : null;
  if (sheetId) {
    // 详情是叠在当前页面上的，底下保持原来的页面
    const h = baseHash.replace(/^#\/?/, "").split("/");
    r = { view: h[0] || "home", id: h[1] };
  } else baseHash = location.hash || "#/";
  const views = { home: viewHome, cats: viewCats, topics: viewTopics, topic: viewTopic, review: viewReview, stats: viewStats, settings: viewSettings };
  const fn = views[r.view] || viewHome;
  // 换到别的页面就退出批量选择
  const viewKey = r.view + (r.id || "");
  if (UI.selecting && UI.selView && UI.selView !== viewKey) { UI.selecting = false; UI.sel = null; }
  UI.selView = UI.selecting ? (UI.selView || viewKey) : null;
  if (r.view === "open") { UI.onlyOpen = true; UI.cat = "all"; location.replace("#/"); return; }
  const active = r.view === "topic" ? "topics" : r.view === "cats" ? "home" : r.view === "stats" ? "review" : r.view;
  if (graph) graph.stop();
  app.innerHTML = shell(fn(r), active);
  if (UI.slide) { const m = $("main"); m.classList.add(`slide-${UI.slide}`); UI.slide = null; }
  bindCommon();
  if (r.view === "review") startGraph();
  closeSheet();
  if (sheetId) openSheet(sheetId);
}

// ---------- 记录框 ----------
function captureBox({ topicId = null, placeholder = "在起雾的玻璃上，写下一个问题…" } = {}) {
  const cur = catOf(UI.pickCat);
  const pick = topicId ? "" : `
    <div class="pick-bar">
      <button type="button" class="pick-toggle ${cur ? "chosen" : ""}" id="pick-toggle" aria-expanded="${!!UI.pickOpen}">
        <span>${cur ? `${cur.emoji} ${esc(cur.name)}` : "🏷 选择分类"}</span><span class="caret">${UI.pickOpen ? "▴" : "▾"}</span>
      </button>
      <button type="button" class="chip add-cat" data-newcat>＋ 新分类</button>
    </div>
    ${UI.pickOpen ? `<div class="pick-list" role="listbox" aria-label="选择分类">
      <button type="button" class="pick-item ${!UI.pickCat ? "on" : ""}" data-pick="">📥 不选分类</button>
      ${S.categories.map((c) => `<button type="button" class="pick-item ${UI.pickCat === c.id ? "on" : ""}" data-pick="${c.id}"><span>${c.emoji} ${esc(c.name)}</span>${UI.pickCat === c.id ? "<b>✓</b>" : ""}</button>`).join("")}
    </div>` : ""}
    ${UI.newCatOpen ? `<div class="newcat-row">
      <input class="input emo" id="nc-emoji" value="🍉" aria-label="emoji，可以用键盘输入任意表情" autocomplete="off" />
      <input class="input" id="nc-name" placeholder="新分类名，比如：云计算" maxlength="12" style="flex:1" />
      <button type="button" class="btn small primary" id="nc-ok">添加</button>
    </div><p class="emo-hint" style="margin-top:4px">左边的框点进去，可以用键盘输入任意 emoji</p>` : ""}`;
  return `
  <form class="capture" data-topic="${topicId || ""}">
    <textarea name="text" rows="2" placeholder="${placeholder}" aria-label="新问题"></textarea>
    <input class="ctx" name="context" placeholder="当时的场景（非必填）" aria-label="场景" />
    ${pick}
    <div class="row">
      <span class="hint"></span>
      <span class="bar">
        <button class="btn" data-mode="save">先记下</button>
        ${hasAI() ? `<button class="btn primary" data-mode="answer">✨ 记下并回答</button>` : `<button class="btn primary" data-mode="save">记下 ✍️</button>`}
      </span>
    </div>
  </form>`;
}

async function submitCapture(form, mode = "save") {
  const text = form.text.value.trim();
  if (!text) return form.text.focus();
  const topicId = form.dataset.topic || null;
  const btns = $$("[data-mode]", form);
  btns.forEach((b) => (b.disabled = true));
  try {
    const q = await api("questions", { method: "POST", body: { text, context: form.context.value.trim(), topic_id: topicId, category_id: topicId ? null : UI.pickCat || null } });
    upsertQ(q);
    form.reset();
    UI.recent ||= new Set();
    UI.recent.add(q.id);
    UI.fresh = q.id;
    if (!topicId && UI.cat !== "all" && UI.cat !== (q.category_id || "none")) UI.cat = q.category_id || "none";
    toast(mode === "answer" ? "记下了，正在回答…" : "记下了 🌱");
    render();
    if (mode === "answer" && hasAI()) answerInBackground(q.id);
  } catch (e) { toast(e.message); }
  btns.forEach((b) => (b.disabled = false));
}

async function classify(id) {
  try {
    const q = await api("ai/classify", { method: "POST", body: { id } });
    upsertQ(q);
    // 没有分类、且 AI 选中了现有分类时，直接先填上（仍可一键改）
    if (!q.category_id && q.suggest?.category_id) await acceptSuggest(q.id, "category", true);
    else render();
  } catch (e) { console.warn("classify", e); }
}

// ---------- 卡片 ----------
function card(q, { deck = 0, open = false } = {}) {
  const c = catOf(q.category_id), t = topicOf(q.topic_id), p = qOf(q.parent_id);
  const kids = childrenOf(q.id).length;
  return `
  <article class="card ${q.answer ? "" : "open"} ${UI.fresh === q.id ? "fresh" : ""} ${UI.selecting ? "selecting" : ""} ${UI.sel?.has(q.id) ? "picked" : ""}" data-open="${q.id}">
    ${UI.selecting ? `<span class="tick" aria-hidden="true">${UI.sel.has(q.id) ? "✓" : ""}</span>` : ""}
    <div class="meta">
      ${t ? "" : c ? `<span class="chip">${c.emoji} ${esc(c.name)}</span>` : `<span class="chip">📥 未分类</span>`}
      ${t ? `<span class="chip topic">${t.emoji} ${esc(t.name)}</span>` : ""}
      ${UI.recent?.has(q.id) && q.answer ? `<span class="chip just">💡 刚答好</span>` : ""}
      <span class="time">${hm(q.created_at)}</span>
    </div>
    <h3>${esc(q.text)}</h3>
    ${UI.answering?.has(q.id) ? `<p class="ans none"><span class="spin">✨</span> 正在回答…</p>` : q.answer ? `<p class="ans">${esc(plainText(q.answer))}</p>` : `<p class="ans none">🌫 雾还没散，点开来回答</p>`}
    <div class="foot">
      ${p ? `<span>↖ 追问自「${esc(p.text.slice(0, 18))}${p.text.length > 18 ? "…" : ""}」</span>` : ""}
      ${deck ? "" : kids ? `<span>↳ ${kids} 个追问</span>` : ""}
      ${q.answer && q.source ? `<span>${q.source === "site_ai" && /联网/.test(q.source_model || "") ? "🌐 联网 AI" : SRC[q.source]}${q.verified ? " · ✅" : ""}</span>` : ""}
    </div>
    ${suggestBar(q)}
    ${deck ? `<button class="deck-toggle" data-deck="${q.id}" aria-expanded="${open}">🌿 ${deck} 个追问 <span class="chev">${open ? "收起 ▴" : "展开 ▾"}</span></button>` : ""}
  </article>`;
}

// 一叠卡片：最上面是原始问题，后面叠着它的追问；点「追问」那一条展开/收起
function stack(q, shown) {
  const flat = [];
  const walk = (pid, depth) => childrenOf(pid).forEach((k) => { if (shown.has(k.id)) { flat.push({ k, depth }); walk(k.id, depth + 1); } });
  walk(q.id, 0);
  if (!flat.length || UI.selecting) return card(q);
  const open = UI.decks?.has(q.id);
  const layers = Math.min(flat.length, 2);
  return `<div class="stack layers-${layers} ${open ? "open" : ""}">
    ${card(q, { deck: flat.length, open })}
    ${open ? `<div class="deck">${flat.map(({ k, depth }, i) => `
      <article class="fcard ${k.answer ? "" : "unanswered"}" data-open="${k.id}" style="--d:${Math.min(depth, 3)};--i:${i}">
        <span class="fmark">${depth ? "↳".repeat(1) : "🌿"}</span>
        <span class="ftext">${esc(k.text)}${k.ask_by === "ai" ? ` <span class="badge-ai">AI</span>` : ""}</span>
        <span class="fstate">${k.answer ? "💡" : "🌱"}</span>
      </article>`).join("")}</div>` : ""}
  </div>`;
}

function suggestBar(q) {
  const s = q.suggest;
  if (!s) return "";
  const parts = [];
  if (s.category_id && catOf(s.category_id)) {
    const c = catOf(s.category_id);
    parts.push(`<div class="suggest"><span class="who">🤖 建议</span>分到 ${c.emoji} ${esc(c.name)}
      <span class="acts"><button class="btn small brass" data-sg="category" data-id="${q.id}">好</button><button class="btn small ghost" data-sgx="category_id" data-id="${q.id}">不用</button></span></div>`);
  }
  if (s.new_category) {
    parts.push(`<div class="suggest"><span class="who">🤖 建议</span>新建分类 ${esc(s.new_category.emoji)} ${esc(s.new_category.name)}
      <span class="acts"><button class="btn small brass" data-sg="new_category" data-id="${q.id}">创建</button><button class="btn small ghost" data-sgx="new_category" data-id="${q.id}">不用</button></span></div>`);
  }
  if (s.topic_id && topicOf(s.topic_id)) {
    const t = topicOf(s.topic_id);
    parts.push(`<div class="suggest"><span class="who">🤖 这个问题</span>像是「${t.emoji} ${esc(t.name)}」的一部分，要挂上去吗？
      <span class="acts"><button class="btn small brass" data-sg="topic" data-id="${q.id}">挂上</button><button class="btn small ghost" data-sgx="topic_id" data-id="${q.id}">不用</button></span></div>`);
  }
  return parts.join("");
}

async function acceptSuggest(id, kind, silent) {
  const q = qOf(id);
  const s = { ...(q.suggest || {}) };
  const patch = {};
  if (kind === "category") { patch.category_id = s.category_id; delete s.category_id; }
  if (kind === "topic") { patch.topic_id = s.topic_id; delete s.topic_id; }
  if (kind === "new_category") {
    const c = await api("categories", { method: "POST", body: s.new_category });
    S.categories.push(c);
    patch.category_id = c.id;
    delete s.new_category;
  }
  patch.suggest = Object.keys(s).length ? s : null;
  upsertQ(await api(`questions/${id}`, { method: "PATCH", body: patch }));
  if (!silent) toast("好的 👌");
  render();
}
async function dismissSuggest(id, key) {
  const q = qOf(id);
  const s = { ...(q.suggest || {}) };
  delete s[key];
  upsertQ(await api(`questions/${id}`, { method: "PATCH", body: { suggest: Object.keys(s).length ? s : null } }));
  render();
}

// ---------- 时间线 ----------
function viewHome() {
  const sparks = S.questions.filter((q) => !q.topic_id);
  let qs = sparks;
  if (UI.cat === "none") qs = qs.filter((q) => !q.category_id);
  else if (UI.cat !== "all") qs = qs.filter((q) => q.category_id === UI.cat);
  UI.recent ||= new Set();
  if (UI.onlyOpen) qs = qs.filter((q) => !q.answer || UI.recent.has(q.id));
  const count = (id) => sparks.filter((q) => q.category_id === id).length;
  const uncat = sparks.filter((q) => !q.category_id).length;
  const open = sparks.filter((q) => !q.answer).length;

  let body = "";
  if (!sparks.length) {
    body = `<div class="empty"><span class="big">🔍</span>还没有问题。<br/>今天有什么让你好奇的吗？哪怕很小的事都可以。</div>`;
  } else if (!qs.length) {
    body = `<div class="empty"><span class="big">🧭</span>这里还没有问题</div>`;
  } else {
    // 追问叠在它的原始问题后面，时间线上只放「最上层」的问题
    const shown = new Set(qs.map((q) => q.id));
    const roots = qs.filter((q) => !q.parent_id || !shown.has(q.parent_id));
    const groups = {};
    for (const q of roots) (groups[ymd(q.created_at)] ||= []).push(q);
    body = Object.values(groups).map((g) => {
      const [a, b] = dayLabel(g[0].created_at);
      return `<div class="day"><h2>${a}</h2><span>${b} · ${g.length} 个问题</span></div><div class="list">${g.map((q) => stack(q, shown)).join("")}</div>`;
    }).join("");
  }
  return `
  <section class="hero">
    ${skyBadge()}
    <h1>今天对世界好奇了什么？</h1>
  </section>
  ${captureBox()}
  <button class="now-viewing" id="now-viewing">
    <span>${UI.cat === "all" ? "✨ 全部火花" : UI.cat === "none" ? "📥 未分类" : `${catOf(UI.cat)?.emoji || ""} ${esc(catOf(UI.cat)?.name || "")}`}
      <span class="muted">· ${UI.cat === "all" ? sparks.length : UI.cat === "none" ? uncat : count(UI.cat)} 个</span>
      ${UI.onlyOpen ? `<span class="chip on" style="margin-left:6px">🌱 只看未解答</span>` : ""}</span>
    <span class="muted">切换分类 ☰</span>
  </button>
  ${body}
  ${selBar()}
  <div style="height:40px"></div>`;
}

// ---------- 分类 ----------
let editingCat = null;
function emojiPicker(name, current) {
  return `<p class="emo-hint">点左边的小框，可以用手机键盘输入任意 emoji；也可以直接点下面的</p>
  <div class="emoji-pick" data-for="${name}">${EMOJIS.map((e) => `<button type="button" class="${e === current ? "on" : ""}" data-emo="${e}">${e}</button>`).join("")}</div>`;
}

// emoji 输入框：点进去全选，输入后只保留最后一个表情；和别的分类重复时提醒一下
const seg = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("zh", { granularity: "grapheme" }) : null;
function lastGrapheme(v) {
  const parts = seg ? [...seg.segment(v)].map((x) => x.segment) : Array.from(v);
  const emo = parts.filter((g) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(g));
  return (emo.length ? emo : parts).filter((g) => g.trim()).pop() || "";
}
document.addEventListener("focusin", (e) => { if (e.target.classList?.contains("emo")) setTimeout(() => e.target.select(), 0); });
document.addEventListener("input", (e) => {
  const el = e.target;
  if (!el.classList?.contains("emo")) return;
  const g = lastGrapheme(el.value);
  if (g !== el.value) el.value = g;
  const form = el.closest("form") || el.parentElement.parentElement;
  const selfId = form?.dataset?.id || form?.dataset?.catId || "";
  const dup = S.categories.find((c) => c.emoji === g && c.id !== selfId);
  let warn = form.querySelector(".emo-dup");
  if (!warn) { warn = document.createElement("p"); warn.className = "emo-dup"; el.closest(".bar, .newcat-row").after(warn); }
  warn.textContent = dup ? `和「${dup.emoji} ${dup.name}」用了同一个 emoji，可以用，只是不太好区分` : "";
  $$(".emoji-pick button", form).forEach((b) => b.classList.toggle("on", b.dataset.emo === g));
});
function catForm(c) {
  return `<form class="form-card" id="cat-form" data-id="${c?.id || ""}">
    <div class="bar"><input class="input emo" name="emoji" value="${esc(c?.emoji || "🔍")}" aria-label="emoji，可以用键盘输入任意表情" autocomplete="off" />
    <input class="input" name="name" value="${esc(c?.name || "")}" placeholder="分类名称，比如：园艺" style="flex:1" maxlength="12" /></div>
    ${emojiPicker("emoji", c?.emoji)}
    <div class="bar space">
      ${c ? `<button type="button" class="btn small danger" id="cat-del">删除这个分类</button>` : "<span></span>"}
      <span class="bar"><button type="button" class="btn small ghost" id="cat-cancel">取消</button><button class="btn small primary">${c ? "保存" : "添加"}</button></span>
    </div>
  </form>`;
}
function viewCats() {
  const count = (id) => S.questions.filter((q) => q.category_id === id).length;
  return `
  <section class="hero"><div><a href="#/" style="text-decoration:none;font-size:14px">← 回到火花</a></div><h1>管理分类</h1>
  <p class="muted" style="margin:0">火花按领域放。分类由你自己定，可以随时增加、改名、删除。</p></section>
  ${editingCat ? catForm(editingCat === "new" ? null : catOf(editingCat)) : ""}
  <div class="tiles">
    ${S.categories.map((c) => `
      <div class="tile" data-tile="${c.id}">
        <button class="btn small ghost ed" data-edit-cat="${c.id}" aria-label="编辑">✎</button>
        <div class="e">${c.emoji}</div><div class="nm">${esc(c.name)}</div><div class="ct">${count(c.id)} 个问题</div>
      </div>`).join("")}
    <button class="tile add" id="cat-add">＋ 新分类</button>
  </div>`;
}

// ---------- 课题 ----------
let editingTopic = null;
function topicForm(t) {
  return `<form class="form-card" id="topic-form" data-id="${t?.id || ""}">
    <div class="bar"><input class="input emo" name="emoji" value="${esc(t?.emoji || "🧭")}" aria-label="emoji，可以用键盘输入任意表情" autocomplete="off" />
    <input class="input" name="name" value="${esc(t?.name || "")}" placeholder="课题名称，比如：做一个自己的网站" style="flex:1" /></div>
    ${emojiPicker("emoji", t?.emoji)}
    <input class="input" name="goal" value="${esc(t?.goal || "")}" placeholder="一句话目标（可不填），比如：年底前上线" />
    <div class="bar space">
      ${t ? `<button type="button" class="btn small danger" id="topic-del">删除课题</button>` : "<span></span>"}
      <span class="bar"><button type="button" class="btn small ghost" id="topic-cancel">取消</button><button class="btn small primary">${t ? "保存" : "开始这个课题"}</button></span>
    </div>
  </form>`;
}
function topicStats(t) {
  const qs = S.questions.filter((q) => q.topic_id === t.id);
  return { total: qs.length, done: qs.filter((q) => q.answer).length };
}
function viewTopics() {
  const active = S.topics.filter((t) => t.status !== "done"), done = S.topics.filter((t) => t.status === "done");
  const tc = (t) => {
    const { total, done } = topicStats(t);
    return `<div class="topic-card" data-topic-open="${t.id}">
      <div class="hd"><span class="e">${t.emoji}</span><b>${esc(t.name)}</b>${t.status === "done" ? `<span class="done-tag">✓ 已完成</span>` : ""}</div>
      ${t.goal ? `<p class="goal">${esc(t.goal)}</p>` : ""}
      <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
      <div class="st"><span>${total} 个问题</span><span>${done} 个已有答案</span></div>
    </div>`;
  };
  return `
  <section class="hero"><div class="deco" aria-hidden="true">🧭 🗺 🚩</div><h1>课题</h1>
  <p class="muted" style="margin:0">为了解决一件事而提出的一串问题。按时间排成一条探索路线。</p></section>
  ${editingTopic === "new" ? topicForm(null) : `<div style="margin-top:14px"><button class="btn primary" id="topic-add">＋ 新课题</button></div>`}
  <div class="list" style="margin-top:14px">
    ${active.map(tc).join("") || (editingTopic ? "" : `<div class="empty"><span class="big">🗺</span>还没有课题。<br/>想认真搞懂或做成一件事的时候，就开一个。</div>`)}
  </div>
  ${done.length ? `<div class="day"><h2>已完成</h2></div><div class="list">${done.map(tc).join("")}</div>` : ""}`;
}
function viewTopic(r) {
  const t = topicOf(r.id);
  if (!t) return `<div class="empty"><span class="big">🧭</span>找不到这个课题</div>`;
  const qs = S.questions.filter((q) => q.topic_id === t.id).sort((a, b) => a.created_at - b.created_at);
  const { total, done } = topicStats(t);
  const shown = new Set(qs.map((q) => q.id));
  const roots = qs.filter((q) => !q.parent_id || !shown.has(q.parent_id));
  const step = (q) => `
    <div class="step ${q.answer ? "done" : ""}">
      <div class="when">${ymd(q.created_at)} ${hm(q.created_at)}</div>
      ${stack(q, shown)}
    </div>`;
  return `
  ${editingTopic === t.id ? topicForm(t) : `
  <section class="hero">
    <div><a href="#/topics" style="text-decoration:none;font-size:14px">← 全部课题</a></div>
    <h1>${t.emoji} ${esc(t.name)}</h1>
    ${t.goal ? `<p class="muted" style="margin:0 0 8px">🎯 ${esc(t.goal)}</p>` : ""}
    <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    <div class="bar space" style="margin-top:8px"><span class="muted" style="font-size:13px">${total} 个问题 · ${done} 个已有答案</span>
    <span class="bar"><button class="btn small" data-edit-topic="${t.id}">编辑</button>
    <button class="btn small" data-topic-status="${t.id}">${t.status === "done" ? "重新打开" : "✓ 完成课题"}</button></span></div>
  </section>`}
  ${t.status !== "done" ? captureBox({ topicId: t.id, placeholder: `为了「${t.name}」，接下来想搞清楚什么？` }) : ""}
  ${qs.length && !UI.selecting ? `<div style="margin-top:12px"><button class="chip" id="sel-mode">☑ 批量删除</button></div>` : ""}
  ${qs.length ? `<div class="journey">${roots.map(step).join("")}</div>` : `<div class="empty"><span class="big">🚩</span>从第一个问题出发吧</div>`}
  ${selBar()}
  <div style="height:40px"></div>`;
}

// ---------- 设置 ----------
function viewSettings() {
  const s = S.settings;
  return `
  <section class="hero"><div class="deco" aria-hidden="true">⚙️ 🧰</div><h1>设置</h1></section>
  <div class="panel">
    <h3>🪟 窗外</h3>
    <p>${WX ? `现在你那里是 ${WX_EMOJI[WX.scene]} ${WX_NAME[WX.scene]}，${WX.temp}°${WX.city ? `（${esc(WX.city)}）` : ""}。窗外会跟着真实的天气、时间和季节变化，每 20 分钟更新一次。` : "窗外会跟着你所在地的真实天气、时间和季节变化。"}</p>
    <p style="margin-bottom:6px">想先看看别的天气，可以在这里预览（只影响这台设备）：</p>
    <div class="sky-pv">
      ${skySelect("weather", "天气", { auto: "跟着真实天气", clear: "☀️ 晴", cloudy: "⛅ 多云", fog: "🌫 雾", drizzle: "🌦 小雨", rain: "🌧 雨", storm: "⛈ 雷雨", snow: "🌨 雪" })}
      ${skySelect("time", "时间", { auto: "跟着真实时间", day: "白天", dusk: "黄昏", night: "夜里" })}
      ${skySelect("season", "季节", { auto: "跟着真实季节", spring: "🌸 春", summer: "🌿 夏", autumn: "🍁 秋", winter: "❄️ 冬" })}
    </div>
  </div>
  <div class="panel">
    <h3>🤖 站内 AI</h3>
    ${hasAI() ? `<p>回答问题时从最强的免费模型开始，次数用完或出错才往下一个降：</p><ol class="models">${S.providers.map((p) => `<li>${esc(p)}</li>`).join("")}</ol>
      ${Object.keys(S.usage || {}).length ? `<p style="margin-top:10px">今天已经回答：</p><ul>${Object.entries(S.usage).map(([k, n]) => `<li>${esc(k)}：${n} 次</li>`).join("")}</ul>` : ""}
      ${S.aiLast ? `<div class="ai-last"><p style="margin:10px 0 4px">最近一次回答用的是：<b>${esc(S.aiLast.used)}</b></p>
        ${S.aiLast.skipped?.length ? `<p style="margin:0 0 4px">跳过了更强的模型，原因：</p><ul class="skip">${S.aiLast.skipped.map((e) => `<li>${esc(e.slice(0, 160))}</li>`).join("")}</ul>` : `<p style="margin:0">（没有跳过，用的就是排第一的模型）</p>`}</div>` : ""}
      <p style="margin-top:10px;font-size:13px">免费额度（大约）：Nemotron 每天 50 次；GPT-OSS 和 Qwen 各每天约 1000 次、20 万 token；联网搜索每月 1000 次。全部免费，用完只会自动换下一个，不会收费。</p>`
      : `<p>还没有配置 AI 接口。在 Cloudflare 的环境变量里加上 <code>GROQ_API_KEY</code> 等就能启用（见 README）。没有 AI 也可以正常记录，只是不能自动解答。</p>`}
  </div>
  <div class="panel">
    <h3>🌐 联网回答</h3>
    ${S.search ? `<p>已开启。「AI 回答」会先上网搜最新资料再回答。免费额度每月 1000 次，用完会自动改成不联网回答，不会收费。</p>`
      : `<p>还没开启。站内 AI 的知识有截止时间，不知道最近发生的事。在 Cloudflare 的环境变量里加上 <code>TAVILY_API_KEY</code>（免费，每月 1000 次）就能联网。</p>`}
  </div>
  <form class="panel" id="tpl-form">
    <h3>📝 回答模板（你的 skill）</h3>
    <p>站内 AI 回答时会照着这个来；「复制」问题时也可以带上它，贴到别的 AI 里得到同样风格的回答。</p>
    <label class="label" for="t1">日常问题</label>
    <textarea class="textarea" id="t1" name="template_daily">${esc(s.template_daily)}</textarea>
    <label class="label" for="t2" style="margin-top:12px">课题里的问题 <span class="muted">（{topic} 是课题名，{goal} 是目标）</span></label>
    <textarea class="textarea" id="t2" name="template_topic">${esc(s.template_topic)}</textarea>
    <label class="verify" style="margin:12px 0 0"><input type="checkbox" name="copy_with_template" ${s.copy_with_template === "1" ? "checked" : ""} /> 复制问题时附带回答模板</label>
    <div class="bar space" style="margin-top:12px"><button type="button" class="btn small ghost" id="tpl-reset">恢复默认模板</button><button class="btn small primary">保存</button></div>
  </form>
  <div class="panel">
    <h3>📦 带走数据</h3>
    <p>导出成 Markdown 文件，可以直接放进 Obsidian 或别的笔记软件。</p>
    <a class="btn" href="/api/export.md?tz=${-new Date().getTimezoneOffset()}" download>⬇️ 导出 Markdown</a>
  </div>
  <div class="panel bar space"><button class="btn danger" id="logout">退出登录</button><span class="muted" style="font-size:12px">版本 ${VERSION}</span></div>`;
}

// ---------- 详情（底部弹出） ----------
let sheetEl = null;
function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } document.body.style.overflow = ""; }
// 从列表打开问题：记一条历史（手机返回键能关掉）；在问题之间跳转：替换掉这一条，不越堆越多
let sheetPushed = false;
function openQ(id) {
  if (route().view === "q") return location.replace(`#/q/${id}`);
  sheetPushed = true;
  go(`#/q/${id}`);
}
// 关闭详情：有历史就后退（手机返回键也一样），直接打开的链接就回到底下的页面
function leaveSheet() {
  if (sheetPushed) { sheetPushed = false; history.back(); }
  else location.replace(baseHash && !baseHash.startsWith("#/q/") ? baseHash : "#/");
}

function sheetHTML(q) {
  const p = qOf(q.parent_id), kids = childrenOf(q.id);
  const rel = S.links.filter((l) => l.a === q.id || l.b === q.id).map((l) => ({ l, other: qOf(l.a === q.id ? l.b : l.a) })).filter((x) => x.other);
  const ideas = UI.ideas[q.id];
  const busy = UI.busy[q.id] || {};
  const userSrc = q.source === "external_ai" || q.source === "self";
  return `
  <div class="sheet" role="dialog" aria-modal="true" aria-label="问题详情">
    <div class="sheet-head">
      <button class="btn small ghost" id="sh-close">✕ 关闭</button>
      <span class="muted" style="font-size:12.5px">${ymd(q.created_at)} ${hm(q.created_at)}</span>
      <button class="btn small ghost danger" id="sh-del">删除</button>
    </div>
    <div class="delbox" id="sh-delbox" hidden></div>

    ${p ? `<button class="parent-ctx" data-goto="${p.id}">
      <span class="muted">↖ 追问自</span> ${esc(p.text)}
      ${p.answer ? `<span class="pa">${esc(plainText(p.answer))}</span>` : ""}
    </button>` : ""}
    <textarea class="q-edit" id="sh-text" rows="1" aria-label="问题">${esc(q.text)}</textarea>
    <div class="bar" style="margin-top:6px">
      ${catOf(q.category_id) ? `<span class="chip">${catOf(q.category_id).emoji} ${esc(catOf(q.category_id).name)}</span>` : ""}
      ${topicOf(q.topic_id) ? `<span class="chip topic">${topicOf(q.topic_id).emoji} ${esc(topicOf(q.topic_id).name)}</span>` : ""}
      ${q.ask_by === "ai" ? `<span class="badge-ai">AI 提示的追问</span>` : ""}
      <button class="copy-tag" id="sh-copy">📋 复制提问</button>
    </div>
    ${suggestBar(q)}

    <div class="field">
      <div class="bar space"><span class="label" style="margin:0">答案</span>
        <span class="bar">
          ${hasAI() ? answerButtons(busy) : ""}
          <button class="btn small" id="sh-paste">📥 贴进来</button>
        </span></div>
      <textarea class="textarea" id="sh-ans" placeholder="写下答案，或者贴进来" style="margin-top:8px">${esc(plainText(q.answer))}</textarea>
      ${linksIn(q.answer)}
      <div class="src" id="sh-src">
        ${q.source === "site_ai" ? `<span class="chip on">${SRC.site_ai}</span><span>${esc(q.source_model || "")}</span>` : `
          <span>来源：</span>
          <button class="chip ${q.source === "external_ai" ? "on" : ""}" data-src="external_ai">${SRC.external_ai}</button>
          <button class="chip ${q.source === "self" ? "on" : ""}" data-src="self">${SRC.self}</button>`}
        ${userSrc ? `<label class="verify"><input type="checkbox" id="sh-ver" ${q.verified ? "checked" : ""} /> ✅ 我验证过</label>` : ""}
      </div>
    </div>

    <h4 class="section-t">🌿 追问 <span class="muted" style="font-size:13px;font-weight:400">好奇心的下一步</span></h4>
    ${kids.length ? `<div class="list">${kids.map((k) => `<button class="mini" data-goto="${k.id}">${k.answer ? "💡" : "🌱"} ${esc(k.text)}${k.ask_by === "ai" ? ` <span class="badge-ai">AI</span>` : ""}<small>${ymd(k.created_at).slice(5)}</small></button>`).join("")}</div>` : ""}
    <form id="sh-follow" class="capture" style="margin-top:10px">
      <textarea name="text" rows="1" placeholder="我还想问…" aria-label="追问"></textarea>
      <div class="row">
        ${hasAI() ? `<button type="button" class="btn small ghost" id="sh-ideas" ${busy.ideas ? "disabled" : ""}>${busy.ideas ? `<span class="spin">💭</span> 想想…` : "💭 没思路？让 AI 提示一下"}</button>` : "<span></span>"}
        <button class="btn small primary">追问</button>
      </div>
      ${ideas?.length ? `<div class="ideas"><span class="muted" style="font-size:12.5px">AI 的提示，点一下放进追问框：</span>${ideas.map((t) => `<button type="button" class="idea" data-idea="${esc(t)}">💭 ${esc(t)}</button>`).join("")}</div>` : ""}
    </form>

    ${rel.length ? `<h4 class="section-t">🔗 有关联的问题</h4><div class="list">${rel.map(({ l, other }) => `<button class="mini" data-goto="${other.id}">${esc(other.text)}<small>${esc(l.why)}</small></button>`).join("")}</div>` : ""}

    <details class="more" ${UI.moreOpen ? "open" : ""}>
      <summary>${q.topic_id ? "课题 · 场景" : "分类 · 课题 · 场景"}</summary>
      <div class="two field ${q.topic_id ? "no-cat" : ""}">
        <div ${q.topic_id ? "hidden" : ""}><label class="label" for="sh-cat">分类</label>
          <select class="input" id="sh-cat"><option value="">📥 未分类</option>
          ${S.categories.map((c) => `<option value="${c.id}" ${c.id === q.category_id ? "selected" : ""}>${c.emoji} ${esc(c.name)}</option>`).join("")}</select></div>
        <div><label class="label" for="sh-topic">课题</label>
          <select class="input" id="sh-topic"><option value="">— 不属于课题（放回火花）—</option>
          ${S.topics.map((t) => `<option value="${t.id}" ${t.id === q.topic_id ? "selected" : ""}>${t.emoji} ${esc(t.name)}</option>`).join("")}</select></div>
      </div>
      <div class="field"><label class="label" for="sh-ctx">当时的场景</label>
        <input class="input" id="sh-ctx" value="${esc(q.context)}" placeholder="非必填" /></div>
    </details>
  </div>`;
}

function openSheet(id) {
  const q = qOf(id);
  if (!q) return;
  closeSheet();
  sheetEl = document.createElement("div");
  sheetEl.className = "sheet-bg";
  sheetEl.innerHTML = sheetHTML(q);
  document.body.appendChild(sheetEl);
  document.body.style.overflow = "hidden";
  bindSheet(q.id);
}
function refreshSheet(id) {
  if (!sheetEl) return;
  const scroll = $(".sheet", sheetEl).scrollTop;
  sheetEl.innerHTML = sheetHTML(qOf(id));
  bindSheet(id); // 先把输入框撑到正确高度，再恢复滚动位置
  $(".sheet", sheetEl).scrollTop = scroll;
}

async function patchQ(id, patch, { silent = true } = {}) {
  try {
    upsertQ(await api(`questions/${id}`, { method: "PATCH", body: patch }));
    if (!silent) toast("已保存");
  } catch (e) { toast(e.message); }
}

function bindSheet(id) {
  autoGrow(sheetEl);
  const q = () => qOf(id);
  const sh = sheetEl;
  const leave = leaveSheet;
  sh.onclick = (e) => { if (e.target === sh) leave(); };
  $("#sh-close", sh).onclick = leave;
  $("#sh-del", sh).onclick = () => {
    const kids = descendants(id).length;
    const box = $("#sh-delbox", sh);
    box.innerHTML = `<span>删除这个问题？</span><span class="bar">
      ${kids ? `<button class="btn small" data-delk="0">只删这个</button><button class="btn small danger-fill" data-delk="1">连同 ${kids} 个追问一起删</button>`
             : `<button class="btn small danger-fill" data-delk="0">确认删除</button>`}
      <button class="btn small ghost" data-delk="x">取消</button></span>`;
    box.hidden = false;
    $$("[data-delk]", box).forEach((b) => (b.onclick = async () => {
      if (b.dataset.delk === "x") { box.hidden = true; return; }
      await deleteQuestions([id], b.dataset.delk === "1");
      leaveSheet();
    }));
  };
  const qt = $("#sh-text", sh);
  const fit = () => { qt.style.height = "auto"; qt.style.height = qt.scrollHeight + "px"; };
  fit(); qt.oninput = fit;
  $("#sh-copy", sh).onclick = () => copyQuestion(q());
  const more = $("details.more", sh);
  more.ontoggle = () => { UI.moreOpen = more.open; };
  $("#sh-text", sh).onchange = (e) => { const v = e.target.value.trim(); if (v) patchQ(id, { text: v }); };
  $("#sh-ctx", sh).onchange = (e) => patchQ(id, { context: e.target.value.trim() });
  $("#sh-cat", sh).onchange = async (e) => {
    const s = { ...(q().suggest || {}) }; delete s.category_id; delete s.new_category;
    await patchQ(id, { category_id: e.target.value || null, suggest: Object.keys(s).length ? s : null });
    refreshSheet(id);
  };
  $("#sh-topic", sh).onchange = async (e) => {
    const s = { ...(q().suggest || {}) }; delete s.topic_id;
    await patchQ(id, { topic_id: e.target.value || null, suggest: Object.keys(s).length ? s : null });
    refreshSheet(id);
  };
  $$("[data-goto]", sh).forEach((b) => (b.onclick = () => openQ(b.dataset.goto)));
  $$("[data-sg]", sh).forEach((b) => (b.onclick = async () => { await acceptSuggest(b.dataset.id, b.dataset.sg); }));
  $$("[data-sgx]", sh).forEach((b) => (b.onclick = async () => { await dismissSuggest(b.dataset.id, b.dataset.sgx); }));

  // 答案：贴进来默认是「外部 AI」，手打默认是「自己写」，都可以再改
  const ans = $("#sh-ans", sh);
  let pasted = false;
  ans.addEventListener("paste", (e) => {
    pasted = true;
    const t = e.clipboardData?.getData("text/plain");
    if (t && /\*\*|^#{1,6}\s|^\s*[-*]\s|`/m.test(t)) {
      e.preventDefault();
      const clean = plainText(t), s0 = ans.selectionStart, s1 = ans.selectionEnd;
      ans.value = ans.value.slice(0, s0) + clean + ans.value.slice(s1);
      ans.dispatchEvent(new Event("input"));
    }
  });
  ans.onchange = async () => {
    const v = ans.value.trim();
    const patch = { answer: v };
    if (!v) Object.assign(patch, { source: null, source_model: null, verified: false });
    else if (!q().source || q().source === "site_ai") Object.assign(patch, { source: pasted ? "external_ai" : "self", source_model: null, verified: false });
    pasted = false;
    await patchQ(id, patch, { silent: false });
    refreshSheet(id);
  };
  $("#sh-paste", sh).onclick = async () => {
    try {
      const t = plainText(await navigator.clipboard.readText());
      if (!t) return toast("剪贴板是空的");
      await patchQ(id, { answer: t, source: "external_ai", source_model: null, verified: false });
      toast("贴好了，来源标为外部 AI");
      refreshSheet(id);
    } catch {
      ans.focus();
      toast("请在框里长按粘贴");
    }
  };
  $$("[data-src]", sh).forEach((b) => (b.onclick = async () => { await patchQ(id, { source: b.dataset.src }); refreshSheet(id); }));
  const ver = $("#sh-ver", sh);
  if (ver) ver.onchange = () => patchQ(id, { verified: ver.checked });

  const ask = (btn, online) => async () => {
    if (q().answer && btn.dataset.sure !== "1") { btn.dataset.sure = "1"; btn.textContent = "会覆盖现在的答案，再点一次"; return; }
    UI.busy[id] = { ...UI.busy[id], answer: true }; refreshSheet(id);
    try {
      const r = await api("ai/answer", { method: "POST", body: { id, online } });
      if (r._note) toast(r._note);
      delete r._note;
      upsertQ(r);
    }
    catch (e) { toast(e.message.slice(0, 90)); }
    UI.busy[id] = { ...UI.busy[id], answer: false }; refreshSheet(id);
  };
  const aiBtn = $("#sh-ai", sh);
  if (aiBtn) aiBtn.onclick = ask(aiBtn, onlineFirst());

  const ff = $("#sh-follow", sh);
  ff.onsubmit = async (e) => {
    e.preventDefault();
    const text = ff.text.value.trim();
    if (!text) return ff.text.focus();
    const fromAI = (UI.ideas[id] || []).includes(text);
    const nq = await api("questions", { method: "POST", body: { text, parent_id: id, ask_by: fromAI ? "ai" : "self" } });
    upsertQ(nq);
    UI.ideas[id] = (UI.ideas[id] || []).filter((t) => t !== text);
    toast("追问记下了 🌿");
    refreshSheet(id);
  };
  const ib = $("#sh-ideas", sh);
  if (ib) ib.onclick = async () => {
    UI.busy[id] = { ...UI.busy[id], ideas: true }; refreshSheet(id);
    try { UI.ideas[id] = (await api("ai/followups", { method: "POST", body: { id } })).items; }
    catch (e) { toast(e.message.slice(0, 80)); }
    UI.busy[id] = { ...UI.busy[id], ideas: false }; refreshSheet(id);
  };
  // 点提示：直接填进追问框，可以改一改再点「追问」
  $$("[data-idea]", sh).forEach((b) => (b.onclick = () => { ff.text.value = b.dataset.idea; ff.text.focus(); ff.text.setSelectionRange(ff.text.value.length, ff.text.value.length); }));
}

// ---------- 回顾：网络图 ----------
let graph = null;

// 网络图上显示的短标签：优先用 AI 缩写，没有就从问题里截几个字
const STRIP_HEAD = /^(为什么|为啥|怎么样|怎么|如何|什么是|什么叫|是不是|能不能|可不可以|有没有|请问|到底)/;
function shortLabel(q) {
  if (q.short) return q.short;
  const t = q.text.replace(/[？?！!。，,\s]+$/g, "").replace(STRIP_HEAD, "").replace(/(吗|呢|啊)$/, "");
  return t.length > 5 ? t.slice(0, 5) + "…" : t || q.text.slice(0, 5);
}

function statTile(href, num, label) {
  return `<a class="stat link" href="${href}"><b>${num}</b><span>${label} ›</span></a>`;
}

function viewReview() {
  const weekAgo = Date.now() - 7 * 864e5;
  const n = S.questions.length;
  const missingShort = S.questions.some((q) => !q.short);
  return `
  <section class="hero"><div class="deco" aria-hidden="true">🕸 🔭 ✨</div><h1>回顾</h1></section>
  <div class="stats">
    ${statTile("#/stats", n, "个问题")}
    ${statTile("#/stats", S.questions.filter((q) => q.created_at > weekAgo).length, "本周新问题")}
    ${statTile("#/open", S.questions.filter((q) => !q.answer).length, "还没答案")}
    ${statTile("#/stats", S.questions.filter((q) => q.parent_id).length, "次追问")}
  </div>
  ${n ? `<div class="graph-box" id="gbox">
      <canvas id="gc" aria-label="好奇心网络图：拖动旋转，双指缩放，点一个点查看问题"></canvas>
      <div class="graph-hint">拖动旋转 · 双指缩放 · 点一下看问题</div>
      <div class="graph-tip" id="gtip"></div>
    </div>
  <div class="legend"><span><i></i>追问</span><span><i class="faint"></i>同一课题</span><span><i class="dash"></i>AI 发现的关联</span><span>○ 未解答 ● 已解答</span></div>
  ${hasAI() && missingShort ? `<p class="muted" style="font-size:13px;margin:6px 0 0" id="short-note">✨ 正在让 AI 把问题缩成几个字的标签…</p>` : ""}` :
  `<div class="empty"><span class="big">🕸</span>记下几个问题后，这里会长出你的好奇心网络</div>`}
  ${hasAI() && n >= 3 ? `<div class="panel"><h3>🔍 找找隐藏的关联</h3><p>让 AI 看看你不同时间问过的问题，有没有其实相通的。它只是建议，不对可以删掉。</p>
    <button class="btn brass" id="relate">开始寻找</button></div>` : ""}
  ${S.links.length ? `<div class="panel"><h3>🔗 AI 发现的关联</h3><div class="list">${S.links.map((l) => {
    const a = qOf(l.a), b = qOf(l.b); if (!a || !b) return "";
    return `<div class="mini" style="cursor:default;flex-wrap:wrap"><span><a href="#/q/${a.id}">${esc(a.text)}</a> ↔ <a href="#/q/${b.id}">${esc(b.text)}</a><br/><span class="muted" style="font-size:13px">${esc(l.why)}</span></span>
    <button class="btn small ghost" data-unlink="${l.id}" style="margin-left:auto">删掉</button></div>`;
  }).join("")}</div></div>` : ""}
  <div style="height:40px"></div>`;
}

// 缺短标签的问题，进回顾页时让 AI 一次性补上（只补缺的，补过就不再花额度）
let shortening = false;
async function fillShorts() {
  if (shortening || !hasAI() || !S.questions.some((q) => !q.short)) return;
  shortening = true;
  try {
    const { items } = await api("ai/shorten", { method: "POST" });
    for (const [id, short] of Object.entries(items || {})) { const q = qOf(id); if (q) q.short = short; }
    if (graph) graph.relabel();
  } catch (e) { console.warn("shorten", e); }
  shortening = false;
  const note = $("#short-note"); if (note) note.remove();
}

function catColor(id) {
  const palette = ["#b4741a", "#1d7a76", "#6a5acd", "#c0504d", "#4f8a3a", "#2f6db5", "#a0527a", "#7a7a2a"];
  const i = S.categories.findIndex((c) => c.id === id);
  return i < 0 ? "#8f99b5" : palette[i % palette.length];
}

// 3D 球形网络：节点在三维空间里做力导向布局，投影到画布上，可以 360° 旋转
function startGraph() {
  const box = $("#gbox");
  if (!box) return;
  const cv = $("#gc"), ctx = cv.getContext("2d"), tip = $("#gtip");
  const css = getComputedStyle(document.documentElement);
  const col = (v) => css.getPropertyValue(v).trim();
  const C = { ink: col("--ink"), muted: col("--muted"), line: col("--line"), brass: col("--brass"), teal: col("--teal"), paper: col("--paper") };
  const font = getComputedStyle(document.body).fontFamily;
  let W, H, dpr;
  const resize = () => { dpr = devicePixelRatio || 1; W = box.clientWidth; H = box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
  resize();

  // 初始位置：均匀撒在球面上（斐波那契球）
  const N = S.questions.length;
  const R0 = 60 + Math.sqrt(N) * 18;
  const nodes = S.questions.map((q, i) => {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    return { q, x: Math.cos(th) * r * R0, y: y * R0, z: Math.sin(th) * r * R0, vx: 0, vy: 0, vz: 0, deg: 0, label: shortLabel(q) };
  });
  const byId = Object.fromEntries(nodes.map((n) => [n.q.id, n]));
  const edges = [];
  for (const n of nodes) if (n.q.parent_id && byId[n.q.parent_id]) edges.push({ a: byId[n.q.parent_id], b: n, k: "parent" });
  for (const t of S.topics) {
    const qs = nodes.filter((n) => n.q.topic_id === t.id).sort((a, b) => a.q.created_at - b.q.created_at);
    for (let i = 1; i < qs.length; i++) if (qs[i].q.parent_id !== qs[i - 1].q.id) edges.push({ a: qs[i - 1], b: qs[i], k: "topic" });
  }
  for (const l of S.links) if (byId[l.a] && byId[l.b]) edges.push({ a: byId[l.a], b: byId[l.b], k: "ai" });
  edges.forEach((e) => { e.a.deg++; e.b.deg++; });

  let rotY = 0.4, rotX = -0.25, zoom = 1, panX = 0, panY = 0, alpha = 1, running = true;
  let autoSpin = !matchMedia("(prefers-reduced-motion: reduce)").matches, lastTouch = 0, selected = null;
  const rad = (n) => 4 + Math.min(n.deg, 6) * 1.3;

  function step() {
    if (alpha < 0.003) return;
    alpha *= 0.99;
    for (let i = 0; i < N; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < N; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z, d2 = dx * dx + dy * dy + dz * dz + 0.01;
        if (d2 > 160000) continue;
        const f = (260 / d2) * alpha;
        a.vx += dx * f; a.vy += dy * f; a.vz += dz * f; b.vx -= dx * f; b.vy -= dy * f; b.vz -= dz * f;
      }
      // 拉回球壳附近，整体保持成一个球
      const d = Math.hypot(a.x, a.y, a.z) || 1, pull = ((d - R0) / d) * 0.03;
      a.vx -= a.x * pull; a.vy -= a.y * pull; a.vz -= a.z * pull;
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, dz = e.b.z - e.a.z, d = Math.hypot(dx, dy, dz) || 1;
      const target = e.k === "parent" ? 40 : e.k === "ai" ? 70 : 60;
      const f = ((d - target) / d) * 0.04 * alpha * (e.k === "topic" ? 0.5 : 1);
      e.a.vx += dx * f; e.a.vy += dy * f; e.a.vz += dz * f; e.b.vx -= dx * f; e.b.vy -= dy * f; e.b.vz -= dz * f;
    }
    for (const n of nodes) {
      n.vx *= 0.8; n.vy *= 0.8; n.vz *= 0.8;
      const v = Math.hypot(n.vx, n.vy, n.vz);
      if (v > 6) { n.vx *= 6 / v; n.vy *= 6 / v; n.vz *= 6 / v; } // 限速，避免炸开
      n.x += n.vx; n.y += n.vy; n.z += n.vz;
    }
  }

  // 旋转 + 透视投影
  function project() {
    const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
    let rMax = 1;
    for (const n of nodes) rMax = Math.max(rMax, Math.hypot(n.x, n.y, n.z));
    const fov = rMax * 4, scale = (Math.min(W, H) / (rMax * 2.7)) * zoom;
    for (const n of nodes) {
      const x1 = n.x * cy - n.z * sy, z1 = n.x * sy + n.z * cy;
      const y2 = n.y * cx - z1 * sx, z2 = n.y * sx + z1 * cx;
      const p = fov / (fov + z2);
      n.sx = W / 2 + panX + x1 * p * scale;
      n.sy = H / 2 + panY + y2 * p * scale;
      n.sz = z2; n.sp = p * zoom;
    }
  }

  function draw() {
    project();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const zs = nodes.map((n) => n.sz), zMin = Math.min(...zs), zMax = Math.max(...zs), zr = zMax - zMin || 1;
    const fade = (n) => 0.25 + 0.75 * (1 - (n.sz - zMin) / zr); // 近的清楚，远的淡
    for (const e of edges) {
      ctx.globalAlpha = Math.min(fade(e.a), fade(e.b));
      ctx.beginPath(); ctx.moveTo(e.a.sx, e.a.sy); ctx.lineTo(e.b.sx, e.b.sy);
      ctx.setLineDash(e.k === "ai" ? [5, 4] : []);
      ctx.strokeStyle = e.k === "parent" ? C.brass : e.k === "ai" ? C.teal : C.line;
      ctx.lineWidth = e.k === "topic" ? 1 : 1.6;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    const order = [...nodes].sort((a, b) => b.sz - a.sz); // 远的先画
    for (const n of order) {
      const f = fade(n), r = rad(n) * Math.max(0.6, n.sp);
      ctx.globalAlpha = f;
      ctx.beginPath(); ctx.arc(n.sx, n.sy, r, 0, Math.PI * 2);
      ctx.fillStyle = n.q.answer ? catColor(n.q.category_id) : C.paper;
      ctx.fill();
      ctx.lineWidth = n === selected ? 3 : 2; ctx.strokeStyle = n === selected ? C.ink : catColor(n.q.category_id); ctx.stroke();
      if (f > 0.45 || n === selected) {
        const fs = Math.round(Math.max(10, Math.min(14, 12 * n.sp)));
        ctx.font = `${n === selected ? 600 : 400} ${fs}px ${font}`;
        ctx.fillStyle = n === selected ? C.ink : C.muted;
        ctx.globalAlpha = n === selected ? 1 : f;
        ctx.fillText(n.label, n.sx + r + 4, n.sy + fs / 3);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop() {
    if (!running) return;
    step();
    if (autoSpin && Date.now() - lastTouch > 2500) rotY += 0.0025;
    draw();
    requestAnimationFrame(loop);
  }
  loop();

  // ---- 手势：单指拖动旋转，双指缩放+平移，点一下选中 ----
  const pts = new Map();
  let downInfo = null, pinch = null;
  const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const pick = (p) => {
    let best = null, bd = 1e9;
    for (const n of nodes) { const d = Math.hypot(n.sx - p.x, n.sy - p.y); if (d < rad(n) * n.sp + 12 && n.sz < bd) { best = n; bd = n.sz; } }
    return best;
  };
  cv.onpointerdown = (e) => {
    cv.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, pos(e));
    lastTouch = Date.now();
    if (pts.size === 1) downInfo = { ...pos(e), rotX, rotY, moved: false, t: Date.now() };
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, panX, panY };
      if (downInfo) downInfo.moved = true;
    }
  };
  cv.onpointermove = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, pos(e));
    lastTouch = Date.now();
    if (pts.size >= 2 && pinch) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoom = Math.min(4, Math.max(0.4, pinch.zoom * (d / pinch.d)));
      panX = pinch.panX + (a.x + b.x) / 2 - pinch.mx;
      panY = pinch.panY + (a.y + b.y) / 2 - pinch.my;
    } else if (downInfo) {
      const p = pos(e), dx = p.x - downInfo.x, dy = p.y - downInfo.y;
      if (Math.hypot(dx, dy) > 6) downInfo.moved = true;
      rotY = downInfo.rotY + dx * 0.008;
      rotX = Math.max(-1.5, Math.min(1.5, downInfo.rotX + dy * 0.008));
    }
  };
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size === 0 && downInfo) {
      if (!downInfo.moved) select(pick(pos(e)));
      downInfo = null;
    }
  };
  cv.onpointerup = up; cv.onpointercancel = up;
  cv.onwheel = (e) => { e.preventDefault(); lastTouch = Date.now(); zoom = Math.min(4, Math.max(0.4, zoom * Math.exp(-e.deltaY * 0.0015))); };

  function select(n) {
    selected = n;
    if (!n) { tip.style.display = "none"; return; }
    const c = catOf(n.q.category_id);
    tip.style.display = "flex";
    tip.innerHTML = `<span>${c ? c.emoji + " " : ""}${esc(n.q.text)}</span><button class="btn small primary" id="gopen">打开 →</button>`;
    $("#gopen").onclick = () => openQ(n.q.id);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(box);
  graph = {
    stop() { running = false; ro.disconnect(); graph = null; },
    relabel() { nodes.forEach((n) => (n.label = shortLabel(n.q))); },
  };
  fillShorts();
}

// ---------- 统计（从回顾里点进来） ----------
const C_DONE = "var(--c-done)", C_OPEN = "var(--c-open)";
function viewStats() {
  const range = UI.range || 30;
  const DAY = 864e5;
  const today0 = new Date(); today0.setHours(0, 0, 0, 0);
  const byWeek = range > 31;
  const bucketMs = byWeek ? 7 * DAY : DAY;
  const nB = byWeek ? Math.ceil(range / 7) : range;
  const start = today0.getTime() - (byWeek ? (nB * 7 - 1) : (nB - 1)) * DAY;
  const buckets = Array.from({ length: nB }, (_, i) => ({ t: start + i * bucketMs, done: 0, open: 0 }));
  const inRange = S.questions.filter((q) => q.created_at >= start);
  for (const q of inRange) {
    const i = Math.min(nB - 1, Math.floor((q.created_at - start) / bucketMs));
    if (i >= 0) buckets[i][q.answer ? "done" : "open"]++;
  }
  const max = Math.max(1, ...buckets.map((b) => b.done + b.open));

  // 连续记录天数（从今天或昨天往前数）
  const days = new Set(S.questions.map((q) => ymd(q.created_at)));
  let streak = 0, d = new Date(today0);
  if (!days.has(ymd(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(ymd(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); }
  const activeDays = new Set(inRange.map((q) => ymd(q.created_at))).size;
  const doneRate = inRange.length ? Math.round((inRange.filter((q) => q.answer).length / inRange.length) * 100) : 0;

  // 柱状图（SVG）
  const VW = 360, VH = 190, padL = 22, padB = 22, padT = 8, cw = VW - padL - 8, ch = VH - padB - padT;
  const bw = cw / nB, barW = Math.max(2, Math.min(18, bw - 2));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const yOf = (v) => padT + ch - (v / max) * ch;
  const lbl = (t) => { const x = new Date(t); return `${x.getMonth() + 1}/${x.getDate()}`; };
  const every = Math.ceil(nB / 6);
  const bars = buckets.map((b, i) => {
    const x = padL + i * bw + (bw - barW) / 2;
    const hD = (b.done / max) * ch, hO = (b.open / max) * ch;
    const gap = b.done && b.open ? 2 : 0;
    const tipText = `${byWeek ? lbl(b.t) + " 那一周" : lbl(b.t)}｜已解答 ${b.done}・待解答 ${b.open}`;
    return `<g class="bar" data-tip="${tipText}">
      <rect x="${padL + i * bw}" y="${padT}" width="${bw}" height="${ch}" fill="transparent"/>
      ${b.done ? `<path d="${roundTop(x, padT + ch - hD, barW, hD, b.open ? 0 : 3)}" style="fill:${C_DONE}"/>` : ""}
      ${b.open ? `<path d="${roundTop(x, padT + ch - hD - gap - hO, barW, hO, 3)}" style="fill:${C_OPEN}"/>` : ""}
      ${i % every === nB % every || i === nB - 1 ? `<text x="${x + barW / 2}" y="${VH - 6}" text-anchor="middle" class="ax">${lbl(b.t)}</text>` : ""}
    </g>`;
  }).join("");
  const grid = ticks.map((v) => `<line x1="${padL}" x2="${VW - 8}" y1="${yOf(v)}" y2="${yOf(v)}" class="gl"/><text x="${padL - 6}" y="${yOf(v) + 4}" text-anchor="end" class="ax">${v}</text>`).join("");

  // 分类分布
  const catCounts = [...S.categories.map((c) => ({ label: `${c.emoji} ${c.name}`, n: inRange.filter((q) => q.category_id === c.id).length })),
    { label: "📥 未分类", n: inRange.filter((q) => !q.category_id && !q.topic_id).length },
    { label: "🧭 课题里", n: inRange.filter((q) => q.topic_id && !q.category_id).length }]
    .filter((x) => x.n).sort((a, b) => b.n - a.n);
  const catMax = Math.max(1, ...catCounts.map((x) => x.n));

  // 一天里什么时候最好奇
  const hours = Array(24).fill(0);
  inRange.forEach((q) => hours[new Date(q.created_at).getHours()]++);
  const hMax = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));

  return `
  <section class="hero"><div><a href="#/review" style="text-decoration:none;font-size:14px">← 回顾</a></div><h1>好奇心的节奏</h1></section>
  <div class="seg" role="tablist">
    ${[[7, "7 天"], [30, "30 天"], [90, "3 个月"]].map(([v, l]) => `<button class="${range === v ? "on" : ""}" data-range="${v}">${l}</button>`).join("")}
  </div>
  <div class="stats">
    <div class="stat"><b>${inRange.length}</b><span>个问题</span></div>
    <div class="stat"><b>${streak}</b><span>天连续在问</span></div>
    <div class="stat"><b>${activeDays}</b><span>天有提问</span></div>
    <div class="stat"><b>${doneRate}<small>%</small></b><span>已找到答案</span></div>
  </div>
  <div class="panel chart">
    <div class="bar space"><h3>${byWeek ? "每周" : "每天"}问了多少</h3>
      <div class="legend" style="margin:0"><span><i class="sw" style="background:${C_DONE}"></i>已解答</span><span><i class="sw" style="background:${C_OPEN}"></i>待解答</span></div></div>
    <div class="chart-wrap"><svg viewBox="0 0 ${VW} ${VH}" role="img" aria-label="${byWeek ? "每周" : "每天"}提问数量柱状图">${grid}${bars}</svg>
    <div class="ctip" id="ctip"></div></div>
  </div>
  ${catCounts.length ? `<div class="panel chart"><h3>都在好奇什么</h3>
    <div class="hbars">${catCounts.map((x) => `<div class="hb"><span class="hl">${esc(x.label)}</span><span class="ht"><i style="width:${(x.n / catMax) * 100}%"></i></span><span class="hn">${x.n}</span></div>`).join("")}</div></div>` : ""}
  ${inRange.length ? `<div class="panel chart"><h3>一天里什么时候最好奇</h3><p>${inRange.length >= 3 ? `你最常在 <b>${peak}:00–${peak + 1}:00</b> 冒出问题` : "多记几个问题，这里会更有意思"}</p>
    <div class="hours">${hours.map((v, h) => `<div class="hc" title="${h}:00 · ${v} 个"><i style="height:${(v / hMax) * 100}%"></i></div>`).join("")}</div>
    <div class="hours-ax"><span>0 点</span><span>6</span><span>12</span><span>18</span><span>24</span></div></div>` : ""}
  <div style="height:40px"></div>`;
}
// 顶部圆角、底部贴着基线的柱子
function roundTop(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function keepScroll(fn) { const y = scrollY; keepDraft(fn); scrollTo(0, y); }
function selBar() {
  if (!UI.selecting) return "";
  const n = UI.sel.size;
  const kids = new Set([...UI.sel].flatMap(descendants).filter((id) => !UI.sel.has(id))).size;
  return `<div class="selbar" id="selbar">${UI.selConfirm ? `
    <span>删除这 ${n} 个问题？</span>
    <span class="bar">
      ${kids ? `<button class="btn small" id="sel-only">只删选中的</button><button class="btn small danger-fill" id="sel-kids">连同 ${kids} 个追问一起删</button>`
             : `<button class="btn small danger-fill" id="sel-only">确认删除</button>`}
      <button class="btn small ghost" id="sel-back">再想想</button>
    </span>` : `
    <span>已选 <b>${n}</b> 个</span>
    <span class="bar">
      <button class="btn small ghost" id="sel-all">全选</button>
      <button class="btn small danger-fill" id="sel-del" ${n ? "" : "disabled"}>删除</button>
      <button class="btn small ghost" id="sel-cancel">取消</button>
    </span>`}
  </div>`;
}

function keepDraft(fn) {
  const f = $("form.capture:not(#sh-follow)");
  const draft = f ? { text: f.text.value, context: f.context.value } : null;
  fn();
  const g = $("form.capture:not(#sh-follow)");
  if (g && draft) { g.text.value = draft.text; g.context.value = draft.context; }
}

function autoGrow(root = document) {
  $$("textarea", root).forEach((t) => {
    if (t.dataset.grow) return;
    t.dataset.grow = "1";
    const fit = () => { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; };
    t.addEventListener("input", fit);
    if (t.isConnected) fit(); else requestAnimationFrame(fit); // 立刻撑开，避免高度先变小导致页面跳回顶部
  });
}

// 手势：在页面上向右滑打开分类，在抽屉上向左滑关上（不从屏幕最边缘开始，避免和手机的返回手势冲突）
(() => {
  let sx = 0, sy = 0, tracking = false;
  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    tracking = e.touches.length === 1 && !sheetEl && !e.target.closest("canvas, textarea, input, .graph-box");
    sx = t.clientX; sy = t.clientY;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!tracking) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dy) > 50 || Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    // 抽屉开着时：往左滑关上
    if (UI.drawer) { if (dx < 0) setDrawer(false); return; }
    if (sx < 24 || UI.selecting) return; // 屏幕最边缘留给手机的返回手势
    // 左右滑切换「火花 ⇄ 课题 ⇄ 回顾」；在火花再往右滑，拉出左边的分类抽屉
    const PAGES = ["home", "topics", "review"];
    const v = route().view;
    const cur = { topic: "topics", stats: "review", cats: "home" }[v] || v;
    const i = PAGES.indexOf(cur);
    if (i < 0) return;
    if (dx < 0 && i < PAGES.length - 1) swipeTo(PAGES[i + 1], "left");
    else if (dx > 0 && i > 0) swipeTo(PAGES[i - 1], "right");
    else if (dx > 0 && i === 0) setDrawer(true);
  }, { passive: true });
  function swipeTo(page, dir) {
    UI.slide = dir;
    go(page === "home" ? "#/" : `#/${page}`);
    scrollTo({ top: 0 });
  }
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && UI.drawer) setDrawer(false); });
})();

// ---------- 事件绑定 ----------
function bindCommon() {
  autoGrow();
  const mb = $("#menu-btn"); if (mb) mb.onclick = () => setDrawer(!UI.drawer);
  const nv = $("#now-viewing"); if (nv) nv.onclick = () => setDrawer(true);
  const dc = $("#drawer-close"); if (dc) dc.onclick = () => setDrawer(false);
  $$("[data-close-drawer]").forEach((a) => (a.onclick = () => { UI.drawer = false; if (a.hasAttribute("data-new-topic")) editingTopic = "new"; if (location.hash === a.getAttribute("href")) { setDrawer(false); render(); } }));
  const dbg = $("#drawer-bg"); if (dbg) dbg.onclick = () => setDrawer(false);
  if (UI.drawer) setDrawer(true);
  if (UI.fresh) setTimeout(() => { UI.fresh = null; }, 50);
  $$("form.capture:not(#sh-follow)").forEach((f) => {
    f.onsubmit = (e) => { e.preventDefault(); submitCapture(f, e.submitter?.dataset.mode || "save"); };
    f.text.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitCapture(f, hasAI() ? "answer" : "save"); };
  });
  // 长按分类标签可以改名
  $$("[data-cat], [data-pick]").forEach((el) => {
    const id = el.dataset.cat || el.dataset.pick;
    if (catOf(id)) bindLongPress(el, () => openCatSheet(id));
  });
  $$("[data-deck]").forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    UI.decks ||= new Set();
    UI.decks.has(b.dataset.deck) ? UI.decks.delete(b.dataset.deck) : UI.decks.add(b.dataset.deck);
    keepScroll(render);
  }));
  $$("[data-open]").forEach((el) => {
    if (!UI.selecting) bindLongPress(el, () => openMoveSheet(el.dataset.open));
  });
  $$("[data-open]").forEach((el) => (el.onclick = (e) => {
    if (el.dataset.longpressed) { delete el.dataset.longpressed; return; } // 长按后松手不算点击
    if (e.target.closest("button")) return;
    if (UI.selecting) { const id = el.dataset.open; UI.sel.has(id) ? UI.sel.delete(id) : UI.sel.add(id); keepScroll(render); return; }
    openQ(el.dataset.open);
  }));
  // 批量删除
  const selBtn = $("#sel-mode");
  if (selBtn) selBtn.onclick = () => { UI.drawer = false; UI.selecting = true; UI.sel = new Set(); UI.selConfirm = false; if (route().view !== "home" && route().view !== "topic") { UI.selView = null; go("#/"); } else render(); };
  const selBar = $("#selbar");
  if (selBar) {
    const on = (sel, fn) => { const el = $(sel); if (el) el.onclick = fn; };
    on("#sel-cancel", () => { UI.selecting = false; UI.sel = null; render(); });
    on("#sel-all", () => { $$("[data-open]").forEach((c) => UI.sel.add(c.dataset.open)); keepScroll(render); });
    on("#sel-del", () => { if (UI.sel.size) { UI.selConfirm = true; keepScroll(render); } });
    const go = async (withKids) => {
      await deleteQuestions([...UI.sel], withKids);
      UI.selecting = false; UI.sel = null; UI.selConfirm = false; render();
    };
    const a = $("#sel-only"), b = $("#sel-kids"), c = $("#sel-back");
    if (a) a.onclick = () => go(false);
    if (b) b.onclick = () => go(true);
    if (c) c.onclick = () => { UI.selConfirm = false; keepScroll(render); };
  }
  $$("[data-sg]").forEach((b) => (b.onclick = () => acceptSuggest(b.dataset.id, b.dataset.sg)));
  $$("[data-sgx]").forEach((b) => (b.onclick = () => dismissSuggest(b.dataset.id, b.dataset.sgx)));
  $$("[data-cat]").forEach((b) => (b.onclick = () => { if (b.dataset.longpressed) { delete b.dataset.longpressed; return; } UI.cat = b.dataset.cat; UI.recent = new Set(); UI.drawer = false; if (route().view !== "home") { go("#/"); } else { render(); scrollTo({ top: 0 }); } }));
  const oo = $("#only-open"); if (oo) oo.onclick = () => { UI.onlyOpen = !UI.onlyOpen; UI.recent = new Set(); UI.drawer = false; if (route().view !== "home") go("#/"); else render(); };
  const dice = $("#dice"); if (dice) dice.onclick = () => {
    setDrawer(false);
    const open = S.questions.filter((q) => !q.answer && !q.topic_id);
    openQ(open[Math.floor(Math.random() * open.length)].id);
  };

  // 记录框里选分类（再点一次取消）、当场新建分类
  $$("[data-pick]").forEach((b) => (b.onclick = () => { if (b.dataset.longpressed) { delete b.dataset.longpressed; return; } UI.pickCat = b.dataset.pick || null; UI.pickOpen = false; keepScroll(render); }));
  const pt = $("#pick-toggle"); if (pt) pt.onclick = () => { UI.pickOpen = !UI.pickOpen; UI.newCatOpen = false; keepScroll(render); };
  $$("[data-newcat]").forEach((b) => (b.onclick = () => { UI.newCatOpen = !UI.newCatOpen; UI.pickOpen = false; keepScroll(render); const n = $("#nc-name"); if (n) n.focus(); }));
  const ncOk = $("#nc-ok");
  if (ncOk) ncOk.onclick = async () => {
    const name = $("#nc-name").value.trim();
    if (!name) return $("#nc-name").focus();
    try {
      const c = await api("categories", { method: "POST", body: { name, emoji: $("#nc-emoji").value.trim() || "🔍" } });
      S.categories.push(c);
      UI.pickCat = c.id; UI.newCatOpen = false;
      toast(`新分类 ${c.emoji} ${c.name}`);
      keepDraft(render);
    } catch (e) { toast(e.message); }
  };

  // emoji 选择
  $$(".emoji-pick").forEach((p) => p.onclick = (e) => {
    const b = e.target.closest("[data-emo]"); if (!b) return;
    const inp = p.closest("form")[p.dataset.for];
    inp.value = b.dataset.emo;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // 分类
  $$("[data-tile]").forEach((t) => (t.onclick = (e) => { if (e.target.closest("[data-edit-cat]")) return; UI.cat = t.dataset.tile; go("#/"); }));
  $$("[data-edit-cat]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); editingCat = b.dataset.editCat; render(); scrollTo(0, 0); }));
  const ca = $("#cat-add"); if (ca) ca.onclick = () => { editingCat = "new"; render(); scrollTo(0, 0); $("#cat-form input[name=name]").focus(); };
  const cf = $("#cat-form");
  if (cf) {
    cf.onsubmit = async (e) => {
      e.preventDefault();
      const body = { name: cf.name.value.trim(), emoji: cf.emoji.value.trim() || "🔍" };
      if (!body.name) return cf.name.focus();
      if (cf.dataset.id) { const c = await api(`categories/${cf.dataset.id}`, { method: "PATCH", body }); Object.assign(catOf(c.id), c); }
      else S.categories.push(await api("categories", { method: "POST", body }));
      editingCat = null; render();
    };
    $("#cat-cancel").onclick = () => { editingCat = null; render(); };
    const del = $("#cat-del");
    if (del) del.onclick = async () => {
      if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "问题会变成未分类，再点一次确认"; return; }
      await api(`categories/${cf.dataset.id}`, { method: "DELETE" });
      S.questions.forEach((q) => { if (q.category_id === cf.dataset.id) q.category_id = null; });
      S.categories = S.categories.filter((c) => c.id !== cf.dataset.id);
      editingCat = null; render();
    };
  }

  // 课题
  const ta = $("#topic-add"); if (ta) ta.onclick = () => { editingTopic = "new"; render(); $("#topic-form input[name=name]").focus(); };
  $$("[data-topic-open]").forEach((t) => (t.onclick = () => go(`#/topic/${t.dataset.topicOpen}`)));
  $$("[data-edit-topic]").forEach((b) => (b.onclick = () => { editingTopic = b.dataset.editTopic; render(); }));
  $$("[data-topic-status]").forEach((b) => (b.onclick = async () => {
    const t = topicOf(b.dataset.topicStatus);
    Object.assign(t, await api(`topics/${t.id}`, { method: "PATCH", body: { status: t.status === "done" ? "active" : "done" } }));
    toast(t.status === "done" ? "课题完成 🎉" : "课题重新打开"); render();
  }));
  const tf = $("#topic-form");
  if (tf) {
    tf.onsubmit = async (e) => {
      e.preventDefault();
      const body = { name: tf.name.value.trim(), emoji: tf.emoji.value.trim() || "🧭", goal: tf.goal.value.trim() };
      if (!body.name) return tf.name.focus();
      let t;
      if (tf.dataset.id) { t = await api(`topics/${tf.dataset.id}`, { method: "PATCH", body }); Object.assign(topicOf(t.id), t); }
      else { t = await api("topics", { method: "POST", body }); S.topics.unshift(t); }
      editingTopic = null;
      go(`#/topic/${t.id}`); render();
    };
    $("#topic-cancel").onclick = () => { editingTopic = null; render(); };
    const del = $("#topic-del");
    if (del) del.onclick = async () => {
      if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "问题会保留，只是不再属于课题。再点一次确认"; return; }
      await api(`topics/${tf.dataset.id}`, { method: "DELETE" });
      S.questions.forEach((q) => { if (q.topic_id === tf.dataset.id) q.topic_id = null; });
      S.topics = S.topics.filter((t) => t.id !== tf.dataset.id);
      editingTopic = null; go("#/topics");
    };
  }

  // 统计
  $$("[data-range]").forEach((b) => (b.onclick = () => { UI.range = +b.dataset.range; render(); }));
  const ctip = $("#ctip");
  if (ctip) $$(".chart-wrap .bar").forEach((g) => {
    const show = (e) => {
      $$(".chart-wrap .bar.hl").forEach((x) => x.classList.remove("hl")); g.classList.add("hl");
      ctip.textContent = g.dataset.tip; ctip.style.display = "block";
      const r = g.getBoundingClientRect(), w = g.closest(".chart-wrap").getBoundingClientRect();
      ctip.style.left = Math.min(w.width - ctip.offsetWidth, Math.max(0, r.left - w.left + r.width / 2 - ctip.offsetWidth / 2)) + "px";
    };
    g.onpointerenter = show; g.onclick = show;
  });

  // 回顾
  const rel = $("#relate");
  if (rel) rel.onclick = async () => {
    rel.disabled = true; rel.innerHTML = `<span class="spin">🔍</span> 寻找中…`;
    try {
      const { added } = await api("ai/relate", { method: "POST" });
      S.links.push(...added);
      toast(added.length ? `找到 ${added.length} 条新关联 🔗` : "暂时没发现新的关联");
    } catch (e) { toast(e.message.slice(0, 80)); }
    render();
  };
  $$("[data-unlink]").forEach((b) => (b.onclick = async () => {
    await api(`links/${b.dataset.unlink}`, { method: "DELETE" });
    S.links = S.links.filter((l) => l.id !== b.dataset.unlink); render();
  }));

  // 设置
  const tpl = $("#tpl-form");
  if (tpl) {
    tpl.onsubmit = async (e) => {
      e.preventDefault();
      S.settings = await api("settings", { method: "PUT", body: { template_daily: tpl.template_daily.value, template_topic: tpl.template_topic.value, copy_with_template: tpl.copy_with_template.checked ? "1" : "0" } });
      toast("模板已保存");
    };
    $("#tpl-reset").onclick = async () => { S.settings = await api("settings/reset", { method: "POST" }); render(); toast("已恢复默认模板"); };
  }
  const so = $("#set-online");
  if (so) so.onchange = async () => { S.settings = await api("settings", { method: "PUT", body: { answer_online: so.checked ? "1" : "0" } }); toast(so.checked ? "默认联网回答" : "默认不联网回答"); };
  $$("[data-pv]").forEach((sel) => (sel.onchange = () => {
    const p = { ...(window.Sky?.preview?.() || {}) };
    p[sel.dataset.pv] = sel.value;
    window.Sky?.setPreview(p);
  }));
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await api("logout", { method: "POST" }); renderLogin(); };
}

window.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetEl) leaveSheet(); });

// 第一次加载失败时不要留一个空白页，显示原因和重试按钮
load().catch((e) => {
  if (e.message === "请先登录") return; // 已经显示登录页
  app.innerHTML = `<div class="login"><div style="text-align:center;max-width:360px">
    <div class="big" style="font-size:48px">🔭</div>
    <h1 style="font-family:var(--font-display);margin:8px 0">雾窗</h1>
    <p class="err">${esc(e.message)}</p>
    <button class="btn primary" onclick="location.reload()">重试</button></div></div>`;
});
