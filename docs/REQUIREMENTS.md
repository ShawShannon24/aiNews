# AI News — 话题追踪引擎 需求文档

> 版本：v1.0
> 更新：2026-07-09
> 状态：待开发

---

## 目录

1. [产品愿景](#1-产品愿景)
2. [核心概念](#2-核心概念)
3. [用户交互流程](#3-用户交互流程)
4. [架构总览](#4-架构总览)
5. [模块设计](#5-模块设计)
6. [数据模型](#6-数据模型)
7. [LLM 接口契约](#7-llm-接口契约)
8. [错误处理策略](#8-错误处理策略)
9. [分步实施计划](#9-分步实施计划)
10. [二期对比验证](#10-二期对比验证)

---

## 1. 产品愿景

### 一句话

> 用户在飞书说一句话 → 系统理解意图 → 自动追踪 → 按需推送。

### 解决的问题

| 之前（AI 日报） | 之后（话题追踪引擎） |
|---|---|
| 看什么内容由我（产品）决定 | 看什么内容由你（用户）决定 |
| 固定 7 个 AI 源 | 按需匹配信源（科技/财经/体育/兜底） |
| 推送固定格式日报 | 订阅→每日简报 / 热点→时间线+观点 |
| 不支持用户交互 | 飞书 Bot 对话式交互 |
| 不能新建/取消任务 | 订阅 CRUD，灵活管理 |

### 产品原则

1. **AI 做判断，代码做执行** — LLM 只负责意图识别、观点归纳等需要"理解"的事；抓取、过滤、调度、推送等确定性操作全由代码完成
2. **零额外运行成本** — 除 DeepSeek API 调用（每次 ~0.001 元）外，无其他付费服务依赖
3. **渐进增强** — 每个 Step 独立上线、独立验证、独立回滚
4. **一人起步** — 不超前设计多用户、多租户等架构

---

## 2. 核心概念

### 2.1 追踪模式

| 模式 | 触发 | 频率 | 输出 | 生命周期 |
|------|------|------|------|---------|
| **订阅 (subscribe)** | 用户说"盯一下 X" | 每天 01:00 定时 | 每日简报 | 直到用户取消 |
| **热点 (hotspot)** | 用户说"看看 X 有什么新进展" | 立即执行一次 | 时间线 + 观点归纳 | 一次 |
| **查询 (query)** （后续） | 用户问即时问题 | 一次 | 简要回答 | 一次 |

### 2.2 信源分类

| 分类 | 覆盖方向 | 信源（示例） | 来源 |
|------|---------|-------------|------|
| 科技 | AI、互联网、数码 | 量子位、36氪、TechCrunch、ArXiv、HN、雷锋网、AIHOT | 现有 |
| 财经 | 公司、市场、投融资 | 36氪（财经模块） | 待扩展 |
| 体育 | 赛事、转会、体育产业 | 待定 | 待扩展 |
| 兜底 | 用户分类不明确时 | 全部可用源 | 现有 |

> 初期只实现"科技"和"兜底"。财经、体育等信源后续按需加入。

### 2.3 智能体（Orchestrator）

不叫"Skill"以避免与未来 OpenClaw Skill 概念混淆。代码中命名空间为 `orchestrator/`。

Orchestrator 是核心编排层，接收用户消息：

```
用户消息 → Orchestrator
   ├─ 调 LLM 解析意图 → { category, mode, topic, needSummary }
   ├─ 根据 category 匹配信源
   ├─ 执行（抓取 → 过滤 → 处理）
   ├─ 如果 needSummary → 调 LLM 生成内容
   └─ 推送到飞书
```

---

## 3. 用户交互流程

### 3.1 新订阅

```
用户: 订阅 人形机器人
 Bot: ✅ 已开始追踪「人形机器人」
      📌 模式：长期订阅
      📡 信源：量子位、TechCrunch、AIHOT
      ⏰ 每天 01:00 推送，含摘要
```

### 3.2 热点追踪

```
用户: 帮我看看 OpenAI 这两天有什么新消息
 Bot: 🔍 正在搜索...（预计 30 秒）
      ──────────────────────────────
      📅 时间线
      7/8  OpenAI 发布 Claude Code 新功能 [TechCrunch]
      7/7  OpenAI 宣布与某公司合作... [量子位]
      7/7  分析师称 OpenAI 估值达到... [36氪]

      💡 各方观点
      - 市场普遍看好新产品线（TechCrunch、量子位）
      - 但也有分析师质疑定价过高（36氪）

      共检索 3 篇相关文章
```

### 3.3 查看订阅

```
用户: 查看
 Bot: 📋 当前订阅（2 条）
      1. AI 日报（默认 · 每天 08:00）
      2. 人形机器人（每天 01:00 · 上次推送 07-08）
```

### 3.4 取消订阅

```
用户: 取消 人形机器人
 Bot: ✅ 已取消追踪「人形机器人」
```

### 3.5 定时推送（订阅模式）

每天 01:00 自动推送：

```
📌 每日追踪 · 人形机器人 · 2026-07-09
──────────────────────────────
📅 今日进展
  1. 某公司发布新一代人形机器人 [量子位]
     ...
  2. Humanoid robot market projected... [TechCrunch]

💡 趋势小结
  人形机器人领域本周聚焦于...（摘自 2 篇报道）
──────────────────────────────
AI News · 话题追踪
```

### 3.6 LLM 无法理解意图时

```
用户: 帮我看看那个
 Bot: 🤔 没完全理解，能说的具体一点吗？
      你可以这样问我：
      - "订阅 人形机器人"（长期追踪某个话题）
      - "帮我看看 OpenAI 最近的消息"（立即查一次）
      - "查看"（看当前订阅了哪些）
```

### 3.7 DeepSeek API 不可用时

```
用户: 订阅 人形机器人
 Bot: ⚠️ 服务暂时不可用（DeepSeek API 连接失败），请稍后再试
```

---

## 4. 架构总览

### 4.1 部署架构

```
                   公网                         腾讯云服务器
┌────────┐    HTTPS     ┌──────────┐  :3000  ┌───────────────────────┐
│ 飞书 Bot │ ──────────→ │  Nginx   │ ──────→ │ Express (常驻进程)     │
│ (企业应用)│            │  + SSL   │         │                       │
│         │             │  Let's   │         │ ├─ GET  /webhook       │
│ 用户消息 │             │  Encrypt │         │ ├─ POST /webhook/event│
│         │             │          │         │ ├─ node-cron 调度     │
└────────┘             └──────────┘         │ └─ orchestrator/ 引擎  │
                                            │     ├─ intentParser    │
                                            │     ├─ sourceMatcher   │
                                            │     ├─ timelineBuilder │
                                            │     └─ db (SQLite)     │
                                            │                       │
                                            │ ┌─ 复用层 ───────────┐ │
                                            │ │ fetcher.ts         │ │
                                            │ │ parser.ts          │ │
                                            │ │ filter.ts          │ │
                                            │ │ reporter.ts        │ │
                                            │ │ feishu.ts (推送)   │ │
                                            │ └────────────────────┘ │
                                            └───────────────────────┘
```

### 4.2 目录结构（新增部分）

```
src/
  bot/                    # 常驻 Web 服务
    index.ts              # Express 入口
    router.ts             # 飞书事件路由
    message.ts            # 飞书消息 API
    auth.ts               # 飞书身份验证+签名
  orchestrator/           # 编排引擎
    engine.ts             # 核心编排
    intentParser.ts       # LLM 意图解析
    sourceMatcher.ts      # 分类→信源匹配
    timelineBuilder.ts    # 时间线+观点生成
    topicFilter.ts        # 主题二次过滤
    db.ts                 # SQLite CRUD
```

---

## 5. 模块设计

### 5.1 bot/index.ts — Express 服务器

```
职责：
- 启动 HTTP 服务器监听 :3000
- 注册路由：GET /webhook (飞书 challenge) / POST /webhook/event (事件回调)
- 初始化 SQLite 数据库
- 初始化 node-cron 定时任务（启动时遍历订阅列表注册）
- 优雅退出（SIGTERM → 关闭 server + cron）

边界：
- 不包含业务逻辑，只做路由分发
- 生产环境由 Nginx 反向代理，不直接暴露
```

### 5.2 bot/router.ts — 事件路由

```
输入：飞书 POST 回调的 event body
输出：根据事件类型分发到不同处理器

事件类型：
  1. url_verification（challenge）→ 返回 challenge 字段
  2. im.message.receive_v1（用户消息）
     → 解析发送者、消息内容
     → 调用 orchestrator/engine.ts
     → 回复消息
  3. 其他事件 → 忽略

签名验证：
  - 验证 X-Lark-Signature 与飞书 Secret
  - 验证失败返回 403
```

### 5.3 bot/message.ts — 飞书消息 API

```
职责：
- 被动回复：调用飞书回复消息 API
- 主动推送：定时任务使用 tenant_access_token 推送

内部接口：
  replyMessage(receiveId: string, content: string): Promise<void>
  pushMessage(openId: string, content: string): Promise<void>

依赖：
  - auth.ts 获取 tenant_access_token
  - 飞书 API: /open-apis/im/v1/messages
```

### 5.4 bot/auth.ts — 飞书身份验证

```
职责：
- 获取并缓存 tenant_access_token（有效期 2h，提前 10min 刷新）
- 验证事件回调签名

内部接口：
  getTenantToken(): Promise<string>
  verifySignature(body: string, signature: string): boolean
```

### 5.5 orchestrator/intentParser.ts — 意图解析

```
职责：
接收用户自然语言 → 调 DeepSeek API → 输出结构化意图

输入：用户消息文本（如 "订阅 人形机器人"）
输出：Intent 对象

参数（via .env）：
  DEEPSEEK_API_KEY=<key>
  DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

容错：
  - 网络超时 → 10s 超时，重试 1 次
  - JSON 解析失败 → 重试调用，加 "请严格遵守 JSON 格式" 提示
  - 连续失败 → 抛出 OrchestratorError
```

### 5.6 orchestrator/sourceMatcher.ts — 信源匹配

```
职责：
根据 intent.category 返回应抓取的信源列表

输入：category 字符串
输出：FeedSource[]（从 sources.json 中筛选）

映射逻辑：
  "科技" → sources.json 中 categories 包含 "科技" 的源
  "财经" → sources.json 中 categories 包含 "财经" 的源
  "兜底" → 所有 sources.json 中的源

注：
  此模块逻辑简单稳定，纯数据驱动，不考虑用 LLM。
  当用户不确定分类（category 为空）时降级为"兜底"。
```

### 5.7 orchestrator/engine.ts — 核心编排

```
编排流程：

handleUserMessage(text: string) → 飞书推送:

1. intent = intentParser.parse(text)
   ↓ 失败 → 回复引导提示

2. sources = sourceMatcher.match(intent.category)
   ↓

3. switch intent.mode:
     case "subscribe":
        4a. db.createSubscription({...intent, sources})
        5a. cron.register(subscription)  // 每天 01:00
        6a. 回复: ✅ 已开始追踪

     case "hotspot":
        4b. fetchAllFeeds(sources)
        5b. parseFeed(xml) → Article[]
        6b. filterRecent(articles, 48h)
        7b. dedupe(articles)
        8b. topicFilter(articles, intent.topic)
        9b. if intent.needSummary:
              result = timelineBuilder.build(articles, intent.topic)
            else:
              result = formatArticles(articles.slice(0,10))
        10b. pushToFeishu(result)
        11b. 回复: 搜索结果

容错：
  - 抓取失败：返回已获取的部分结果 + 注明哪些源失败
  - 过滤后无结果：回复 "当前没有关于 {topic} 的新内容"
  - 单步失败不影响其他步骤（发布隔离）

资源管理：
  - 同次运行中同 sources 不重复抓（Map cache）
  - 输出到 stderr 的日志统一收集到 journald
```

### 5.8 orchestrator/timelineBuilder.ts — 时间线+观点

```
职责：
接收按时间排序的文章列表 → 调 DeepSeek → 生成时间线+观点

输入：Article[]（按 pubDate 倒序）+ topic 字符串
输出：结构化内容（Markdown 字符串）

Prompt 设计见 7.3 节。

限制：
  - 文章数最多 20 篇（超出 truncate）
  - 单篇摘要超过 500 字则截断
```

### 5.9 orchestrator/topicFilter.ts — 主题二次过滤

```
职责：
在 AI 关键词过滤后，从结果中只保留与某 topic 相关的文章

策略：
  初级阶段：简单的关键词匹配（title + summary 包含 topic 即保留）
  升级阶段：如精度不足，改为 LLM 判断（"这篇是否关于 {topic}"）

边界：
  如果全部过滤掉 → 返回空数组，由 engine.ts 处理"无结果"情况
```

### 5.10 orchestrator/db.ts — SQLite 存储

```
职责：
订阅数据持久化

表层接口（业务语义）：
  createSubscription(data): Subscription
  getSubscription(id): Subscription | null
  listActiveSubscriptions(): Subscription[]
  cancelSubscription(id): void
  recordPush(subscriptionId, count, summary): void
  getPushHistory(subscriptionId, limit): History[]

数据模型见 6.1 节。

实现：
  - 使用 better-sqlite3（同步 API，简单可靠）
  - 数据库文件路径：process.env.DB_PATH || './data/ainews.db'
  - migrations（建表脚本）写在 db.ts 中，启动时自动执行 CREATE TABLE IF NOT EXISTS
```

---

## 6. 数据模型

### 6.1 SQLite 表结构

```sql
CREATE TABLE IF NOT EXISTS subscriptions (
  id            TEXT PRIMARY KEY,
  -- 当前只有 1 个用户（你），后续扩展为 user_id
  topic         TEXT NOT NULL,            -- "人形机器人"
  category      TEXT NOT NULL,            -- "科技" | "财经" | "体育" | "兜底"
  mode          TEXT NOT NULL DEFAULT 'subscribe',  -- subscribe | hotspot
  need_summary  INTEGER NOT NULL DEFAULT 1,
  sources       TEXT NOT NULL,            -- JSON 数组: '["量子位","TechCrunch"]'
  is_default    INTEGER NOT NULL DEFAULT 0,  -- 是否为默认预置订阅
  created_at    TEXT NOT NULL,            -- ISO 8601
  last_run_at   TEXT,                     -- 上次执行时间
  is_active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS push_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id TEXT NOT NULL,
  pushed_at       TEXT NOT NULL,           -- ISO 8601
  articles_count  INTEGER NOT NULL DEFAULT 0,
  summary         TEXT,                    -- 本次推送的摘要内容
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);

CREATE INDEX IF NOT EXISTS idx_push_history_sub_id ON push_history(subscription_id);
```

### 6.2 数据库初始化

`db.ts` 启动时自动执行：

```sql
CREATE TABLE IF NOT EXISTS ...
```

同时检查是否已有默认"AI 日报"订阅，没有则自动创建：

```json
{
  "id": "default-ai-daily",
  "topic": "AI 新闻",
  "category": "科技",
  "mode": "subscribe",
  "needSummary": 1,
  "sources": ["全部"],
  "isDefault": 1
}
```

---

## 7. LLM 接口契约

### 7.1 意图解析 Prompt 设计

```
System:
你是一个意图解析助手。收到用户的一条消息，请判断：
1. mode: 用户想要长期追踪(scribe)还是立即查看(hotspot)
   - "盯一下"、"关注"、"跟踪" → subscribe
   - "看看"、"最近"、"今天" → hotspot
   - 难以判断时默认 hotspot
2. category: 用户关心的领域
   - 涉及 AI、科技、计算机 → "科技"
   - 涉及公司、市场、投融资 → "财经"
   - 涉及赛事、运动员 → "体育"
   - 不确定 → "兜底"
3. topic: 用 2-10 个字提炼主题词
4. needSummary: 是否需要总结/观点归纳

请以 JSON 格式回复，不要多余解释。

User: 帮我盯一下人形机器人

Assistant: {"mode":"subscribe","category":"科技","topic":"人形机器人","needSummary":true}

User: OpenAI 最近有什么消息

Assistant: {"mode":"hotspot","category":"科技","topic":"OpenAI","needSummary":true}

User: 取消

Assistant: {"mode":"cancel","category":"","topic":"","needSummary":false}
```

### 7.2 意图解析容错

- JSON 解析失败 → 追加 "请严格遵守 JSON 输出格式，不要输出任何额外内容" 重试 1 次
- 字段缺失 → 用默认值填充（mode=hotspot, category=兜底, needSummary=true）
- 完全无法解析 → 抛出 `IntentParseError`，engine 层返回引导提示

### 7.3 时间线+观点 Prompt 设计

```
System:
你是一个新闻分析师。收到一组关于 "{topic}" 的系列报道，
需要完成两项任务：

1. 梳理时间线
   按日期列出关键事件，格式：
   📅 时间线
   MM/DD | 事件简述 | [来源]
   MM/DD | 事件简述 | [来源]

2. 观点归纳
   阅读所有报道，提取目前存在的不同观点/立场。
   区分 2-4 类明显不同的观点，每类用一句话概括，
   并注明哪些报道支持该观点。格式：
   💡 各方观点
   - 观点一：...（来源：源A、源B）
   - 观点二：...（来源：源C）

注意：
  - 时间线按日期从旧到新排列
  - 如果所有报道观点一致，就写 "目前各方观点较为一致" 并概括
  - 输出纯文本，不用 markdown 包装
  - 总字数控制在 500 字以内
```

---

## 8. 错误处理策略

### 8.1 错误分级

| 级别 | 含义 | 行为 |
|------|------|------|
| WARN | 非关键失败 | 记录日志，按降级路径继续执行 |
| ERROR | 功能失败 | 记录日志，跳过该功能，不影响其他功能 |
| FATAL | 进程不可恢复 | 记录日志，进程退出，systemd 自动重启 |

### 8.2 具体场景

| 场景 | 级别 | 行为 |
|------|------|------|
| 单个 RSS 源抓取失败 | WARN | 跳过该源，继续抓其他源（已有实现） |
| 翻译失败 | WARN | 保留原文（已有实现） |
| LLM 意图解析失败 | ERROR | 回复引导提示，不执行后续 |
| LLM 总结生成失败 | ERROR | 推送时不带观点归纳，仅呈现文章列表 |
| DeepSeek API 超时/无响应 | ERROR | LLM 相关步骤降级（无总结/无观点） |
| DeepSeek API key 未配置 | FATAL | 启动时检查并报错退出 |
| 飞书推送失败 | ERROR | 记录日志，不影响日报生成（已有实现） |
| 飞书 token 获取失败 | ERROR | 后续推送操作均失败，报具体原因 |
| 数据库写入失败 | FATAL | 进程退出，systemd 重启 |
| 未捕获异常 | FATAL | 全局 catch，记录后退出 |

### 8.3 用户提示文案

LLM 失败时：

```
🤔 没完全理解，能说得具体一点吗？
你可以这样问我：
- "订阅 人形机器人"（长期追踪某个话题）
- "帮我看看 OpenAI 最近的消息"（立即查一次）
- "查看"（看当前订阅了哪些）
```

API 不可用时：

```
⚠️ 服务暂时不可用
- DeepSeek API 连接失败，请稍后再试
```

---

## 9. 分步实施计划

### Step 1 — 基础设施（预计 1 天+ 域名生效等待）

**输出：** Nginx + SSL OK，飞书 Bot 应用注册完成

| 任务 | 外部依赖 |
|------|---------|
| 购买域名配 DNS | 域名注册商 |
| Nginx + certbot 安装配置 | 无 |
| 飞书开放平台创建应用 | 飞书后台 |
| `deploy/ai-bot.service` | 无 |
| `scripts/setup-bot-server.sh` | 无 |

**验证：** `curl https://域名` → SSL 正常；飞书后台 challenge 测试通过

---

### Step 2 — 信源分类 + Bot 架子（预计 0.5 天）

**输出：** Bot 能收消息并回复，分类信源映射就位

| 任务 | 涉及文件 |
|------|---------|
| sources.json 加 categories | `sources.json` |
| Express 服务器入口 | `src/bot/index.ts` |
| 飞书事件路由 + challenge | `src/bot/router.ts` |
| 飞书消息 API | `src/bot/message.ts` |
| 飞书认证模块 | `src/bot/auth.ts` |
| 配置 + 类型扩展 | `src/config.ts`, `src/types.ts` |
| package.json 加依赖 | `package.json` |

**验证：** 飞书发 "hello" → 回复 "收到"

---

### Step 3 — 编排引擎（预计 1-2 天）

**输出：** 命令行可完整执行追踪任务

| 任务 | 涉及文件 |
|------|---------|
| DeepSeek API 封装 | `src/orchestrator/intentParser.ts` |
| 分类→信源匹配 | `src/orchestrator/sourceMatcher.ts` |
| 编排引擎 | `src/orchestrator/engine.ts` |
| 时间线+观点生成 | `src/orchestrator/timelineBuilder.ts` |
| 主题过滤 | `src/orchestrator/topicFilter.ts` |
| SQLite 存储 | `src/orchestrator/db.ts` |

**验证：** `tsx src/orchestrator/engine.ts --topic "人形机器人" --mode hotspot` → 输出时间线文档到 stdout

---

### Step 4 — Bot 完整交互（预计 0.5 天）

**输出：** 飞书全流程可用

| 任务 | 涉及文件 |
|------|---------|
| 消息→引擎路由 | `src/bot/router.ts`（扩展） |
| 订阅 CRUD 命令 | `src/orchestrator/db.ts`（补充） |
| 默认 AI 日报注册 | `src/orchestrator/db.ts`（初始化） |
| node-cron 调度 | `src/bot/index.ts`（补充） |
| 新系统稳定后停旧 timer | 运维操作 |

**验证：** 飞书全流程：订阅→查看→取消→定时推送→热点查询

---

## 10. 二期对比验证

自建服务稳定运行后，开启二期：

### 准备

- 服务器安装 OpenClaw / Hermes / WorkBuddy（选 1-2 个）
- 编写对应的 Skill，实现同样的追踪流程
- Nginx 增加路由：`/bot/` → 自建 :3000，`/claw/` → 框架 :18789

### 对比维度

| 维度 | 对比方式 |
|------|---------|
| **结果质量** | 同一组文章 → 两种方式分别输出 → 人工打分（相关度/总结质量） |
| **响应速度** | 热点追踪（hotspot）从触发到推送的耗时 |
| **Token 消耗** | 完成一次完整追踪的 DeepSeek API token 用量 |
| **调试难度** | 出错时找到根因所需时间 |
| **开发量** | 实现同等工作量时新增的代码/配置行数 |
| **维护负担** | 升级依赖、修复 bug 的难度 |

---

## 附录：与旧架构的对比

| | 旧架构（当前） | 新架构（目标） |
|---|---|---|
| 运行模式 | CLI 触发 → 退出 | 常驻进程（24h） |
| 进程数量 | 1（systemd timer → CLI） | 2（Nginx + Express） |
| 状态管理 | 无状态 | SQLite 持久化 |
| 用户交互 | 无 | 飞书 Bot 对话 |
| 任务灵活性 | 固定 AI 日报 | 按需订阅 |
| LLM 依赖 | 无 | DeepSeek API（意图+总结） |
| 部署复杂度 | 低 | 中（多了 Nginx/SSL/常驻进程） |
| 回滚方式 | 回滚到旧 timer | 关掉 bot service，启回 timer |

---

> 本文档是开发执行的依据。开发过程中如有需求变更，请同步更新本文档并更新版本号。
