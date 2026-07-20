#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# AI News — Bot 服务器初始化脚本
# 使用方式：以 root 登录服务器后执行
#   bash scripts/setup-bot-server.sh
#
# 前置条件：域名已购买、DNS A 记录已指向本机 IP
# ============================================================

echo "========================================"
echo " AI News Bot 服务器初始化"
echo "========================================"

# ---------- 1. 安装 Nginx ----------
if ! command -v nginx &>/dev/null; then
    echo "[1/5] 安装 Nginx..."
    apt-get update -qq
    apt-get install -y -qq nginx certbot python3-certbot-nginx
else
    echo "[1/5] Nginx 已安装，跳过"
fi

# ---------- 2. 复制配置文件 ----------
echo "[2/5] 安装 Bot 配置文件..."
cp /opt/aiNews/deploy/ai-bot.service /etc/systemd/system/ai-bot.service

# Nginx 配置 — 提示用户先替换域名
if [ ! -f /etc/nginx/sites-enabled/ai-bot.conf ]; then
    echo "⚠️  请先编辑 /opt/aiNews/deploy/ai-bot.conf，确认 server_name 为 xiyin.online，然后执行："
    echo "    cp /opt/aiNews/deploy/ai-bot.conf /etc/nginx/sites-enabled/"
    echo "    nginx -t && systemctl reload nginx"
else
    echo "    Nginx 配置已就绪"
fi

# ---------- 3. 创建数据目录 ----------
echo "[3/5] 创建数据目录..."
mkdir -p /opt/aiNews/data
chmod 700 /opt/aiNews/data

# ---------- 4. 配置 SSL（certbot） ----------
echo "[4/5] 配置 SSL..."
echo "    请在域名 DNS 生效后，执行以下命令获取 SSL 证书："
echo ""
echo "    certbot --nginx -d 你的域名 --non-interactive --agree-tos -m admin@你的域名"
echo ""

# ---------- 5. 环境变量 ----------
echo "[5/5] 环境变量检查..."
ENV_FILE="/etc/ai-news.env"
if [ -f "$ENV_FILE" ]; then
    # 检查是否已有 Bot 配置
    if grep -q "AINEWS_FEISHU_BOT_APP_ID" "$ENV_FILE" 2>/dev/null; then
        echo "    ✅ Bot 环境变量已配置"
    else
        echo "    ⚠️  请在 $ENV_FILE 中追加以下配置："
        echo ""
        echo "    # 飞书 Bot 应用"
        echo "    AINEWS_FEISHU_BOT_APP_ID=cli_xxxxxxxxxxxx"
        echo "    AINEWS_FEISHU_BOT_APP_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx"
        echo "    AINEWS_FEISHU_BOT_VERIFY_TOKEN=xxxxxxxxxxxxx"
        echo ""
        echo "    # DeepSeek API"
        echo "    DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx"
        echo "    DEEPSEEK_BASE_URL=https://api.deepseek.com/v1"
        echo ""
        echo "    # 数据库路径"
        echo "    DB_PATH=/opt/aiNews/data/ainews.db"
        echo ""
    fi
else
    echo "    ⚠️  环境变量文件 $ENV_FILE 不存在！"
    echo "    请从本地复制或手动创建"
fi

# ---------- 完成 ----------
echo ""
echo "========================================"
echo " ✅ 初始化完成！后续操作："
echo "========================================"
echo ""
echo " 1. 编辑 Nginx 配置并替换域名："
echo "    cp /opt/aiNews/deploy/ai-bot.conf /etc/nginx/sites-enabled/"
echo "    sed -i 's/你的域名/你的实际域名/g' /etc/nginx/sites-enabled/ai-bot.conf"
echo "    nginx -t && systemctl reload nginx"
echo ""
echo " 2. 获取 SSL 证书："
echo "    certbot --nginx -d 你的域名 --non-interactive --agree-tos -m admin@你的域名"
echo ""
echo " 3. 填充环境变量："
echo "    vi /etc/ai-news.env"
echo ""
echo " 4. 启动 Bot："
echo "    systemctl daemon-reload"
echo "    systemctl enable --now ai-bot.service"
echo "    journalctl -u ai-bot.service -f"
echo ""
echo " 5. 飞书后台配置事件回调 URL："
echo "    https://你的域名/webhook/event"
echo "    → 点击「验证」→ 应该显示「验证通过」"
echo "========================================"
