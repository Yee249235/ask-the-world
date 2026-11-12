// 问世界 · 前端（无需构建，原生 JS）

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const app = $("#app");

const S = { categories: [], topics: [], questions: [], links: [], settings: {}, providers: [] };
const UI = { cat: "all", onlyOpen: false, ideas: {}, busy: {} };

const EMOJIS = ["🏠", "🍳", "📱", "💻", "🎮", "📚", "🔭", "🔍", "🧭", "🌱", "🧪", "🎨", "🎵", "🏃", "💰", "✈️", "🐱", "🌍", "🧠", "💡", "🛠️", "🚗", "🩺", "🌙"];
const SRC = { site_ai: "✨ 站内 AI", external_ai: "🌐 外部 AI", self: "✍️ 自己写" };

// ---------- 工具 ----------
async function api(path, opts = {}) {
  const res = await fetch("/api/" + path, {
    method: opts.method || "GET",
    headers: opts.body ? { "content-type": "application/json" } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  if (res.status === 401) { renderLogin(); throw new Error("请先登录"); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}
let toastT;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2400);
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
    text = `${tpl}\n\n我的问题：${text}`;
  }
  copyText(text);
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
    <div class="big">🔭</div>
    <h1>问世界</h1>
    <p class="muted">每天对世界发问的地方</p>
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
}

// ---------- 外框 ----------
function shell(inner, active) {
  const tabs = [["home", "#/", "✨ 火花"], ["topics", "#/topics", "🧭 课题"], ["review", "#/review", "🕸 回顾"], ["settings", "#/settings", "⚙️"]];
  return `
  <header class="top"><div class="wrap">
    <a class="brand" href="#/"><b>问世界</b><small>Ask the World</small></a>
    <nav class="nav">${tabs.map(([k, h, l]) => `<a href="${h}" class="${active === k ? "on" : ""}">${l}</a>`).join("")}</nav>
  </div></header>
  <main class="wrap">${inner}</main>`;
}

