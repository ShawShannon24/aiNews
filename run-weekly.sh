#!/bin/bash
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")" || exit 1
npx tsx src/index.ts --translate --feishu >> /tmp/ai-news-cron.log 2>&1
