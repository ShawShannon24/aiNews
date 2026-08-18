/**
 * 飞书事件路由模块
 *
 * 事件类型：
 * 1. url_verification（challenge）→ 返回 challenge 值
 * 2. im.message.receive_v1（用户消息）→ 解析消息，异步处理
 * 3. 其他事件 → 忽略（200 OK）
 */
import { Router, Request, Response } from 'express'
import { verifySignature } from './auth.js'
import { replyMessage } from './message.js'

export interface BotConfig {
  appId: string
  appSecret: string
  verifyToken?: string
}

export interface FeishuEvent {
  challenge?: string
  token?: string
  type?: string
  encrypt?: string
  event?: {
    type: string
    app_id: string
    chat_type: string
    message: {
      message_id: string
      root_id: string
      parent_id: string
      chat_id: string
      sender: {
        sender_id: {
          open_id: string
          union_id: string
          user_id: string
        }
      }
      body: {
        content: string // JSON string
      }
      msg_type: string
      create_time: string
    }
  }
}

/**
 * 创建飞书事件路由器。
 *
 * @param onMessage  收到用户消息时的回调（异步，返回后后台处理）
 * @returns Express Router
 */
export function createRouter(onMessage: (text: string, event: FeishuEvent) => void): Router {
  const router = Router()

  // ---- 健康检查 ----
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // ---- 飞书事件回调 ----
  router.post('/webhook/event', (req: Request, res: Response) => {
    const bodyStr = JSON.stringify(req.body)
    const event = req.body as FeishuEvent

    // 先处理 url_verification（飞书配置 webhook 时的握手请求）。
    // 注意：此请求【不带】X-Lark-Signature 签名头，只是明文 challenge 验证，
    // 因此必须在签名验证之前返回，否则飞书会报「Challenge code 没有返回」。
    if (event.type === 'url_verification') {
      if (event.challenge) {
        res.json({ challenge: event.challenge })
        return
      }
      res.status(400).json({ error: 'missing challenge' })
      return
    }

    // 签名验证（只针对真实事件推送，如果配置了 verifyToken）
    if (event.token) {
      const signature = req.headers['x-lark-signature'] as string | undefined
      if (!signature || !verifySignature(bodyStr, signature, event.token)) {
        console.warn('[飞书] 签名验证失败，拒绝请求')
        res.status(403).json({ error: 'invalid signature' })
        return
      }
    }

    // 其他事件先返回 200（飞书要求尽快响应）
    res.status(200).json({ code: 0 })

    // 处理用户消息事件
    if (event.type === 'event_callback' && event.event?.type === 'im.message.receive_v1') {
      const msg = event.event.message
      const content: { text?: string } = JSON.parse(msg.body.content || '{}')
      const text = content.text || ''

      // 去掉 @bot 前缀（群内 @ 消息会有 "@xxx " 前缀）
      const cleanText = text.replace(/@_?\S+\s?/g, '').trim()

      if (cleanText) {
        console.log(`[飞书] 收到消息: "${cleanText}" (from ${msg.sender.sender_id.open_id})`)
        onMessage(cleanText, event)
      }
    }
  })

  return router
}

/**
 * 从事件中提取群聊 ID。
 */
export function getChatId(event: FeishuEvent): string | null {
  return event.event?.message?.chat_id || null
}

/**
 * 从事件中提取发送者 open_id。
 */
export function getSenderOpenId(event: FeishuEvent): string | null {
  return event.event?.message?.sender?.sender_id?.open_id || null
}

/**
 * 从事件中提取消息 ID。
 */
export function getMessageId(event: FeishuEvent): string | null {
  return event.event?.message?.message_id || null
}