let navCount = 0, baseHash = "#/";
window.addEventListener("hashchange", () => { navCount++; render(); });
function render() {
  let r = route();
  const sheetId = r.view === "q" ? r.id : null;
  if (sheetId) {
    // 详情是叠在当前页面上的，底下保持原来的页面
    const h = baseHash.replace(/^#\/?/, "").split("/");
    r = { view: h[0] || "home", id: h[1] };
  } else baseHash = location.hash || "#/";
  const views = { home: viewHome, cats: viewCats, topics: viewTopics, topic: viewTopic, review: viewReview, settings: viewSettings };
  const fn = views[r.view] || viewHome;
  const active = r.view === "topic" ? "topics" : r.view === "cats" ? "home" : r.view;
  if (graph) graph.stop();
  app.innerHTML = shell(fn(r), active);
  bindCommon();
  if (r.view === "review") startGraph();
  closeSheet();
  if (sheetId) openSheet(sheetId);
}

// ---------- 记录框 ----------
function captureBox({ topicId = null, placeholder = "冒出一个问题？先记下来…" } = {}) {
  const pick = topicId ? "" : `
    <div class="pick-row" role="group" aria-label="选择分类">
      ${S.categories.map((c) => `<button type="button" class="chip ${UI.pickCat === c.id ? "on" : ""}" data-pick="${c.id}">${c.emoji} ${esc(c.name)}</button>`).join("")}
      <button type="button" class="chip add-cat" data-newcat>＋ 新分类</button>
    </div>
    ${UI.newCatOpen ? `<div class="newcat-row">
      <input class="input emo" id="nc-emoji" value="🔍" maxlength="4" aria-label="emoji" />
      <input class="input" id="nc-name" placeholder="新分类名，比如：云计算" maxlength="12" style="flex:1" />
      <button type="button" class="btn small primary" id="nc-ok">添加</button>
    </div>` : ""}`;
  return `
  <form class="capture" data-topic="${topicId || ""}">
    <textarea name="text" rows="2" placeholder="${placeholder}" aria-label="新问题"></textarea>
    <input class="ctx" name="context" placeholder="＋ 当时的场景（可不填）：在哪、因为什么想到的" aria-label="场景" />
    ${pick}
    <div class="row">
      <span class="hint">${topicId ? "会按时间排进这个课题" : UI.pickCat ? `放进 ${catOf(UI.pickCat)?.emoji || ""} ${esc(catOf(UI.pickCat)?.name || "")}` : "不选分类也可以，之后再放"}</span>
      <button class="btn primary">记下 ✍️</button>
    </div>
  </form>`;
}

async function submitCapture(form) {
  const text = form.text.value.trim();
  if (!text) return;
  const topicId = form.dataset.topic || null;
  const btn = form.querySelector("button");
  btn.disabled = true;
  try {
    const q = await api("questions", { method: "POST", body: { text, context: form.context.value.trim(), topic_id: topicId, category_id: topicId ? null : UI.pickCat || null } });
    upsertQ(q);
    form.reset();
    toast("记下了 🌱");
    render();
  } catch (e) { toast(e.message); }
  btn.disabled = false;
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
function card(q) {
  const c = catOf(q.category_id), t = topicOf(q.topic_id), p = qOf(q.parent_id);
  const kids = childrenOf(q.id).length;
  return `
  <article class="card ${q.answer ? "" : "open"}" data-open="${q.id}">
    <div class="meta">
      ${c ? `<span class="chip">${c.emoji} ${esc(c.name)}</span>` : `<span class="chip">📥 未分类</span>`}
      ${t ? `<span class="chip topic">${t.emoji} ${esc(t.name)}</span>` : ""}
      <span class="time">${hm(q.created_at)}</span>
    </div>
    <h3>${esc(q.text)}</h3>
    ${q.answer ? `<p class="ans">${esc(q.answer)}</p>` : `<p class="ans none">🌱 还没有答案</p>`}
    <div class="foot">
      ${p ? `<span>↖ 追问自「${esc(p.text.slice(0, 18))}${p.text.length > 18 ? "…" : ""}」</span>` : ""}
      ${kids ? `<span>↳ ${kids} 个追问</span>` : ""}
      ${q.answer && q.source ? `<span>${SRC[q.source]}${q.verified ? " · ✅" : ""}</span>` : ""}
    </div>
    ${suggestBar(q)}
  </article>`;
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
  if (UI.onlyOpen) qs = qs.filter((q) => !q.answer);
  const count = (id) => sparks.filter((q) => q.category_id === id).length;
  const uncat = sparks.filter((q) => !q.category_id).length;
  const open = sparks.filter((q) => !q.answer).length;

  let body = "";
  if (!sparks.length) {
    body = `<div class="empty"><span class="big">🔍</span>还没有问题。<br/>今天有什么让你好奇的吗？哪怕很小的事都可以。</div>`;
  } else if (!qs.length) {
    body = `<div class="empty"><span class="big">🧭</span>这里还没有问题</div>`;
  } else {
    const groups = {};
    for (const q of qs) (groups[ymd(q.created_at)] ||= []).push(q);
    body = Object.values(groups).map((g) => {
      const [a, b] = dayLabel(g[0].created_at);
      return `<div class="day"><h2>${a}</h2><span>${b} · ${g.length} 个问题</span></div><div class="list">${g.map(card).join("")}</div>`;
    }).join("");
  }
  return `
  <section class="hero">
    <div class="deco" aria-hidden="true">🔭 🔍 🧭 ✨</div>
    <h1>今天对世界好奇了什么？</h1>
    <p class="muted" style="margin:0">火花：日常冒出来的问题，彼此不需要有关联。想为一件事连续发问，就去「课题」。</p>
  </section>
  ${captureBox()}
  <div class="filters">
    <button class="chip ${UI.cat === "all" ? "on" : ""}" data-cat="all">全部 <span class="n">${sparks.length}</span></button>
    ${S.categories.map((c) => `<button class="chip ${UI.cat === c.id ? "on" : ""}" data-cat="${c.id}">${c.emoji} ${esc(c.name)} <span class="n">${count(c.id)}</span></button>`).join("")}
    ${uncat ? `<button class="chip ${UI.cat === "none" ? "on" : ""}" data-cat="none">📥 未分类 <span class="n">${uncat}</span></button>` : ""}
    <a class="chip" href="#/cats" style="text-decoration:none">⚙︎ 管理分类</a>
  </div>
  <div class="filters">
    <button class="chip ${UI.onlyOpen ? "on" : ""}" id="only-open">🌱 只看未解答 <span class="n">${open}</span></button>
    ${open ? `<button class="chip" id="dice">🎲 随机抽一个未解答</button>` : ""}
  </div>
  ${body}
  <div style="height:40px"></div>`;
}

// ---------- 分类 ----------
let editingCat = null;
function emojiPicker(name, current) {
  return `<div class="emoji-pick" data-for="${name}">${EMOJIS.map((e) => `<button type="button" class="${e === current ? "on" : ""}" data-emo="${e}">${e}</button>`).join("")}</div>`;
}
function catForm(c) {
  return `<form class="form-card" id="cat-form" data-id="${c?.id || ""}">
    <div class="bar"><input class="input emo" name="emoji" value="${esc(c?.emoji || "🔍")}" maxlength="4" aria-label="emoji" />
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
    <div class="bar"><input class="input emo" name="emoji" value="${esc(t?.emoji || "🧭")}" maxlength="4" aria-label="emoji" />
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
  const step = (q) => `
    <div class="step ${q.answer ? "done" : ""} ${q.parent_id && qs.some((x) => x.id === q.parent_id) ? "child" : ""}">
      <div class="when">${ymd(q.created_at)} ${hm(q.created_at)}</div>
      ${card(q)}
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
  ${qs.length ? `<div class="journey">${qs.map(step).join("")}</div>` : `<div class="empty"><span class="big">🚩</span>从第一个问题出发吧</div>`}
  <div style="height:40px"></div>`;
}

// ---------- 设置 ----------
function viewSettings() {
  const s = S.settings;
  return `
  <section class="hero"><div class="deco" aria-hidden="true">⚙️ 🧰</div><h1>设置</h1></section>
  <div class="panel">
    <h3>🤖 站内 AI</h3>
    ${hasAI() ? `<p>按顺序尝试，前一个失败会自动换下一个：</p><ul>${S.providers.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`
      : `<p>还没有配置 AI 接口。在 Cloudflare 的环境变量里加上 <code>GROQ_API_KEY</code> 等就能启用（见 README）。没有 AI 也可以正常记录，只是不能自动解答。</p>`}
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
  <div class="panel"><button class="btn danger" id="logout">退出登录</button></div>`;
}

// ---------- 详情（底部弹出） ----------
let sheetEl = null;
function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } document.body.style.overflow = ""; }
function openQ(id) { go(`#/q/${id}`); }
// 关闭详情：有历史就后退（手机返回键也一样），直接打开的链接就回到底下的页面
function leaveSheet() { if (navCount > 0) history.back(); else go(baseHash === location.hash ? "#/" : baseHash); }

function sheetHTML(q) {
  const p = qOf(q.parent_id), kids = childrenOf(q.id);
  const rel = S.links.filter((l) => l.a === q.id || l.b === q.id).map((l) => ({ l, other: qOf(l.a === q.id ? l.b : l.a) })).filter((x) => x.other);
  const ideas = UI.ideas[q.id];
  const busy = UI.busy[q.id] || {};
  const userSrc = q.source === "external_ai" || q.source === "self";
  return `
  <div class="sheet" role="dialog" aria-modal="true" aria-label="问题详情">
    <div class="sheet-head">
      <button class="btn small ghost" id="sh-close">← 返回</button>
      <span class="muted" style="font-size:12.5px">${ymd(q.created_at)} ${hm(q.created_at)}</span>
      <button class="btn small ghost danger" id="sh-del">删除</button>
    </div>

    ${p ? `<button class="mini" data-goto="${p.id}" style="width:100%;margin-bottom:10px">↖ 追问自「${esc(p.text)}」</button>` : ""}
    <textarea class="q-edit" id="sh-text" rows="1" aria-label="问题">${esc(q.text)}</textarea>
    <div class="bar" style="margin-top:4px"><button class="copy-tag" id="sh-copy">📋 复制提问</button>
      ${q.ask_by === "ai" ? `<span class="badge-ai">AI 建议的追问</span>` : ""}</div>

    <div class="two field">
      <div><label class="label" for="sh-cat">分类</label>
        <select class="input" id="sh-cat"><option value="">📥 未分类</option>
        ${S.categories.map((c) => `<option value="${c.id}" ${c.id === q.category_id ? "selected" : ""}>${c.emoji} ${esc(c.name)}</option>`).join("")}</select></div>
      <div><label class="label" for="sh-topic">课题</label>
        <select class="input" id="sh-topic"><option value="">— 不属于课题 —</option>
        ${S.topics.map((t) => `<option value="${t.id}" ${t.id === q.topic_id ? "selected" : ""}>${t.emoji} ${esc(t.name)}</option>`).join("")}</select></div>
    </div>
    ${suggestBar(q)}
    <div class="field"><label for="sh-ctx">当时的场景</label>
      <input class="input" id="sh-ctx" value="${esc(q.context)}" placeholder="在哪、因为什么想到的" /></div>

    <div class="field">
      <div class="bar space"><span class="label" style="margin:0">答案</span>
        <span class="bar">
          ${hasAI() ? `<button class="btn small brass" id="sh-ai" ${busy.answer ? "disabled" : ""}>${busy.answer ? `<span class="spin">✨</span> 思考中…` : "✨ 站内 AI 回答"}</button>` : ""}
          <button class="btn small" id="sh-paste">📥 贴进来</button>
        </span></div>
      <textarea class="textarea" id="sh-ans" placeholder="一个框就够了。可以让站内 AI 写，也可以把别的 AI 的回答贴进来，或者自己写。" style="margin-top:8px">${esc(q.answer)}</textarea>
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
  $(".sheet", sheetEl).scrollTop = scroll;
  bindSheet(id);
}

async function patchQ(id, patch, { silent = true } = {}) {
  try {
    upsertQ(await api(`questions/${id}`, { method: "PATCH", body: patch }));
    if (!silent) toast("已保存");
  } catch (e) { toast(e.message); }
}

function bindSheet(id) {
  const q = () => qOf(id);
  const sh = sheetEl;
  const leave = leaveSheet;
  sh.onclick = (e) => { if (e.target === sh) leave(); };
  $("#sh-close", sh).onclick = leave;
  $("#sh-del", sh).onclick = async (e) => {
    const b = e.currentTarget;
    if (b.dataset.sure !== "1") { b.dataset.sure = "1"; b.textContent = "再点一次确认删除"; return; }
    await api(`questions/${id}`, { method: "DELETE" });
    const removed = q();
    S.questions = S.questions.filter((x) => x.id !== id);
    S.questions.forEach((x) => { if (x.parent_id === id) x.parent_id = removed.parent_id; });
    S.links = S.links.filter((l) => l.a !== id && l.b !== id);
    toast("已删除");
    leaveSheet();
  };
  const qt = $("#sh-text", sh);
  const fit = () => { qt.style.height = "auto"; qt.style.height = qt.scrollHeight + "px"; };
  fit(); qt.oninput = fit;
  $("#sh-copy", sh).onclick = () => copyQuestion(q());
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
  $$("[data-goto]", sh).forEach((b) => (b.onclick = () => go(`#/q/${b.dataset.goto}`)));
  $$("[data-sg]", sh).forEach((b) => (b.onclick = async () => { await acceptSuggest(b.dataset.id, b.dataset.sg); }));
  $$("[data-sgx]", sh).forEach((b) => (b.onclick = async () => { await dismissSuggest(b.dataset.id, b.dataset.sgx); }));

  // 答案：贴进来默认是「外部 AI」，手打默认是「自己写」，都可以再改
  const ans = $("#sh-ans", sh);
  let pasted = false;
  ans.addEventListener("paste", () => { pasted = true; });
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
      const t = (await navigator.clipboard.readText()).trim();
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

  const aiBtn = $("#sh-ai", sh);
  if (aiBtn) aiBtn.onclick = async () => {
    if (q().answer && aiBtn.dataset.sure !== "1") { aiBtn.dataset.sure = "1"; aiBtn.textContent = "会覆盖现在的答案，再点一次"; return; }
    UI.busy[id] = { ...UI.busy[id], answer: true }; refreshSheet(id);
    try { upsertQ(await api("ai/answer", { method: "POST", body: { id } })); }
    catch (e) { toast(e.message.slice(0, 80)); }
    UI.busy[id] = { ...UI.busy[id], answer: false }; refreshSheet(id);
  };

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
function viewReview() {
  const weekAgo = Date.now() - 7 * 864e5;
  const n = S.questions.length;
  return `
  <section class="hero"><div class="deco" aria-hidden="true">🕸 🔭 ✨</div><h1>回顾</h1>
  <p class="muted" style="margin:0">你的好奇心长成了什么样子。点一个点就能打开那个问题。</p></section>
  <div class="stats">
    <div class="stat"><b>${n}</b><span>个问题</span></div>
    <div class="stat"><b>${S.questions.filter((q) => q.created_at > weekAgo).length}</b><span>本周新问题</span></div>
    <div class="stat"><b>${S.questions.filter((q) => !q.answer).length}</b><span>还没答案</span></div>
    <div class="stat"><b>${S.questions.filter((q) => q.parent_id).length}</b><span>次追问</span></div>
  </div>
  ${n ? `<div class="graph-box" id="gbox"><canvas id="gc"></canvas><div class="graph-tip" id="gtip"></div></div>
  <div class="legend"><span><i></i>追问</span><span><i class="faint"></i>同一课题</span><span><i class="dash"></i>AI 发现的关联</span></div>` :
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

function catColor(id) {
  const palette = ["#b4741a", "#1d7a76", "#6a5acd", "#c0504d", "#4f8a3a", "#2f6db5", "#a0527a", "#7a7a2a"];
  const i = S.categories.findIndex((c) => c.id === id);
  return i < 0 ? "#8f99b5" : palette[i % palette.length];
}

function startGraph() {
  const box = $("#gbox");
  if (!box) return;
  const cv = $("#gc"), ctx = cv.getContext("2d"), tip = $("#gtip");
  const css = getComputedStyle(document.documentElement);
  const col = { ink: css.getPropertyValue("--ink").trim(), line: css.getPropertyValue("--line").trim(), brass: css.getPropertyValue("--brass").trim(), teal: css.getPropertyValue("--teal").trim(), paper: css.getPropertyValue("--paper").trim() };
  let W, H, dpr;
  const resize = () => { dpr = devicePixelRatio || 1; W = box.clientWidth; H = box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
  resize();

  const nodes = S.questions.map((q, i) => {
    const a = i * 2.399, r = 30 + Math.sqrt(i) * 22; // 向日葵式初始分布，像一个球
    return { q, x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0, deg: 0 };
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

  let view = { x: 0, y: 0, s: 1 }, drag = null, hover = null, running = true, alpha = 1;
  const rad = (n) => 5 + Math.min(n.deg, 6) * 1.6;

  function step() {
    if (alpha < 0.005) return;
    alpha *= 0.985;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy + 0.01;
        if (d2 > 90000) continue;
        const f = (900 / d2) * alpha;
        dx *= f; dy *= f;
        a.vx += dx; a.vy += dy; b.vx -= dx; b.vy -= dy;
      }
      // 向中心的引力，让整体保持成一团
      a.vx += (W / 2 - a.x) * 0.004 * alpha;
      a.vy += (H / 2 - a.y) * 0.004 * alpha;
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y, d = Math.hypot(dx, dy) || 1;
      const target = e.k === "parent" ? 46 : e.k === "ai" ? 80 : 70;
      const f = ((d - target) / d) * 0.05 * alpha * (e.k === "topic" ? 0.5 : 1);
      e.a.vx += dx * f; e.a.vy += dy * f; e.b.vx -= dx * f; e.b.vy -= dy * f;
    }
    for (const n of nodes) {
      if (n === drag?.node) continue;
      n.vx *= 0.82; n.vy *= 0.82; n.x += n.vx; n.y += n.vy;
    }
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(view.x, view.y); ctx.scale(view.s, view.s);
    for (const e of edges) {
      ctx.beginPath(); ctx.moveTo(e.a.x, e.a.y); ctx.lineTo(e.b.x, e.b.y);
      ctx.setLineDash(e.k === "ai" ? [5, 4] : []);
      ctx.strokeStyle = e.k === "parent" ? col.brass : e.k === "ai" ? col.teal : col.line;
      ctx.lineWidth = e.k === "topic" ? 1 : 1.6;
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, rad(n), 0, Math.PI * 2);
      ctx.fillStyle = n.q.answer ? catColor(n.q.category_id) : col.paper;
      ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = catColor(n.q.category_id); ctx.stroke();
    }
    if (hover) {
      ctx.font = "13px " + getComputedStyle(document.body).fontFamily;
      const label = hover.q.text.length > 22 ? hover.q.text.slice(0, 22) + "…" : hover.q.text;
      ctx.fillStyle = col.ink;
      ctx.fillText(label, hover.x + rad(hover) + 4, hover.y + 4);
    }
  }
  function loop() { if (!running) return; step(); draw(); requestAnimationFrame(loop); }
  loop();

  const toWorld = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.s, y: (e.clientY - r.top - view.y) / view.s }; };
  const pick = (p) => nodes.find((n) => Math.hypot(n.x - p.x, n.y - p.y) < rad(n) + 8);
  cv.onpointerdown = (e) => {
    cv.setPointerCapture(e.pointerId);
    const p = toWorld(e), n = pick(p);
    drag = { node: n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y, moved: false };
    if (n) { hover = n; showTip(n); }
  };
  cv.onpointermove = (e) => {
    if (!drag) { const n = pick(toWorld(e)); if (n !== hover) { hover = n; draw(); } return; }
    if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 5) drag.moved = true;
    if (drag.node) { const p = toWorld(e); drag.node.x = p.x; drag.node.y = p.y; alpha = Math.max(alpha, 0.3); }
    else { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; }
  };
  cv.onpointerup = () => { if (drag?.node && !drag.moved) openQ(drag.node.q.id); drag = null; };
  cv.onwheel = (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015), s = Math.min(3, Math.max(0.3, view.s * k));
    view.x = mx - ((mx - view.x) * s) / view.s; view.y = my - ((my - view.y) * s) / view.s; view.s = s;
  };
  function showTip(n) {
    const c = catOf(n.q.category_id);
    tip.style.display = "block";
    tip.innerHTML = `${c ? c.emoji + " " : ""}${esc(n.q.text)}`;
  }
  const ro = new ResizeObserver(() => { resize(); });
  ro.observe(box);
  graph = { stop() { running = false; ro.disconnect(); graph = null; } };
}

function keepDraft(fn) {
  const f = $("form.capture:not(#sh-follow)");
  const draft = f ? { text: f.text.value, context: f.context.value } : null;
  fn();
  const g = $("form.capture:not(#sh-follow)");
  if (g && draft) { g.text.value = draft.text; g.context.value = draft.context; }
}

// ---------- 事件绑定 ----------
function bindCommon() {
  $$("form.capture:not(#sh-follow)").forEach((f) => {
    f.onsubmit = (e) => { e.preventDefault(); submitCapture(f); };
    f.text.onkeydown = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitCapture(f); };
  });
  $$("[data-open]").forEach((el) => (el.onclick = (e) => { if (!e.target.closest("button")) openQ(el.dataset.open); }));
  $$("[data-sg]").forEach((b) => (b.onclick = () => acceptSuggest(b.dataset.id, b.dataset.sg)));
  $$("[data-sgx]").forEach((b) => (b.onclick = () => dismissSuggest(b.dataset.id, b.dataset.sgx)));
  $$("[data-cat]").forEach((b) => (b.onclick = () => { UI.cat = b.dataset.cat; render(); }));
  const oo = $("#only-open"); if (oo) oo.onclick = () => { UI.onlyOpen = !UI.onlyOpen; render(); };
  const dice = $("#dice"); if (dice) dice.onclick = () => {
    const open = S.questions.filter((q) => !q.answer && !q.topic_id);
    openQ(open[Math.floor(Math.random() * open.length)].id);
  };

  // 记录框里选分类（再点一次取消）、当场新建分类
  $$("[data-pick]").forEach((b) => (b.onclick = () => { UI.pickCat = UI.pickCat === b.dataset.pick ? null : b.dataset.pick; keepDraft(render); }));
  $$("[data-newcat]").forEach((b) => (b.onclick = () => { UI.newCatOpen = !UI.newCatOpen; keepDraft(render); const n = $("#nc-name"); if (n) n.focus(); }));
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
    p.closest("form")[p.dataset.for].value = b.dataset.emo;
    $$("button", p).forEach((x) => x.classList.toggle("on", x === b));
  });

  // 分类
  $$("[data-tile]").forEach((t) => (t.onclick = (e) => { if (e.target.closest("[data-edit-cat]")) return; UI.cat = t.dataset.tile; go("#/"); }));
  $$("[data-edit-cat]").forEach((b) => (b.onclick = () => { editingCat = b.dataset.editCat; render(); scrollTo(0, 0); }));
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
  const lo = $("#logout"); if (lo) lo.onclick = async () => { await api("logout", { method: "POST" }); renderLogin(); };
}

window.addEventListener("keydown", (e) => { if (e.key === "Escape" && sheetEl) leaveSheet(); });

// 第一次加载失败时不要留一个空白页，显示原因和重试按钮
load().catch((e) => {
  if (e.message === "请先登录") return; // 已经显示登录页
  app.innerHTML = `<div class="login"><div style="text-align:center;max-width:360px">
    <div class="big" style="font-size:48px">🔭</div>
    <h1 style="font-family:var(--font-display);margin:8px 0">问世界</h1>
    <p class="err">${esc(e.message)}</p>
    <button class="btn primary" onclick="location.reload()">重试</button></div></div>`;
});
