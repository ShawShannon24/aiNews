/**
 * 飞书事件路由测试
 *
 * 挂载 createRouter 到临时 Express 服务，用 HTTP 请求验证：
 * - 健康检查
 * - url_verification challenge
 * - 用户消息事件分发（含 @ 前缀清理）
 *
 * 不触发真实飞书 API（onMessage 回调注入）。
 */
import { describe, it, before, after } from 'node:test'
import { strictEqual, ok } from 'node:assert'
import express from 'express'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRouter } from './router.js'

describe('飞书事件路由', () => {
  let server: ReturnType<typeof createServer>
  let baseUrl: string
  let received: { text: string; event: unknown }[]

  before(async () => {
    received = []
    const app = express()
    app.use(express.json({
      verify: (_req, _res, buf) => {
        ;(_req as unknown as Record<string, unknown>).rawBody = buf.toString()
      },
    }))
    app.use(createRouter((text, event) => {
      received.push({ text, event })
    }, 'test-verify-token'))
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const addr = server.address() as AddressInfo
    baseUrl = `http://localhost:${addr.port}`
  })

  after(() => {
    server.close()
  })

  it('GET /health 返回 ok', async () => {
    const res = await fetch(`${baseUrl}/health`)
    strictEqual(res.status, 200)
    const body = await res.json() as { status: string }
    strictEqual(body.status, 'ok')
  })

  it('url_verification 返回 challenge', async () => {
    const res = await fetch(`${baseUrl}/webhook/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'challenge-123' }),
    })
    strictEqual(res.status, 200)
    const body = await res.json() as { challenge: string }
    strictEqual(body.challenge, 'challenge-123')
  })

  it('事件回调分发消息并清理 @ 前缀', async () => {
    const eventBody = {
      type: 'event_callback',
      event: {
        type: 'im.message.receive_v1',
        message: {
          message_id: 'om_test_1',
          chat_id: 'oc_test_chat_1',
          body: { content: JSON.stringify({ text: '@bot 订阅 人形机器人' }) },
          sender: { sender_id: { open_id: 'ou_test_1' } },
        },
      },
    }
    const res = await fetch(`${baseUrl}/webhook/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    strictEqual(res.status, 200)
    // onMessage 同步调用，此处断言回调已收到
    strictEqual(received.length, 1)
    strictEqual(received[0].text, '订阅 人形机器人')
    ok(received[0].event, '应透传原始事件')
  })

  it('v2 格式事件也能分发（header.event_type + token 校验）', async () => {
    const eventBody = {
      schema: '2.0',
      header: {
        event_id: 'evt_test_1',
        event_type: 'im.message.receive_v1',
        create_time: '2026-08-18T12:00:00+08:00',
        token: 'test-verify-token',
        app_id: 'cli_test',
      },
      event: {
        sender: { sender_id: { open_id: 'ou_v2_user' } },
        message: {
          message_id: 'om_v2_1',
          root_id: '',
          parent_id: '',
          chat_id: 'oc_v2_chat',
          chat_type: 'p2p',
          message_type: 'text',
          create_time: '2026-08-18T12:00:00+08:00',
          // v2 格式：content 是 JSON 字符串（直接挂在 message 上，不是 body.content）
          content: JSON.stringify({ text: '查看' }),
        },
      },
    }
    const res = await fetch(`${baseUrl}/webhook/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    strictEqual(res.status, 200)
    strictEqual(received.length, 2)
    strictEqual(received[1].text, '查看')
  })

  it('Verify Token 不匹配 → 拒绝（403）', async () => {
    const eventBody = {
      type: 'event_callback',
      token: 'wrong-token',
      event: {
        type: 'im.message.receive_v1',
        message: {
          message_id: 'om_wrong_1',
          chat_id: 'oc_wrong_1',
          body: { content: JSON.stringify({ text: '查看' }) },
          sender: { sender_id: { open_id: 'ou_wrong_1' } },
        },
      },
    }
    const res = await fetch(`${baseUrl}/webhook/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    })
    strictEqual(res.status, 403)
    strictEqual(received.length, 2, '不匹配的请求不应分发')
  })
})
