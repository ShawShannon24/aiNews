#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# AI News — 腾讯云轻量服务器一键初始化脚本
# 用法：在云服务器上以 root 执行：
#   curl -fsSL https://raw.githubusercontent.com/.../setup-server.sh | bash
# 或手动拷贝到服务器后执行：
#   sudo bash scripts/setup-server.sh
# ============================================================

REPO_URL="https://github.com/ShawShannon24/aiNews.git"
INSTALL_DIR="/opt/aiNews"
LOG_DIR="/var/log/ai-news"
NODE_VERSION="22"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# --- 检查是否为 root ---
if [[ $EUID -ne 0 ]]; then
  error "请以 root 用户执行此脚本（sudo bash scripts/setup-server.sh）"
  exit 1
fi

info "===== AI News 服务器初始化开始 ====="

# --- 1. 系统更新 & 基础依赖 ---
info ">>> 更新系统包..."
apt-get update -qq && apt-get upgrade -y -qq

info ">>> 安装基础依赖..."
apt-get install -y -qq curl git unzip build-essential

# --- 2. 安装 Node.js ---
info ">>> 安装 Node.js ${NODE_VERSION}..."
if command -v node &>/dev/null; then
  CURRENT_NODE=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [[ "$CURRENT_NODE" -ge "$NODE_VERSION" ]]; then
    info "Node.js $(node --version) 已安装，跳过"
  else
    warn "Node.js $(node --version) 版本过低，升级中..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
    apt-get install -y -qq nodejs
  fi
else
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y -qq nodejs
fi

info "Node.js $(node --version) | npm $(npm --version)"

# --- 3. 克隆项目 ---
info ">>> 克隆项目到 ${INSTALL_DIR}..."
if [[ -d "$INSTALL_DIR" ]]; then
  warn "目录 ${INSTALL_DIR} 已存在，拉取最新代码..."
  cd "$INSTALL_DIR" && git pull
else
  git clone "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# --- 4. 安装 npm 依赖 ---
info ">>> 安装 npm 依赖..."
npm install --production

# --- 5. 创建日志目录 ---
info ">>> 创建日志目录 ${LOG_DIR}..."
mkdir -p "$LOG_DIR"
chmod 755 "$LOG_DIR"

# --- 6. 提示配置环境变量 ---
if [[ ! -f "/etc/ai-news.env" ]]; then
  info ">>> 创建环境变量配置文件 /etc/ai-news.env..."
  cat > /etc/ai-news.env << 'EOF'
# AI News 环境变量配置
# 编辑此文件后需重启服务：systemctl restart ai-news

# 飞书 Webhook（必填，如需飞书推送）
# AINEWS_FEISHU_WEBHOOK_URL=https://open.feishu.cn/open-apis/bot/v2/hook/xxx

# 小红书配置（可选）
# AINEWS_XHS_ENABLED=true
# AINEWS_XHS_MAX_ARTICLES=5
EOF
  chmod 600 /etc/ai-news.env
  info "请编辑 /etc/ai-news.env 填入飞书 Webhook URL："
  echo "  sudo vi /etc/ai-news.env"
else
  info "/etc/ai-news.env 已存在，跳过"
fi

# --- 7. 配置 systemd timer ---
info ">>> 配置 systemd timer..."
cp "$INSTALL_DIR/deploy/ai-news.service" /etc/systemd/system/
cp "$INSTALL_DIR/deploy/ai-news.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable ai-news.timer
systemctl start ai-news.timer

# --- 8. 配置 logrotate ---
info ">>> 配置日志轮转..."
cp "$INSTALL_DIR/deploy/logrotate.conf" /etc/logrotate.d/ai-news

# --- 9. 验证 ---
info ">>> 验证安装..."
systemctl status ai-news.timer --no-pager || true
echo ""
info "Timer 状态："
systemctl list-timers ai-news.timer --no-pager || true

echo ""
info "===== 初始化完成！====="
echo ""
echo "下一步操作："
echo "  1. 编辑环境变量：  sudo vi /etc/ai-news.env"
echo "  2. 手动运行测试：  sudo /opt/ai-news/run-daily.sh"
echo "  3. 查看运行日志：  sudo journalctl -u ai-news.service -f"
echo "  4. 查看 timer：    systemctl list-timers ai-news.timer"
echo ""
