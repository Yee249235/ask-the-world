# 🔭 问世界 · Ask the World

一个记录自己每天对世界发问的个人网站。

- **记下问题**：随手一句话，可以顺便写下当时的场景
- **分类**（弱相关）：按领域放问题，比如 🏠 生活常识、🍳 做饭、📱 手机数码…… AI 会建议，由你决定
- **课题**（强相关）：为了解决一件事而提出的一串问题，按时间排成一条探索路线
- **追问**：每个问题都可以继续追问，连成「好奇心的族谱」。以自己追问为主，AI 只在你没思路时给点提示
- **答案就是一个框**：可以让站内 AI 回答，也可以把别的 AI 的回答贴进来，或者自己写；外部来源可以标记「✅ 我验证过」
- **回顾**：网络图展示追问、课题和 AI 发现的跨时间关联
- **导出 Markdown**：数据随时带走，可以直接放进 Obsidian

站内 AI 可以同时接多个免费或便宜的开源模型接口，按顺序尝试，一个失败就自动换下一个。

---

## 部署到 Cloudflare（免费，全在网页上操作）

仓库里已经有自动部署脚本（`.github/workflows/deploy.yml`），会自动建数据库、建表、创建网站、写入密码。你只需要准备几个密钥，填进 GitHub。

### 1. 拿到 Cloudflare 的两个值

- **Account ID**：登录 [Cloudflare 控制台](https://dash.cloudflare.com/) 后，浏览器地址栏 `dash.cloudflare.com/` 后面那一串 32 位字母数字就是
- **API Token**：右上角头像 → **My Profile → API Tokens → Create Token → Create Custom Token**
  - 权限加两行：`Account · Cloudflare Pages · Edit` 和 `Account · D1 · Edit`
  - 点 Continue → Create Token，复制生成的 token（只显示一次）

### 2. 拿到 AI 密钥（推荐）

在 [console.groq.com/keys](https://console.groq.com/keys) 免费申请一个 Groq API Key，不需要信用卡。

### 3. 填进 GitHub

打开仓库 **Settings → Secrets and variables → Actions → New repository secret**，逐个添加：

| 名字 | 内容 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 第 1 步的 Account ID |
| `CLOUDFLARE_API_TOKEN` | 第 1 步的 API Token |
| `ACCESS_PASSWORD` | 进入网站的密码，自己定 |
| `GROQ_API_KEY` | 第 2 步的 Groq Key（可选） |
| `OPENROUTER_API_KEY` / `DEEPSEEK_API_KEY` | 可选，备用 AI |

### 4. 运行部署

仓库 **Actions → Deploy → Run workflow**。大约两分钟后完成，网站地址是 `https://ask-the-world.pages.dev`（名字被占用时以 Actions 日志里显示的为准）。

以后每次代码更新推送到 main，都会自动重新部署；改了密钥也只要再运行一次。

> 一个 AI 密钥都不填也能用：记录、分类、课题、追问都正常，只是没有站内 AI，可以用「复制提问」去别的 AI 问，再把回答贴回来。

### 进阶：调整 AI 接口

在 Cloudflare 的 Pages 项目 → Settings → Variables and Secrets 里添加：

| 变量名 | 作用 |
|---|---|
| `AI_ORDER` | 尝试顺序，默认 `groq,openrouter,deepseek,custom` |
| `GROQ_MODEL` | 默认 `qwen/qwen3.8-27b,openai/gpt-oss-120b`（逗号分隔，按顺序尝试） |
| `OPENROUTER_MODEL` | 默认 `openrouter/free`（自动挑一个当前可用的免费模型） |
| `DEEPSEEK_MODEL` | 默认 `deepseek-chat`，以 DeepSeek 文档里的最新模型名为准 |
| `CUSTOM_API_KEY` + `CUSTOM_BASE_URL` + `CUSTOM_MODEL` | 接任意兼容 OpenAI 格式的服务（硅基流动、本地 Ollama 的公网地址等） |

各家的免费额度和模型列表经常变化，用之前最好去官网确认一下。

---

## 回答模板（这个网站的 skill）

站内 AI 怎么回答，由网站「⚙️ 设置」里的两个模板决定：

- **日常问题**：简明清晰、直击核心，隐含「是什么 / 为什么 / 怎么做」的思路，150 字以内
- **课题里的问题**：多一行「下一步：」，给出一个可执行的小行动

直接在网站里修改就行，不用改代码。默认值在 [`lib/prompts.js`](lib/prompts.js)。

---

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars   # 填上 ACCESS_PASSWORD 和 AI 密钥
npm run db:local                 # 建本地数据库
npm run dev                      # 打开 http://localhost:8788
```

## 项目结构

```
public/            网页（原生 HTML / CSS / JS，不需要构建）
functions/api/     接口（Cloudflare Pages Functions）
lib/ai.js          多个 AI 接口的轮流调用
lib/prompts.js     默认回答模板
migrations/        数据库结构
```
