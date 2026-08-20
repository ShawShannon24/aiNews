# AI News — AI 新闻聚合 CLI 工具

## 项目说明

从 7 个 RSS 源（4 中文 + 3 英文）抓取 AI 相关文章，生成 Markdown 格式的日报。按语言分组：前 10 篇中文 + 后 10 篇外文，先中后英。支持中英翻译、飞书推送和小红书内容生成。

📋 详细路线图见 [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md)
✅ Phase 4 — 腾讯云轻量服务器部署已上线
✅ Phase 4.5 — 飞书机器人交互已实现（Bot 接引擎 + 定时调度 P0，2026-08-09 代码完成，待凭据验证）

## Git 工作流

- 新功能或修 bug 请先建分支，不要在 `main` 上直接提交开发中的代码
- 分支命名：`feat/xxx`、`fix/xxx`、`refactor/xxx`
- 提交信息格式：`类型: 描述`（如 `feat:`、`fix:`、`chore:`、`docs:`）
- 开发完成后合并回 `main`

## 运行命令

```bash
npm start                                        # 仅抓取 + 生成日报（含翻译 + 过滤 + 总结）
npm test                                         # 运行单元测试
npx tsx src/index.ts                             # 默认：翻译 + 过滤 + 总结，20 篇（10zh + 10en）
npx tsx src/index.ts --no-translate              # 关闭翻译
npx tsx src/index.ts --no-summary                # 关闭每日总结
npx tsx src/index.ts -o ./reports -h 48          # 自定义输出目录和时间窗口
npx tsx src/index.ts --feishu                    # + 推送飞书群机器人
npx tsx src/index.ts --xhs                       # + 生成小红书内容
npx tsx src/index.ts --feishu --xhs              # 全流程
npx tsx src/index.ts --help                      # 查看全部选项
```

### CLI 选项

| 选项 | 说明 |
|---|---|
| `-t, --translate` | 翻译标题和摘要为中英对照（默认开启，`--no-translate` 关闭） |
| `-s, --summary` | 生成「AI 资讯速览」每日总结（默认开启，`--no-summary` 关闭） |
| `-o, --out-dir <路径>` | 输出目录（默认 `./output`） |
| `-h, --hours <小时数>` | 时间过滤窗口（默认 24） |
| `-m, --max <数量>` | 最多输出文章数（默认 20，设为 0 不限制；当前固定中文 10 + 外文 10） |
| `-f, --feishu` | 推送精简日报到飞书群机器人 |
| `-x, --xhs` | 生成小红书发布内容 |
| `-?, --help` | 显示帮助信息 |

### Bot 服务命令（Phase 4.5 + P0）

```bash
# 启动飞书 Bot 常驻服务（需配置 AINEWS_FEISHU_BOT_APP_ID/APP_SECRET）
npx tsx src/bot/index.ts

# 健康检查
curl http://localhost:3000/health

# 事件回调地址：POST /webhook/event
```

**P0（2026-08-09）Bot 已接入话题追踪引擎**，支持对话式命令：
- 「订阅 X」→ 记录订阅（含来源会话 chat_id）+ 注册 node-cron 每日推送
- 「看看 X」→ 热点追踪（时间线 + 观点）
- 「查看」→ 列出当前订阅
- 「取消 X」→ 取消订阅

启动时自动初始化默认订阅并同步调度器；优雅退出时停止所有 cron 任务。

### 话题追踪引擎命令（Phase 4.5）

```bash
# 立即执行一次热点追踪
npx tsx src/orchestrator/engine.ts --mode hotspot --topic "人形机器人"

# 保存为定时订阅
npx tsx src/orchestrator/engine.ts --mode subscribe --topic "OpenAI"

# 查看当前订阅
npx tsx src/orchestrator/engine.ts --mode view

# 取消订阅
npx tsx src/orchestrator/engine.ts --mode cancel --topic "OpenAI"

# 运行单元测试
npx tsx src/orchestrator/intentParser.test.ts
npx tsx src/orchestrator/sourceMatcher.test.ts
npx tsx src/orchestrator/topicFilter.test.ts
npx tsx src/orchestrator/db.test.ts
```

