// 联网搜索：用 Tavily（免费每月 1000 次，不用信用卡），把搜到的网页摘要交给模型来回答
// 在 Cloudflare 环境变量里设置 TAVILY_API_KEY 就会启用

export const hasSearch = (env) => !!env.TAVILY_API_KEY;

export async function webSearch(env, query) {
  const res = await fetch(`${env.TAVILY_BASE_URL || "https://api.tavily.com"}/search`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.TAVILY_API_KEY}` },
    body: JSON.stringify({
      query,
      search_depth: "basic", // 每次 1 个额度
      max_results: 6,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`联网搜索失败（Tavily HTTP ${res.status}）：${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: String(r.title || "").slice(0, 120),
    url: r.url,
    date: r.published_date || "",
    content: String(r.content || "").replace(/\s+/g, " ").slice(0, 900),
  }));
}

// 今天的日期，按访问者所在时区（Cloudflare 会告诉我们），默认日本时间
export function today(request) {
  const tz = request?.cf?.timezone || "Asia/Tokyo";
  try {
    return new Intl.DateTimeFormat("zh-CN", { timeZone: tz, year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
