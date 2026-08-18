/**
 * 飞书消息 API 模块
 *
 * 职责：
 * - 回复消息（被动回复用户）
 * - 发送消息到群或用户（主动推送）
 *
 * 统一使用飞书 Send Message API（需要 tenant_access_token）。
 */
import { getTenantToken } from './auth.js'

interface SendMessageOptions {
  appId: string
  appSecret: string
}

// ---- 内部请求 ----

async function request(
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ code: number; msg: string; data?: Record<string, unknown> }> {
  const res = await fetch(`https://open.feishu.cn/open-apis${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json() as { code: number; msg: string; data?: Record<string, unknown> }
  if (data.code !== 0) {
    console.error(`[飞书 API] ${path} 失败: ${data.msg}`)
  }
  return data
}

// ---- 对外接口 ----

/**
 * 回复飞书消息。
 *
 * @param messageId  要回复的消息 ID
 * @param content    消息文本内容
 * @param opts       认证信息
 * @returns 是否成功
 */
export async function replyMessage(
  messageId: string,
  content: string,
  opts: SendMessageOptions,
): Promise<boolean> {
  try {
    const token = await getTenantToken(opts.appId, opts.appSecret)
    const result = await request(token, 'POST', `/im/v1/messages/${messageId}/reply`, {
      content: JSON.stringify({ text: content }),
      msg_type: 'text',
    })
    if (result.code === 0) {
      console.log(`[飞书] 回复成功 (message_id=${messageId.slice(0, 12)}…)`)
    }
    return result.code === 0
  } catch (err) {
    console.error('[飞书] 回复消息失败:', err)
    return false
  }
}

/**
 * 发送消息到指定的群或用户。
 *
 * @param receiveId   接收者 ID（open_id 或 chat_id）
 * @param idType      接收者 ID 类型: 'open_id' | 'chat_id'
 * @param content     消息文本
 * @param opts        认证信息
 * @returns 是否成功
 */
export async function sendMessage(
  receiveId: string,
  idType: 'open_id' | 'chat_id',
  content: string,
  opts: SendMessageOptions,
): Promise<boolean> {
  try {
    const token = await getTenantToken(opts.appId, opts.appSecret)
    const result = await request(token, 'POST', `/im/v1/messages?receive_id_type=${idType}`, {
      receive_id: receiveId,
      content: JSON.stringify({ text: content }),
      msg_type: 'text',
    })
    return result.code === 0
  } catch (err) {
    console.error('[飞书] 发送消息失败:', err)
    return false
  }
}

/**
 * 推送消息到群聊。
 * 需要知道群聊的 chat_id（可以从事件回调中获取）。
 *
 * @param chatId  群聊 ID（oc_xxx 格式）
 * @param content 消息文本
 * @param opts    认证信息
 * @returns 是否成功
 */
export async function pushToChat(
  chatId: string,
  content: string,
  opts: SendMessageOptions,
): Promise<boolean> {
  return sendMessage(chatId, 'chat_id', content, opts)
}
