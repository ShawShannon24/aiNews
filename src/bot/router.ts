/**
 * 飞书事件路由模块
 *
 * 事件类型：
 * 1. url_verification（challenge）→ 返回 challenge 值
 * 2. im.message.receive_v1（用户消息）→ 解析消息，异步处理
 * 3. 其他事件 → 忽略（200 OK）
 */
import { Router, Request, Response } from 'express'
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
 * @param onMessage   收到用户消息时的回调（异步，返回后后台处理）
 * @param verifyToken 应用的 Verification Token（用于校验请求来源）
 * @returns Express Router
 */
export function createRouter(
  onMessage: (text: string, event: FeishuEvent) => void,
  verifyToken?: string,
): Router {
  const router = Router()

  // ---- 健康检查 ----
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() })
  })

  // ---- 飞书事件回调 ----
  router.post('/webhook/event', (req: Request, res: Response) => {
    const event = req.body as FeishuEvent

    // 同时兼容 v1 / v2 事件格式：
    // - v1：顶层 { type: 'event_callback', token, event: { type, ... } }
    // - v2：顶层 { schema: '2.0', header: { event_type, token }, event: {...} }
    const header = (event as unknown as { header?: { event_type?: string; token?: string } }).header
    // 顶层 type 可能是 'event_callback' / 'url_verification'（v1），也可能是 v2 的事件名
    const topType = event.type ?? header?.event_type
    // 具体事件类型：v1 在 event.event.type，v2 在 header.event_type
    const subType = event.event?.type ?? header?.event_type
    const token = event.token ?? header?.token

    // 先处理 url_verification（飞书配置 webhook 时的握手请求）。
    // 注意：此请求【不带】X-Lark-Signature 签名头，只是明文 challenge 验证，
    // 因此必须在签名验证之前返回，否则飞书会报「Challenge code 没有返回」。
    if (topType === 'url_verification') {
      if (event.challenge) {
        res.json({ challenge: event.challenge })
        return
      }
      res.status(400).json({ error: 'missing challenge' })
      return
    }

    // 校验请求来源（未配置 Encrypt Key 时用 Verify Token 明文比对）：
    // 将请求体中的 token 字段（v1 顶层 / v2 header.token）与配置的 verifyToken 比对。
    // 注：飞书签名校验（X-Lark-Signature）仅用于已配置 Encrypt Key 的加密模式，
    // 当前未配置加密，故用 token 比对。
    if (verifyToken && token && token !== verifyToken) {
      console.warn('[飞书] Verify Token 校验失败，拒绝请求')
      res.status(403).json({ error: 'invalid verify token' })
      return
    }

    // 其他事件先返回 200（飞书要求尽快响应）
    res.status(200).json({ code: 0 })

    // 处理用户消息事件（v1: event.event.type，v2: header.event_type 都是 im.message.receive_v1）
    if (subType === 'im.message.receive_v1' && event.event?.message) {
      const msg = event.event.message
      // 兼容 v1（message.body.content 为对象字符串）和 v2（message.content 为 JSON 字符串）
      const rawContent = (msg as unknown as { body?: { content?: string } }).body?.content ?? (msg as unknown as { content?: string }).content
      let text = ''
      if (rawContent) {
        try {
          const content = JSON.parse(rawContent) as { text?: string }
          text = content.text || ''
        } catch {
          text = rawContent
        }
      }

      // 去掉 @bot 前缀（群内 @ 消息会有 "@xxx " 前缀）
      const cleanText = text.replace(/@_?\S+\s?/g, '').trim()

      // v1/v2 的 sender 结构可能不同，防御性取值
      const openId =
        msg.sender?.sender_id?.open_id ??
        (event.event as unknown as { sender?: { sender_id?: { open_id?: string } } }).sender?.sender_id?.open_id ??
        '(unknown)'

      if (cleanText) {
        console.log(`[飞书] 收到消息: "${cleanText}" (from ${openId})`)
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
