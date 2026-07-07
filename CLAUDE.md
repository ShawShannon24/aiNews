# AI News — AI 新闻聚合 CLI 工具

## 项目说明

从 7 个 RSS 源（4 中文 + 3 英文）抓取 AI 相关文章，生成 Markdown 格式的日报。按语言分组：前 10 篇中文 + 后 10 篇外文，先中后英。支持中英翻译、飞书推送和小红书内容生成。

📋 详细路线图见 [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md)
🔄 当前阶段：Phase 4 — 轻量云服务器部署（腾讯云轻量服务器）

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

### 部署相关命令

```bash
# 服务器一键初始化
ssh root@<服务器IP> 'bash -s' < scripts/setup-server.sh

# 手动更新代码（云服务器上）
ssh root@<服务器IP> 'cd /opt/aiNews && git pull && npm install --production'

# 查看运行日志
ssh root@<服务器IP> 'journalctl -u ai-news.service -n 50 --no-pager'

# 手动触发一次日报（测试用）
ssh root@<服务器IP> 'systemctl start ai-news.service'
```

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
  summarizer.ts     # 200 字以内每日 AI 资讯速览（模板化，零外部 API）
  reporter.ts       # Markdown 日报生成，支持中英分段标题
  translator.ts     # 中英翻译（MyMemory + Google Translate 双引擎降级）
  publishers/
    feishu.ts       # 飞书群机器人推送
    xiaohongshu.ts  # 小红书内容格式化
scripts/
  setup-server.sh   # [Phase 4] 腾讯云服务器一键初始化脚本
deploy/
  ai-news.service   # [Phase 4] systemd service 单元
  ai-news.timer     # [Phase 4] systemd 定时器（每天 08:00）
  logrotate.conf    # [Phase 4] 日志轮转配置
  README.md         # [Phase 4] 云端部署指南
docs/
  PRODUCT_PLAN.md   # 产品计划书（路线图、各 Phase 详细说明）
output/
  xiaohongshu/      # 小红书内容输出目录
.github/
  workflows/
    daily.yml       # [Phase 4] GitHub Actions 定时任务
sources.json        # RSS 源配置文件（含 lang 字段: zh/en，可编辑增删）
run-weekly.sh       # 定时任务脚本（每周六早 8:00）
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

使用 `~/.ainews/config.json` 存储敏感信息：

```json
{
  "feishu": {
    "webhookUrl": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
  },
  "xiaohongshu": {
    "enabled": true,
    "headless": true,
    "maxArticles": 5,
    "cookiePath": "~/.ainews/xhs-cookies.json"
  }
}
```

环境变量可覆盖（优先级更高）：
- `AINEWS_FEISHU_WEBHOOK_URL`
- `AINEWS_XHS_ENABLED`

## 可靠性特性

- **抓取重试**：失败时自动重试 2 次，指数退避（1s → 3s）
- **翻译降级**：MyMemory 配额用完或超时时自动降级到 Google Translate（无需 key）
- **运行内缓存**：同次运行内相同文本只翻译一次
- **日期容错**：日期解析失败的文章排在列表尾部，不会丢弃
- **发布隔离**：飞书推送 / 小红书生成独立运行，任一失败不影响日报生成
- **内容垂直化**：[Phase 1] 关键词过滤器保证每篇文章与 AI/科技相关
- **云端容错**：[Phase 4] GitHub Actions 内置失败通知 + 可追溯日志

## 定时任务

当前通过 macOS launchd 调度，每周六早 8:00 运行：
```
com.user.ainews → run-weekly.sh → npx tsx src/index.ts --translate
```

管理命令：
```bash
# 查看状态
launchctl print gui/$(id -u)/com.user.ainews

# 手动触发
launchctl start com.user.ainews

# 查看日志
cat /tmp/ai-news-cron.log
```