### 部署相关命令

```bash
# 服务器信息
#   腾讯云轻量服务器 | 北京 | 4核4G | Ubuntu 24.04 LTS
#   IP: 140.143.242.88 | 用户: ubuntu

# 查看运行日志
ssh ubuntu@140.143.242.88 'journalctl -u ai-news.service -n 50 --no-pager'

# 手动触发一次日报
ssh ubuntu@140.143.242.88 'sudo systemctl start ai-news.service'

# 更新代码
ssh ubuntu@140.143.242.88 'cd /opt/aiNews && git pull && npm install --production && sudo systemctl restart ai-news.timer'

# Bot 服务（Phase 4.5 + P0）
ssh ubuntu@140.143.242.88 'sudo journalctl -u ai-bot.service -n 50 --no-pager'
ssh ubuntu@140.143.242.88 'sudo systemctl restart ai-bot.service'
```

### 云端 Bot 部署现状（2026-08-20）

- **入口**：云端 80/443 由 **Caddy** 管理，`newsbot.xiyin.online → 127.0.0.1:3001`
- **端口**：Bot 监听 **3001**（3000 被 health-bot 占用，`deploy/ai-bot.service` 设 `PORT=3001`）
- **代码**：云端 `/opt/aiNews` 跑在 `main` 分支（已合并全部 P0/P1）
- **运行用户**：`User=ubuntu`（ainews 用户因 npx 需可写 home 而弃用）
- **✅ 已上线（2026-08-18）**：备案通过 → `newsbot.xiyin.online` 证书签发 → `ai-bot.service` 运行，飞书对话式订阅/热点/查看/取消全部工作
- **✅ P2 完成（2026-08-20）**：默认「AI 新闻」订阅已配 `chat_id`，**systemd timer 已停用**，日报改由 Bot 的 node-cron 推送（webhook 链路退役）

完整待办见 [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) 当前状态。

### 云端多服务权限约定（2026-08-11 教训）

`/opt/aiNews` 由两个 systemd 服务共享，**以不同系统用户运行、写不同子目录**：

| 服务 | 运行用户 | 写的子目录 |
|---|---|---|
| `ai-news.service`（日报） | `ubuntu` | `/opt/aiNews/output/` |
| `ai-bot.service`（Bot，待启动） | `ainews` | `/opt/aiNews/data/` |

⚠️ **教训**：2026-08-10 部署 Bot 时对 `/opt/aiNews` 整体执行 `chown -R ainews:ainews`，导致日报服务（ubuntu 用户）无法写 `output/`，**次日日报推送失败**（EACCES），2026-08-11 已修复（`chown -R ubuntu:ubuntu /opt/aiNews/output`）。

**规范：**
- 给 Bot（ainews）授权时**只** chown 它需要的子目录，例如 `sudo chown -R ainews:ainews /opt/aiNews/data`
- **绝不**对共享项目目录整体 `chown -R`
- 改权限后手动触发一次日报验证：`sudo systemctl start ai-news.service`，确认「✅ 飞书推送完成」

## 项目结构

