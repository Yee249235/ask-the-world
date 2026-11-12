// 问世界 · 主接口
import { json, readJson, newId, now } from "../../lib/util.js";
import { chat, extractJson, activeProviders } from "../../lib/ai.js";
import { DEFAULT_SETTINGS, fillTemplate } from "../../lib/prompts.js";

const DEFAULT_CATEGORIES = [
  ["🏠", "生活常识"],
  ["🍳", "做饭"],
  ["📱", "手机数码"],
  ["🎮", "游戏"],
  ["📚", "知识学习"],
  ["🔭", "杂想探索"],
];

const Q_FIELDS = ["short", "text", "context", "category_id", "topic_id", "parent_id", "ask_by", "answer", "source", "source_model", "verified", "suggest"];

// ---------- 数据读取 ----------
async function getSettings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of results) s[r.key] = r.value;
  return s;
}

async function ensureSeed(db) {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM categories").first();
  if (row.n > 0) return;
  const seeded = await db.prepare("SELECT value FROM settings WHERE key='seeded'").first();
  if (seeded) return; // 用户自己删光了分类，就不要再自动补回去
  const t = now();
  await db.batch([
    ...DEFAULT_CATEGORIES.map(([emoji, name], i) =>
      db.prepare("INSERT INTO categories (id,name,emoji,sort,created_at) VALUES (?,?,?,?,?)").bind(newId("c_"), name, emoji, i, t + i)
    ),
    db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES ('seeded','1')"),
  ]);
}

async function getState(db, env) {
  await ensureSeed(db);
  const [c, t, q, l, s] = await Promise.all([
    db.prepare("SELECT * FROM categories ORDER BY sort, created_at").all(),
    db.prepare("SELECT * FROM topics ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM questions ORDER BY created_at DESC").all(),
    db.prepare("SELECT * FROM links").all(),
    getSettings(db),
  ]);
  return {
    categories: c.results,
    topics: t.results,
    questions: q.results.map(parseQ),
    links: l.results,
    settings: s,
    providers: activeProviders(env).map((p) => `${p.label} · ${p.model}`),
  };
}

function parseQ(q) {
  if (!q) return q;
  let suggest = null;
  try { suggest = q.suggest ? JSON.parse(q.suggest) : null; } catch {}
  return { ...q, suggest, verified: !!q.verified };
}

const getQ = async (db, id) => parseQ(await db.prepare("SELECT * FROM questions WHERE id=?").bind(id).first());

async function updateQ(db, id, patch) {
  const sets = [], vals = [];
  for (const k of Q_FIELDS) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (k === "suggest") v = v ? JSON.stringify(v) : null;
    if (k === "verified") v = v ? 1 : 0;
    sets.push(`${k}=?`);
    vals.push(v ?? null);
  }
  if ("text" in patch && !("short" in patch)) sets.push("short=NULL");
  if (!sets.length) return getQ(db, id);
  sets.push("updated_at=?");
  vals.push(now(), id);
  await db.prepare(`UPDATE questions SET ${sets.join(",")} WHERE id=?`).bind(...vals).run();
  return getQ(db, id);
}

