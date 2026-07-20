/**
 * AI News — 飞书 Bot 常驻服务入口
 *
 * 启动 Express 服务器，注册飞书事件回调路由，
 * 初始化 SQLite 数据库和默认订阅。
 */
import express from 'express'
import { createRouter, getChatId, getMessageId, BotConfig, FeishuEvent } from './router.js'
import { replyMessage } from './message.js'
import { loadConfig } from '../config.js'

const PORT = parseInt(process.env.PORT || '3000', 10)

async function main() {
  const config = loadConfig()

  // ---- 检查配置 ----
  if (!config?.bot?.appId || !config?.bot?.appSecret) {
    console.error('[错误] 飞书 Bot 配置缺失: 请设置 AINEWS_FEISHU_BOT_APP_ID 和 AINEWS_FEISHU_BOT_APP_SECRET')
    process.exit(1)
  }

  const botConfig: BotConfig = {
    appId: config.bot.appId,
    appSecret: config.bot.appSecret,
    verifyToken: config.bot.verifyToken,
  }

  // ---- 消息处理回调 ----
  function handleMessage(text: string, event: FeishuEvent) {
    // Step 2: 简单回复（验证 Bot 可正常收发）
    // Step 4: 接入编排引擎处理完整对话
    const messageId = getMessageId(event)
    if (!messageId) return

    // 异步回复，不阻塞请求
    replyMessage(messageId, `收到你发的消息了 👋\n你说的是: "${text}"`, botConfig).catch((err) => {
      console.error('[飞书] 回复失败:', err)
    })
  }

  // ---- Express ----
  const app = express()

  // 使用 raw body 用于签名验证
  app.use(express.json({
    verify: (_req, _res, buf) => {
      ;(_req as unknown as Record<string, unknown>).rawBody = buf.toString()
    },
  }))

  app.use(createRouter(handleMessage))

  const server = app.listen(PORT, () => {
    console.log(`🤖 AI News Bot 服务已启动: http://0.0.0.0:${PORT}`)
    console.log(`   健康检查: http://localhost:${PORT}/health`)
    console.log(`   事件回调: POST /webhook/event`)
  })

  // ---- 优雅退出 ----
  const shutdown = () => {
    console.log('\n[Bot] 正在关闭服务...')
    server.close(() => {
      console.log('[Bot] 服务已关闭')
      process.exit(0)
    })
    // 5s 超时强制退出
    setTimeout(() => {
      console.error('[Bot] 强制退出')
      process.exit(1)
    }, 5000)
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

main().catch((err) => {
  console.error('[错误] Bot 启动失败:', err)
  process.exit(1)
})