```
src/
  index.ts          # 入口：编排抓取 → 过滤 → 分组 → 翻译 → 生成报告
  config.ts         # 配置加载（~/.ainews/config.json + 环境变量）
  types.ts          # 类型定义（FeedSource 含 lang 字段）
  fetcher.ts        # 并发抓取 RSS 源（含指数退避重试）
  parser.ts         # XML 解析、摘要提取（自然断句）、24h 过滤、去重、排序
  parser.test.ts    # 单元测试（node:test，零依赖）
  filter.ts         # AI/科技关键词过滤器（垂直化内容）
  scorer.ts         # 综合热度排序（时间×35% + 跨源×25% + 信号词×25% + 长度×15%）
  summarizer.ts     # 200 字以内每日 AI 资讯速览（模板化，零外部 API）
  reporter.ts       # Markdown 日报生成，支持中英分段标题
  translator.ts     # 中英翻译（MyMemory + Google Translate 双引擎降级）
  bot/
    index.ts        # 飞书 Bot 常驻服务入口（Phase 4.5 + P0 接引擎）
    router.ts       # 飞书事件回调路由 + 签名验证
    auth.ts         # 飞书 tenant access token 管理
    message.ts      # 飞书消息发送 API
    scheduler.ts    # [P0] node-cron 订阅定时调度（同步/停止/推送）
  orchestrator/
    engine.ts       # 话题追踪编排引擎（CLI + Bot 双模式）
    intentParser.ts # NL 意图解析（订阅 / 热点 / 查看 / 取消）
    intentParser.test.ts
    sourceMatcher.ts# 话题→信源自动匹配
    sourceMatcher.test.ts
    topicFilter.ts  # 主题二次过滤
    topicFilter.test.ts
    timelineBuilder.ts # 话题时间线生成
    db.ts           # SQLite 订阅持久化
    db.test.ts
  publishers/
    feishu.ts       # 飞书群机器人推送
    feishu.test.ts
    xiaohongshu.ts  # 小红书内容格式化
    xiaohongshu.test.ts
scripts/
  setup-server.sh     # [Phase 4] 腾讯云服务器一键初始化脚本
  setup-bot-server.sh # [Phase 4.5] Bot 服务器（Nginx + SSL）初始化脚本
deploy/
  ai-news.service     # [Phase 4] systemd oneshot 服务（每日日报）
  ai-news.timer       # [Phase 4] systemd 定时器（每天 08:00）
  ai-bot.service      # [Phase 4.5] systemd 常驻服务（飞书 Bot）
  ai-bot.conf         # [Phase 4.5] Nginx 反向代理（SSL + Webhook）
  logrotate.conf      # [Phase 4] 日志轮转配置
  README.md           # [Phase 4] 云端部署指南
docs/
  PRODUCT_PLAN.md     # 产品计划书（路线图、各 Phase 详细说明）
  REQUIREMENTS.md     # 需求文档
output/
  xiaohongshu/        # 小红书内容输出目录
sources.json          # RSS 源配置文件（含 lang 字段: zh/en，可编辑增删）
run-daily.sh          # 本地开发用：每日抓取 + 翻译
run-weekly.sh         # 本地开发用：每周抓取 + 翻译 + 飞书推送
```

📋 完整路线图见 [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md)

## 日报格式

- Markdown 文件，输出到 `./output/ai-daily-YYYY-MM-DD.md`
- 自动过滤：仅保留 AI/科技相关内容，过滤财经、房地产等非相关文章
- 综合热度排序（替代纯时间排序）：时间 × 35% + 跨源重复 × 25% + 信号词 × 25% + 内容长度 × 15%
- 日报头部显示 `📌 AI 资讯速览` 每日总结（≤200 字，默认开启）
- 文章按语言分组：**前 10 篇中文资讯**，后 10 篇外文资讯，带 `🇨🇳 中文资讯` / `🌐 外文资讯` 分段标题
- 组内按时间倒序排列
- 使用 `--translate` 参数时标题和摘要显示中英对照
- Hacker News 的元数据（Article URL、Comments URL 等）自动过滤

## RSS 源配置

源列表配置在 `sources.json`，每条记录含 `lang` 字段（`zh`=中文, `en`=英文）。可自由增删。当前值：

| 源 | URL | 语言 |
|---|---|---|
| TechCrunch | `https://techcrunch.com/category/artificial-intelligence/feed/` | EN |
| Hacker News | `https://hnrss.org/newest?q=AI&count=30` | EN |
| ArXiv AI | `https://rss.arxiv.org/rss/cs.AI` | EN |
| 量子位 | `https://www.qbitai.com/feed` | 中文 |
| AIHOT | `https://aihot.virxact.com/rss` | 中文 |
| 36氪 | `https://36kr.com/feed` | 中文 |
| 雷锋网 | `https://www.leiphone.com/feed` | 中文 |

**说明：**
- The Verge 已切换为 Atom 格式（非 RSS 2.0），暂不兼容，待后续支持
- 机器之心已关闭公开 RSS，其内容可通过 AIHOT（聚合源）覆盖
- 虎嗅 RSS 位于阿里云 WAF 之后，程序无法直接访问
- 极客公园 RSS 不可达，暂未加入

## 配置管理

