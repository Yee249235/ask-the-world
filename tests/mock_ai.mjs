// 测试用的假 AI 和假搜索服务：故意返回带 Markdown 的回答，检验网站会不会把符号清理干净
import http from "node:http";
import fs from "node:fs";
const LOG = process.env.MOCK_LOG || "/tmp/mock-msgs.log";
http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const send = (o) => { res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
    if (req.url.endsWith("/search")) {
      fs.appendFileSync(LOG, "SEARCH " + b + "\n");
      return send({ results: [{ title: "测试新闻", url: "https://example.com/news", content: "某公司 CEO 今天仍在任。" }] });
    }
    const msg = JSON.parse(b).messages.at(-1).content;
    fs.appendFileSync(LOG, "=== " + msg.slice(0, 1500).replace(/\n/g, "⏎") + "\n");
    let content;
    if (msg.includes("需不需要上网")) content = /CEO|今天|最新|新闻/.test(msg) ? "某公司 CEO 现在是谁" : "不需要";
    else if (msg.includes("值得继续追问")) content = '["为什么会这样？","有没有例外？","生活中怎么用？"]';
    else if (msg.includes("短标签")) { const n = [...msg.matchAll(/^(\d+)\. (.*)$/gm)]; content = JSON.stringify(Object.fromEntries(n.map((m) => [m[1], m[2].slice(0, 4)]))); }
    else if (msg.includes("隐藏关联")) content = "[]";
    else content = "核心答案是：**这是加粗的重点**。\n\n## 是什么\n- 第一点 `代码`\n- 第二点\n\n**下一步**：试一试。";
    send({ model: "mock-1", choices: [{ message: { content } }] });
  });
}).listen(Number(process.env.MOCK_PORT || 9999));
