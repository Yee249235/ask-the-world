// 多个 AI 接口，按顺序尝试，一个失败就换下一个。
// 都使用 OpenAI 兼容格式（/chat/completions），所以加新的服务商只需要多写一行。
//
// 在 Cloudflare 环境变量里设置对应的 KEY 就会自动启用：
//   GROQ_API_KEY         免费层，无需信用卡
//   OPENROUTER_API_KEY   有一批 :free 免费模型
//   DEEPSEEK_API_KEY     官方 API 需要预充值，但很便宜
//   CUSTOM_API_KEY + CUSTOM_BASE_URL + CUSTOM_MODEL  任意兼容 OpenAI 的服务
// 可选：AI_ORDER=groq,openrouter,deepseek,custom 指定尝试顺序
// 可选：GROQ_MODEL / OPENROUTER_MODEL / DEEPSEEK_MODEL 覆盖默认模型（可以用逗号写多个，按顺序尝试）

const PROVIDERS = {
  groq: {
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    model: "qwen/qwen3.8-27b,openai/gpt-oss-120b", // 中文好的放前面，逗号分隔可以写多个备用
  },
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    model: "nvidia/nemotron-3-ultra-550b-a55b:free,openrouter/free", // 大模型优先，不行就自动挑一个可用的免费模型
  },
  deepseek: {
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    model: "deepseek-chat",
  },
  custom: {
    label: "Custom",
    baseUrlEnv: "CUSTOM_BASE_URL",
    keyEnv: "CUSTOM_API_KEY",
    modelEnv: "CUSTOM_MODEL",
    model: "",
  },
};

// purpose = "answer"：正式回答问题，用最强的模型（OpenRouter 上的大模型优先）
// 其他小活（判断要不要联网、缩短标签、追问提示）用 Groq，快，也不占 OpenRouter 每天的免费次数
export function activeProviders(env, purpose = "") {
  const order = (purpose === "answer" ? env.AI_ANSWER_ORDER || "openrouter,groq,deepseek,custom" : env.AI_ORDER || "groq,openrouter,deepseek,custom")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = [];
  for (const name of order) {
    const p = PROVIDERS[name];
    if (!p || !env[p.keyEnv]) continue;
    const baseUrl = p.baseUrlEnv ? env[p.baseUrlEnv] : p.baseUrl;
    const models = String(env[p.modelEnv] || p.model).split(",").map((m) => m.trim()).filter(Boolean);
    if (!baseUrl || !models.length) continue;
    for (const model of models) {
      list.push({ name, label: p.label, baseUrl: baseUrl.replace(/\/$/, ""), key: env[p.keyEnv], model });
    }
  }
  return list;
}

function cleanText(t) {
  return String(t || "")
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, "") // 去掉部分推理模型的思考过程
    .trim();
}

// 小模型偶尔会「卡住复读」（比如一直重复「つまり（总之）」），这种回答直接作废，换下一个模型
export function isDegenerate(text) {
  const t = String(text).replace(/\s+/g, "");
  if (t.length < 40) return false;
  // 同一段（6~20 个字）反复出现 4 次以上
  for (let n = 6; n <= 20; n++) {
    const seen = new Map();
    for (let i = 0; i + n <= t.length; i += 1) {
      const g = t.slice(i, i + n);
      const c = (seen.get(g) || 0) + 1;
      if (c >= 4) return true;
      seen.set(g, c);
    }
  }
  return false;
}

// 正式回答时，按「模型有多强」排队，跨服务商：最强的免费模型先上，次数用完再一级级往下降
const ANSWER_RANK = ["nemotron-3-ultra", "gpt-oss-120b", "qwen3.8-27b", "openrouter/free"];
const rankOf = (m) => { const i = ANSWER_RANK.findIndex((k) => m.includes(k)); return i < 0 ? 99 : i; };

export async function chat(env, messages, { temperature = 0.4, maxTokens = 700, avoid = "", purpose = "" } = {}) {
  let providers = activeProviders(env, purpose);
  if (purpose === "answer" && !env.AI_ANSWER_ORDER) providers = [...providers].sort((a, b) => rankOf(a.model) - rankOf(b.model));
  // 重新回答时，先换一个和上次不同的模型
  if (avoid) providers = [...providers.filter((p) => !avoid.includes(p.model.replace(/:free$/, ""))), ...providers.filter((p) => avoid.includes(p.model.replace(/:free$/, "")))];
  if (!providers.length) {
    throw new Error("还没有配置任何 AI 接口的 API Key（比如 GROQ_API_KEY）");
  }
  const errors = [];
  for (const p of providers) {
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${p.key}`,
          "HTTP-Referer": "https://ask-the-world.pages.dev",
          "X-Title": "Ask the World",
        },
        body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) {
        errors.push(`${p.label}: HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
        continue;
      }
      const data = await res.json();
      const text = cleanText(data?.choices?.[0]?.message?.content);
      const label = p.name === "openrouter" ? (p.model.split("/")[1] || p.model).replace(/:free$/, "") : p.model;
      if (!text) {
        errors.push(`${p.label}: 空回复`);
        continue;
      }
      if (maxTokens > 300 && isDegenerate(text)) {
        errors.push(`${p.label} ${p.model}: 回答在复读，已换模型`);
        continue;
      }
      return { text, provider: p.label, model: (data.model || label).replace(/:free$/, ""), skipped: errors };
    } catch (e) {
      errors.push(`${p.label}: ${e.message || e}`);
    }
  }
  throw new Error("所有 AI 接口都失败了 → " + errors.join(" | "));
}

// 从模型回复里取出 JSON（模型偶尔会包一层 ```json）
export function extractJson(text) {
  const t = String(text).replace(/```(?:json)?/gi, "");
  const starts = [t.indexOf("{"), t.indexOf("[")].filter((i) => i >= 0);
  if (!starts.length) throw new Error("AI 没有返回 JSON");
  const start = Math.min(...starts);
  const open = t[start];
  const close = open === "{" ? "}" : "]";
  const end = t.lastIndexOf(close);
  return JSON.parse(t.slice(start, end + 1));
}