支持两种配置方式，环境变量优先：

### 1. 本地开发（`~/.ainews/config.json`）

```json
{
  "feishu": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
  },
  "xiaohongshu": {
    "enabled": true,
    "maxArticles": 5
  }
}
```

### 2. 云服务器（`/etc/ai-news.env`）

```env
AINEWS_FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx
AINEWS_XHS_ENABLED=true
AINEWS_XHS_MAX_ARTICLES=5
```

环境变量覆盖规则：
- `AINEWS_FEISHU_WEBHOOK_URL` → 覆盖 feishu.webhookUrl
- `AINEWS_XHS_ENABLED` → 启用小红书发布
- `AINEWS_XHS_MAX_ARTICLES` → 小红书最大文章数（默认 5）

### 3. Bot 服务配置（Phase 4.5，可选）

飞书 Bot 应用和 DeepSeek API 通过以下环境变量或 `~/.ainews/config.json` 配置：

```json
{
  "bot": {
    "appId": "cli_xxx",
    "appSecret": "xxx",
    "verifyToken": "xxx"
  },
  "deepseek": {
    "apiKey": "sk-xxx",
    "baseUrl": "https://api.deepseek.com/v1"
  }
}
```

环境变量：
- `AINEWS_FEISHU_BOT_APP_ID` / `AINEWS_FEISHU_BOT_APP_SECRET` / `AINEWS_FEISHU_BOT_VERIFY_TOKEN`
- `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL`

### 4. 定时任务配置（Phase 4.5）

```env
# Bot 定时推送使用 node-cron，默认每天 08:00
# 可配置 .env 或环境变量：
CRON_SCHEDULE=0 8 * * *
```

## 可靠性特性

- **抓取重试**：失败时自动重试 2 次，指数退避（1s → 3s）
- **翻译降级**：MyMemory 配额用完或超时时自动降级到 Google Translate（无需 key）
- **运行内缓存**：同次运行内相同文本只翻译一次
- **日期容错**：日期解析失败的文章排在列表尾部，不会丢弃
- **发布隔离**：飞书推送 / 小红书生成独立运行，任一失败不影响日报生成
- **内容垂直化**：[Phase 1] 关键词过滤器保证每篇文章与 AI/科技相关
- **云端容错**：[Phase 4] systemd journald 日志 + logrotate，失败可追溯
- **Bot 优雅退出**：[Phase 4.5] bot/index.ts 注册 SIGTERM/SIGINT 处理，5s 超时强制退出
- **Bot 自动重启**：[Phase 4.5] ai-bot.service 配置 Restart=on-failure + RestartSec=10s
- **编排隔离**：[Phase 4.5] 日报 / 热点追踪 / 订阅推送各自独立执行，任一失败不影响其他

## 定时任务

### 云服务器（当前生产环境）

通过 systemd timer 调度，每天 08:00 自动执行（带 300s 随机延迟避免整点并发）：
```
ai-news.timer → ai-news.service → npx tsx src/index.ts --translate --feishu
```

管理命令：
```bash
# 查看下次执行时间
ssh ubuntu@140.143.242.88 'systemctl list-timers ai-news.timer --no-pager'

# 查看上次运行日志
ssh ubuntu@140.143.242.88 'journalctl -u ai-news.service -n 50 --no-pager'

# 手动触发
ssh ubuntu@140.143.242.88 'sudo systemctl start ai-news.service'
```

### Bot 常驻服务（Phase 4.5）

飞书 Bot 通过 systemd service 常驻运行，自动重启：
```
ai-bot.service → npx tsx src/bot/index.ts
```

用户通过 Bot 创建的订阅由 `orchestrator/engine.ts` 处理，支持：
- **热点追踪**：立即执行一次，返回时间线
- **长期订阅**：调用 `executeSubscription()` 按 cron 调度（默认每天 08:00）
- **查看/取消**：通过 SQLite 管理订阅状态

### 本地（仅开发测试，云端已上线后停用）

~~通过 macOS launchd 调度，每周六早 8:00 运行~~（云端已上线，本地 launchd 待退役）：
```
com.user.ainews → run-weekly.sh → npx tsx src/index.ts --translate
```
