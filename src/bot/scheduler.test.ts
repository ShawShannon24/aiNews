/**
 * 订阅调度器测试
 *
 * 重点验证 shouldPush 决策逻辑：
 * - 有内容 + 有会话目标 → 推送
 * - 无内容（articleCount=0）→ 不推送（避免骚扰消息）
 * - 无会话目标（chatId=null）→ 不推送
 * - 执行失败 → 不推送
 */
import { describe, it } from 'node:test'
import { equal } from 'node:assert/strict'
import { shouldPush } from './scheduler.js'

describe('shouldPush（订阅结果是否应推送）', () => {
  it('有内容 + 有会话目标 → 推送', () => {
    equal(shouldPush(true, 5, 'oc_test_1'), true)
  })

  it('无内容（articleCount=0）→ 不推送（避免「暂无新内容」骚扰）', () => {
    equal(shouldPush(true, 0, 'oc_test_1'), false)
  })

  it('无会话目标（chatId=null）→ 不推送', () => {
    equal(shouldPush(true, 5, null), false)
  })

  it('执行失败（success=false）→ 不推送', () => {
    equal(shouldPush(false, 5, 'oc_test_1'), false)
  })

  it('执行失败 + 无内容 + 无目标 → 不推送（全 false）', () => {
    equal(shouldPush(false, 0, null), false)
  })
})