// ---------- AI ----------
async function aiAnswer(db, env, q) {
  const s = await getSettings(db);
  let system = s.template_daily;
  if (q.topic_id) {
    const topic = await db.prepare("SELECT * FROM topics WHERE id=?").bind(q.topic_id).first();
    if (topic) system = fillTemplate(s.template_topic, { topic: topic.name, goal: topic.goal });
  }
  let user = q.text;
  if (q.context) user += `\n（当时的场景：${q.context}）`;
  if (q.parent_id) {
    const p = await getQ(db, q.parent_id);
    if (p) user = `（这是从「${p.text}」追问而来的）\n${user}`;
  }
  return chat(env, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
}

async function aiClassify(db, env, q) {
  const [cats, topics] = await Promise.all([
    db.prepare("SELECT id,name,emoji FROM categories ORDER BY sort").all(),
    db.prepare("SELECT id,name,goal FROM topics WHERE status='active'").all(),
  ]);
  const catList = cats.results.map((c) => `${c.id}: ${c.emoji} ${c.name}`).join("\n") || "（暂无）";
  const topicList = topics.results.map((t) => `${t.id}: ${t.name}${t.goal ? "（" + t.goal + "）" : ""}`).join("\n") || "（暂无）";
  const prompt = `把下面这个问题归类。只输出 JSON，不要任何解释。

问题：${q.text}${q.context ? "\n场景：" + q.context : ""}

现有分类（id: 名称）：
${catList}

进行中的课题（id: 名称）：
${topicList}

规则：
1. 如果某个现有分类合适，category_id 填它的 id，new_category 为 null
2. 只有在所有现有分类都明显不合适时，category_id 为 null，new_category 给出一个简短的新分类 {"name":"2-4个字","emoji":"一个emoji"}
3. 只有当问题明显是为了推进某个课题时才填 topic_id，否则为 null（大多数日常问题都应该是 null）

输出格式：{"category_id": "...或null", "new_category": null或{"name":"","emoji":""}, "topic_id": "...或null"}`;
  const r = await chat(env, [{ role: "user", content: prompt }], { temperature: 0.1, maxTokens: 200 });
  const out = extractJson(r.text);
  const validCat = cats.results.some((c) => c.id === out.category_id);
  const validTopic = topics.results.some((t) => t.id === out.topic_id);
  const suggest = {};
  if (validCat && out.category_id !== q.category_id) suggest.category_id = out.category_id;
  else if (!validCat && out.new_category?.name) suggest.new_category = { name: String(out.new_category.name).slice(0, 12), emoji: String(out.new_category.emoji || "❓").slice(0, 4) };
  if (validTopic && !q.topic_id) suggest.topic_id = out.topic_id;
  return suggest;
}

async function aiFollowups(db, env, q) {
  const prompt = `我对世界有一个好奇的问题，以及目前得到的回答。请给出 3 个值得继续追问的问题，帮助我想得更深或更有趣。
每个问题要短（20 字以内），口语化，彼此方向不同。只输出 JSON 字符串数组，每个问题都要用英文双引号包起来，例如 ["为什么会这样？","有没有例外？","生活中怎么用？"]。

问题：${q.text}
回答：${q.answer || "（还没有回答）"}`;
  const r = await chat(env, [{ role: "user", content: prompt }], { temperature: 0.8, maxTokens: 400 });
  return parseList(r.text).slice(0, 3);
}

// 模型不一定乖乖输出 JSON（比如漏了引号），先试 JSON，失败就按行/逗号拆开
function parseList(text) {
  try {
    const arr = extractJson(text);
    if (Array.isArray(arr)) return arr.map((x) => String(x).trim()).filter(Boolean);
  } catch {}
  return String(text)
    .replace(/```\w*/g, "")
    .split(/\n|[,，](?=\s*["“「]?[^,，]{3,})/)
    .map((x) => x.replace(/^[\s\[\]"“”「」'\-*\d.、)）]+|[\s\[\]"“”「」',，]+$/g, "").trim())
    .filter((x) => x.length >= 3 && x.length <= 60);
}

// 给网络图用的短标签：一次处理一批还没有短标签的问题
async function aiShorten(db, env) {
  const { results } = await db.prepare("SELECT id,text FROM questions WHERE short IS NULL OR short='' ORDER BY created_at DESC LIMIT 60").all();
  if (!results.length) return {};
  const list = results.map((q, i) => `${i + 1}. ${q.text}`).join("\n");
  const prompt = `把下面每个问题缩成一个不超过 5 个汉字的短标签，让人一眼认出是哪个问题（抓住核心名词，不要「为什么」「怎么」这类词）。
只输出 JSON 对象，键是序号，值是标签，例如 {"1":"大火炒菜","2":"云计算"}。

${list}`;
  const r = await chat(env, [{ role: "user", content: prompt }], { temperature: 0.2, maxTokens: 900 });
  let obj = {};
  try { obj = extractJson(r.text); } catch {
    for (const m of r.text.matchAll(/["“]?(\d+)["”]?\s*[:：.、]\s*["“]?([^"”,，\n]{1,10})/g)) obj[m[1]] = m[2];
  }
  const out = {};
  const stmts = [];
  results.forEach((q, i) => {
    let s = String(obj[i + 1] ?? obj[String(i + 1)] ?? "").replace(/["“”\s]/g, "").slice(0, 6);
    if (!s) return;
    out[q.id] = s;
    stmts.push(db.prepare("UPDATE questions SET short=? WHERE id=?").bind(s, q.id));
  });
  if (stmts.length) await db.batch(stmts);
  return out;
}

async function aiRelate(db, env) {
  const { results } = await db.prepare("SELECT id,text,created_at FROM questions ORDER BY created_at DESC LIMIT 150").all();
  if (results.length < 3) return [];
  const list = results.map((q) => `${q.id}: ${q.text}`).join("\n");
  const prompt = `下面是我在不同时间提过的问题。请找出彼此有意思的隐藏关联（同一个原理、因果关系、可以互相启发），最多 8 对。
不要配对明显无关的问题，宁缺毋滥。只输出 JSON 数组：[{"a":"id","b":"id","why":"15字以内说明关联"}]

${list}`;
  const r = await chat(env, [{ role: "user", content: prompt }], { temperature: 0.3, maxTokens: 800 });
  const arr = extractJson(r.text);
  const ids = new Set(results.map((q) => q.id));
  const existing = await db.prepare("SELECT a,b FROM links").all();
  const seen = new Set(existing.results.map((l) => [l.a, l.b].sort().join("|")));
  const added = [];
  for (const x of Array.isArray(arr) ? arr : []) {
    if (!ids.has(x.a) || !ids.has(x.b) || x.a === x.b) continue;
    const key = [x.a, x.b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    const link = { id: newId("l_"), a: x.a, b: x.b, why: String(x.why || "").slice(0, 40), created_at: now() };
    await db.prepare("INSERT INTO links (id,a,b,why,created_at) VALUES (?,?,?,?,?)").bind(link.id, link.a, link.b, link.why, link.created_at).run();
    added.push(link);
  }
  return added;
}

// ---------- 导出 Markdown ----------
async function exportMarkdown(db, tzMin = 540) {
  const [c, t, q] = await Promise.all([
    db.prepare("SELECT * FROM categories").all(),
    db.prepare("SELECT * FROM topics").all(),
    db.prepare("SELECT * FROM questions ORDER BY created_at").all(),
  ]);
  const cat = Object.fromEntries(c.results.map((x) => [x.id, x]));
  const top = Object.fromEntries(t.results.map((x) => [x.id, x]));
  const qs = Object.fromEntries(q.results.map((x) => [x.id, x]));
  const srcName = { site_ai: "站内 AI", external_ai: "外部 AI", self: "自己写的" };
  const fmt = (ms) => new Date(ms + tzMin * 60e3).toISOString().slice(0, 10);
  let md = `# 问世界\n\n导出时间：${new Date().toISOString()}\n共 ${q.results.length} 个问题\n\n`;
  let day = "";
  for (const x of q.results) {
    const d = fmt(x.created_at);
    if (d !== day) { md += `\n## ${d}\n\n`; day = d; }
    const tags = [];
    if (cat[x.category_id]) tags.push(`${cat[x.category_id].emoji} ${cat[x.category_id].name}`);
    if (top[x.topic_id]) tags.push(`课题：${top[x.topic_id].name}`);
    md += `### ${x.text}\n\n`;
    if (tags.length) md += `> ${tags.join(" · ")}\n\n`;
    if (x.parent_id && qs[x.parent_id]) md += `由「${qs[x.parent_id].text}」追问而来${x.ask_by === "ai" ? "（AI 建议）" : ""}\n\n`;
    if (x.context) md += `场景：${x.context}\n\n`;
    if (x.answer) {
      md += `${x.answer}\n\n`;
      if (x.source) md += `*来源：${srcName[x.source] || x.source}${x.source_model ? "（" + x.source_model + "）" : ""}${x.verified ? " · ✅ 已验证" : ""}*\n\n`;
    } else md += `🌱 还没有答案\n\n`;
  }
  return md;
}

// ---------- 路由 ----------
export async function onRequest({ request, env, params }) {
  const db = env.DB;
  if (!db) return json({ error: "没有绑定 D1 数据库（变量名应为 DB）" }, 500);
  const path = (params.path || []).join("/");
  const m = request.method;
  const body = m === "GET" || m === "DELETE" ? {} : await readJson(request);
  const seg = path.split("/");

  // 全部数据
  if (path === "state" && m === "GET") return json(await getState(db, env));

  // 问题
  if (seg[0] === "questions") {
    const id = seg[1];
    if (!id && m === "POST") {
      const t = now();
      const q = {
        id: newId("q_"),
        text: String(body.text || "").trim(),
        context: body.context || "",
        category_id: body.category_id || null,
        topic_id: body.topic_id || null,
        parent_id: body.parent_id || null,
        ask_by: body.ask_by === "ai" ? "ai" : "self",
      };
      if (!q.text) return json({ error: "问题不能为空" }, 400);
      // 追问默认继承上一个问题的分类和课题
      if (q.parent_id && (!q.category_id || !q.topic_id)) {
        const p = await getQ(db, q.parent_id);
        if (p) { q.category_id ||= p.category_id; q.topic_id ||= p.topic_id; }
      }
      await db.prepare(
        "INSERT INTO questions (id,text,context,category_id,topic_id,parent_id,ask_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)"
      ).bind(q.id, q.text, q.context, q.category_id, q.topic_id, q.parent_id, q.ask_by, t, t).run();
      return json(await getQ(db, q.id));
    }
    // 批量删除：{ ids: [...], withFollowups: true/false }
    if (id === "delete" && m === "POST") {
      const ids = new Set((body.ids || []).map(String));
      if (!ids.size) return json({ error: "没有选中问题" }, 400);
      const { results: all } = await db.prepare("SELECT id, parent_id FROM questions").all();
      const parentOf = Object.fromEntries(all.map((r) => [r.id, r.parent_id]));
      if (body.withFollowups) {
        // 把所有后代追问也加进去
        let grew = true;
        while (grew) {
          grew = false;
          for (const r of all) if (!ids.has(r.id) && r.parent_id && ids.has(r.parent_id)) { ids.add(r.id); grew = true; }
        }
      }
      // 留下来的追问，挂到最近一个没被删的上级，族谱不断
      const keepParent = (pid) => { while (pid && ids.has(pid)) pid = parentOf[pid]; return pid || null; };
      const stmts = [];
      for (const r of all) {
        if (!ids.has(r.id) && r.parent_id && ids.has(r.parent_id)) stmts.push(db.prepare("UPDATE questions SET parent_id=? WHERE id=?").bind(keepParent(r.parent_id), r.id));
      }
      for (const qid of ids) {
        stmts.push(db.prepare("DELETE FROM links WHERE a=? OR b=?").bind(qid, qid));
        stmts.push(db.prepare("DELETE FROM questions WHERE id=?").bind(qid));
      }
      for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));
      return json({ ok: true, deleted: [...ids] });
    }
    if (id && m === "PATCH") return json(await updateQ(db, id, body));
    if (id && m === "DELETE") {
      // 删除时把它的追问挂到它的上一级，族谱不会断掉
      const q = await getQ(db, id);
      await db.batch([
        db.prepare("UPDATE questions SET parent_id=? WHERE parent_id=?").bind(q?.parent_id || null, id),
        db.prepare("DELETE FROM links WHERE a=? OR b=?").bind(id, id),
        db.prepare("DELETE FROM questions WHERE id=?").bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // 分类 / 课题（结构相同，一起处理）
  if (seg[0] === "categories" || seg[0] === "topics") {
    const table = seg[0];
    const fields = table === "categories" ? ["name", "emoji", "sort"] : ["name", "emoji", "goal", "status"];
    const id = seg[1];
    if (!id && m === "POST") {
      const row = { id: newId(table === "categories" ? "c_" : "t_"), created_at: now() };
      for (const f of fields) if (f in body) row[f] = body[f];
      if (!row.name) return json({ error: "名称不能为空" }, 400);
      if (table === "categories" && row.sort == null) {
        const r = await db.prepare("SELECT COALESCE(MAX(sort),0)+1 AS s FROM categories").first();
        row.sort = r.s;
      }
      const keys = Object.keys(row);
      await db.prepare(`INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`).bind(...keys.map((k) => row[k])).run();
      return json(await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(row.id).first());
    }
    if (id && m === "PATCH") {
      const sets = [], vals = [];
      for (const f of fields) if (f in body) { sets.push(`${f}=?`); vals.push(body[f]); }
      if (sets.length) await db.prepare(`UPDATE ${table} SET ${sets.join(",")} WHERE id=?`).bind(...vals, id).run();
      return json(await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first());
    }
    if (id && m === "DELETE") {
      const col = table === "categories" ? "category_id" : "topic_id";
      await db.batch([
        db.prepare(`UPDATE questions SET ${col}=NULL WHERE ${col}=?`).bind(id),
        db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // 关联
  if (seg[0] === "links" && seg[1] && m === "DELETE") {
    await db.prepare("DELETE FROM links WHERE id=?").bind(seg[1]).run();
    return json({ ok: true });
  }

  // 设置
  if (path === "settings" && m === "PUT") {
    const stmts = [];
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k in body) stmts.push(db.prepare("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)").bind(k, String(body[k])));
    }
    if (stmts.length) await db.batch(stmts);
    return json(await getSettings(db));
  }
  if (path === "settings/reset" && m === "POST") {
    await db.prepare("DELETE FROM settings WHERE key IN ('template_daily','template_topic')").run();
    return json(await getSettings(db));
  }

  // AI
  if (seg[0] === "ai" && m === "POST") {
    try {
      if (seg[1] === "answer") {
        const q = await getQ(db, body.id);
        if (!q) return json({ error: "找不到这个问题" }, 404);
        const r = await aiAnswer(db, env, q);
        const updated = await updateQ(db, q.id, {
          answer: r.text, source: "site_ai", source_model: `${r.provider} · ${r.model}`, verified: false,
        });
        return json(updated);
      }
      if (seg[1] === "classify") {
        const q = await getQ(db, body.id);
        if (!q) return json({ error: "找不到这个问题" }, 404);
        const suggest = await aiClassify(db, env, q);
        const updated = await updateQ(db, q.id, { suggest: Object.keys(suggest).length ? suggest : null });
        return json(updated);
      }
      if (seg[1] === "followups") {
        const q = await getQ(db, body.id);
        if (!q) return json({ error: "找不到这个问题" }, 404);
        return json({ items: await aiFollowups(db, env, q) });
      }
      if (seg[1] === "relate") return json({ added: await aiRelate(db, env) });
      if (seg[1] === "shorten") return json({ items: await aiShorten(db, env) });
    } catch (e) {
      return json({ error: e.message || String(e) }, 502);
    }
  }

  if (path === "export.md" && m === "GET") {
    const tz = parseInt(new URL(request.url).searchParams.get("tz") || "540", 10) || 0;
    return new Response(await exportMarkdown(db, tz), {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "content-disposition": `attachment; filename="ask-the-world-${new Date().toISOString().slice(0, 10)}.md"`,
      },
    });
  }

  return json({ error: "not found" }, 404);
}
