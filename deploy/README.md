# AI News — 云端部署指南

> 腾讯云轻量应用服务器部署全流程

---

## 目录

1. [购买服务器](#1-购买服务器)
2. [服务器初始化](#2-服务器初始化)
3. [配置环境变量](#3-配置环境变量)
4. [手动验证](#4-手动验证)
5. [启用定时任务](#5-启用定时任务)
6. [日常运维](#6-日常运维)
7. [本地 launchd 退役](#7-本地-launchd-退役)

---

## 1. 购买服务器

前往 [腾讯云轻量应用服务器](https://cloud.tencent.com/product/lighthouse) 购买：

| 套餐 | 价格 | 适用阶段 |
|------|------|---------|
| 2核2G \| 4M \| 50GB SSD | **99元/年**（续费同价） | Phase 4 够用 |
| 2核4G \| 6M \| 70GB SSD | **199元/年**（续费同价） | Phase 4.5 更稳妥 |

**购买要点：**
- 地域选离你最近的（如**上海**或**广州**）
- 镜像选 **Ubuntu 22.04 LTS**
- 防火墙放行 **SSH（22端口）** 即可（无 Web 服务则无需 80/443）
- 购买后记下**公网 IP**

---

## 2. 服务器初始化

### 2.1 SSH 登录

```bash
ssh root@<服务器公网IP>
```

### 2.2 一键初始化（推荐）

项目已包含初始化脚本，登录服务器后执行：

```bash
# 如果项目已 clone
cd /opt/aiNews && bash scripts/setup-server.sh

# 如果从头开始，先 clone
git clone https://github.com/ShawShannon24/aiNews.git /opt/aiNews
cd /opt/aiNews && bash scripts/setup-server.sh
```

脚本自动完成：

| 步骤 | 内容 |
|------|------|
| ✅ | 系统更新 + 安装 curl/git/unzip |
| ✅ | 安装 Node.js 22 |
| ✅ | Clone 项目 + 安装 npm 依赖 |
| ✅ | 创建日志目录 `/var/log/ai-news` |
| ✅ | 创建环境变量模板 `/etc/ai-news.env` |
| ✅ | 配置 systemd timer（每天 08:00 执行） |
| ✅ | 配置 logrotate（日志保留 30 天） |

### 2.3 手动安装（不想用脚本）

```bash
# 安装 Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs git

# 克隆项目
git clone https://github.com/ShawShannon24/aiNews.git /opt/aiNews
cd /opt/aiNews && npm install --production

# 配置 systemd
cp deploy/ai-news.service /etc/systemd/system/
cp deploy/ai-news.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now ai-news.timer

# 配置 logrotate
cp deploy/logrotate.conf /etc/logrotate.d/ai-news
```

---

## 3. 配置环境变量

编辑 `/etc/ai-news.env`：

```bash
sudo vi /etc/ai-news.env
```

填入飞书 Webhook URL（如需要飞书推送）：

```env
AINEWS_FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/你的Webhook
```

可选配置：

```env
AINEWS_XHS_ENABLED=true
AINEWS_XHS_MAX_ARTICLES=5
```

> **提示：** 如果之前已在 `~/.ainews/config.json` 中配过，可以直接把 webhook URL 复制过来。

---

## 4. 手动验证

在正式启用定时任务前，先手动跑一次确认全部正常：

```bash
cd /opt/aiNews && npx tsx src/index.ts --translate --feishu
```

检查输出：
- ✅ 抓取正常（显示 7 个源的文章数）
- ✅ 翻译正常（标题/摘要中英对照）
- ✅ 飞书推送正常（手机收到消息）
- ✅ 无报错

---

## 5. 启用定时任务

初始化脚本已自动完成，确认 timer 状态：

```bash
# 查看 timer 状态
systemctl status ai-news.timer

# 查看已排期的任务
systemctl list-timers ai-news.timer

# 查看最近一次运行日志（需等任务执行后）
journalctl -u ai-news.service -n 50 --no-pager
```

**手动触发一次（用于测试）：**

```bash
systemctl start ai-news.service
journalctl -u ai-news.service -f
```

---

## 6. 日常运维

### 查看日志

```bash
# 最近一次运行详情
journalctl -u ai-news.service -n 100 --no-pager

# 持续跟踪
journalctl -u ai-news.service -f

# 查看历史日志文件
ls -la /var/log/ai-news/
```

### 更新代码

```bash
cd /opt/aiNews
git pull
npm install --production
```

### 修改定时时间

```bash
sudo vi /etc/systemd/system/ai-news.timer
# 修改 OnCalendar 行，例如每天 07:30
# OnCalendar=*-*-* 07:30:00
sudo systemctl daemon-reload
sudo systemctl restart ai-news.timer
```

### 禁用 / 删除

```bash
# 暂停 timer（不删除）
sudo systemctl stop ai-news.timer
sudo systemctl disable ai-news.timer

# 完全删除
sudo systemctl stop ai-news.timer
sudo systemctl disable ai-news.timer
sudo rm /etc/systemd/system/ai-news.{service,timer}
sudo systemctl daemon-reload
```

---

## 7. 本地 launchd 退役

云端稳定运行后，停掉本地的 launchd 任务：

```bash
# 查看状态
launchctl print gui/$(id -u)/com.user.ainews

# 卸载
launchctl bootout gui/$(id -u)/com.user.ainews

# 删除 plist
rm ~/Library/LaunchAgents/com.user.ainews.plist
```

> 注意：先确认云服务器稳定运行至少 3 天，再执行退役操作。

---

## 8. 架构变迁

```
Before (Phase 0-3):                     After (Phase 4):
┌──────────────────────┐                ┌──────────────────────┐
│ macOS (本地电脑)       │                │ macOS (本地电脑)       │
│  ├─ launchd 定时调度   │                │  └─ 不再跑定时任务     │
│  └─ 生成日报 + 推送    │                │                      │
└──────────────────────┘                └──────────────────────┘
                                                  │
                                         SSH / git pull
                                                  │
                                         ┌───────┴──────────┐
                                         │ 腾讯云轻量服务器    │
                                         │  ├─ systemd timer  │
                                         │  ├─ generateReport │
                                         │  └─ Feishu Push    │
                                         └──────────────────┘
```

---

## 9. 失败通知（扩展阅读）

当前 systemd 自动记录失败日志（`journalctl -u ai-news.service`）。如需更主动的通知：

1. **OnFailure 钩子**：在 service 单元中添加 `OnFailure=ai-news-fail@%i.service`，可触发邮件/飞书通知
2. **健康检查**：外部监控服务定时 curl 一个健康端点（需 Phase 4.5 常驻进程）
3. **飞书通知**：在 `src/index.ts` 的 catch 块中直接推送飞书消息（已在 Phase 2 实现）

> 建议先跑两周再看看是否需要额外通知，静默运行失败的概率很低。
