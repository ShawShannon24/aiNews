/**
 * AI News — 飞书 Bot 常驻服务入口
 *
 * 启动 Express 服务器，注册飞书事件回调路由，
 * 初始化 SQLite 数据库和默认订阅。
 */
import express from 'express'
import { createRouter, getChatId, getMessageId, BotConfig, FeishuEvent } from './router.js'
import { replyMessage } from './message.js'
import { syncSubscriptions, stopAllSubscriptions } from './scheduler.js'
import { handleUserMessage } from '../orchestrator/engine.js'
import { initDefaultSubscriptions } from '../orchestrator/db.js'
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

  // ---- 初始化默认订阅 + 订阅调度 ----
  initDefaultSubscriptions()
  syncSubscriptions(botConfig)

  // ---- 消息处理回调 ----
  async function handleMessage(text: string, event: FeishuEvent) {
    const messageId = getMessageId(event)
    const chatId = getChatId(event)
    if (!messageId) return

    try {
      // 接入编排引擎处理完整对话（订阅/热点/查看/取消）
      const result = await handleUserMessage(text, { chatId })
      await replyMessage(messageId, result.output, botConfig)
      // 订阅状态可能变化（新增/取消），同步调度器
      syncSubscriptions(botConfig)
    } catch (err) {
      console.error('[飞书] 引擎执行失败:', err)
      await replyMessage(messageId, '⚠️ 服务暂时不可用，请稍后再试', botConfig)
    }
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
    stopAllSubscriptions()
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
