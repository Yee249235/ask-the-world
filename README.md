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

## 部署到 Cloudflare（免费，大约 15 分钟）

全程在网页上操作，不需要装任何东西。

### 1. 创建数据库

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)（没有账号就注册一个，免费）
2. 左侧菜单 **Storage & Databases → D1 SQL Database → Create**，名字填 `ask-the-world`
3. 创建好后，复制页面上的 **Database ID**
4. 打开这个数据库的 **Console** 标签，把 [`migrations/0001_init.sql`](migrations/0001_init.sql) 的全部内容粘贴进去，点 **Execute**，建好数据表

### 2. 把数据库 ID 填进代码

在 GitHub 上打开 [`wrangler.toml`](wrangler.toml)，点铅笔图标编辑，把
`database_id = "00000000-0000-0000-0000-000000000000"` 换成你刚才复制的 ID，提交。

### 3. 创建网站

1. 左侧菜单 **Workers & Pages → Create → Pages → Import an existing Git repository**
2. 连接 GitHub，选择 `ask-the-world` 仓库
3. 构建设置：**Build command 留空**，**Build output directory 填 `public`**
4. 点 **Save and Deploy**

### 4. 设置密码和 AI 密钥

进入这个 Pages 项目 → **Settings → Variables and Secrets**，添加以下变量（类型选 **Secret**）：

| 变量名 | 说明 |
|---|---|
| `ACCESS_PASSWORD` | **必填**。进入网站的密码，只有你知道 |
| `GROQ_API_KEY` | 推荐。在 [console.groq.com](https://console.groq.com/keys) 免费申请，不需要信用卡 |
| `OPENROUTER_API_KEY` | 可选，备用。在 [openrouter.ai/keys](https://openrouter.ai/keys) 申请，默认使用免费模型 |
| `DEEPSEEK_API_KEY` | 可选。DeepSeek 官方 API 需要先充值，但很便宜 |

加完后到 **Deployments** 里点最新一次部署右边的 **⋯ → Retry deployment**，让设置生效。然后打开网站地址（`xxx.pages.dev`），输入密码就能用了。

> 一个 AI 密钥都不填也能用：记录、分类、课题、追问都正常，只是没有站内 AI，可以用「复制提问」去别的 AI 问，再把回答贴回来。

### 进阶：调整 AI 接口

| 变量名 | 作用 |
|---|---|
| `AI_ORDER` | 尝试顺序，默认 `groq,openrouter,deepseek,custom` |
| `GROQ_MODEL` | 默认 `llama-3.3-70b-versatile` |
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
