/**
 * SQLite 数据库模块测试
 *
 * 使用临时数据库文件测试，避免影响生产数据。
 */
import { describe, it, before, after } from 'node:test'
import { strictEqual, ok, notStrictEqual } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// 设置临时数据库路径
const tmpDir = mkdtempSync(join(tmpdir(), 'ainews-test-'))
const originalDbPath = process.env.DB_PATH
process.env.DB_PATH = join(tmpDir, 'test.db')

// 延迟导入（先设置环境变量）
import {
  createSubscription,
  getSubscription,
  listActiveSubscriptions,
  cancelSubscription,
  cancelSubscriptionByTopic,
  findSubscriptionByTopic,
  initDefaultSubscriptions,
  recordPush,
  getPushHistory,
  updateLastRun,
} from './db.js'

describe('数据库 CRUD', () => {
  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    if (originalDbPath) process.env.DB_PATH = originalDbPath
  })

  it('创建订阅并查询', () => {
    const sub = createSubscription({
      topic: '人形机器人',
      category: '科技',
      mode: 'subscribe',
      needSummary: true,
      sources: '["量子位","TechCrunch"]',
      cronSchedule: '0 8 * * *',
      isActive: true,
    })

    ok(sub.id, '应有 id')
    strictEqual(sub.topic, '人形机器人')
    strictEqual(sub.category, '科技')
    strictEqual(sub.mode, 'subscribe')
    strictEqual(sub.isDefault, false)
    strictEqual(sub.isActive, true)

    // 重新查询
    const found = getSubscription(sub.id)
    notStrictEqual(found, null)
    strictEqual(found!.topic, '人形机器人')
  })

  it('按 topic 查询订阅', () => {
    const found = findSubscriptionByTopic('人形机器人')
    notStrictEqual(found, null)
    strictEqual(found!.topic, '人形机器人')
  })

  it('列表包含新创建的订阅', () => {
    const subs = listActiveSubscriptions()
    const found = subs.find((s) => s.topic === '人形机器人')
    notStrictEqual(found, undefined)
  })

  it('取消订阅（软删除）', () => {
    const sub = createSubscription({
      topic: '临时话题',
      category: '科技',
      mode: 'subscribe',
      needSummary: false,
      sources: '["全部"]',
      cronSchedule: '0 6 * * *',
      isActive: true,
    })

    const result = cancelSubscription(sub.id)
    strictEqual(result, true)

    // 不应在活跃列表中
    const subs = listActiveSubscriptions()
    const found = subs.find((s) => s.id === sub.id)
    strictEqual(found, undefined)
  })

  it('按 topic 取消', () => {
    createSubscription({
      topic: '测试取消',
      category: '科技',
      mode: 'subscribe',
      needSummary: false,
      sources: '["全部"]',
      cronSchedule: '0 8 * * *',
      isActive: true,
    })

    const result = cancelSubscriptionByTopic('测试取消')
    strictEqual(result, true)

    const found = findSubscriptionByTopic('测试取消')
    strictEqual(found, null)
  })

  it('不存在的取消返回 false', () => {
    const result = cancelSubscriptionByTopic('不存在的主题')
    strictEqual(result, false)
  })
})

describe('推送历史', () => {
  let subId: string

  before(() => {
    const sub = createSubscription({
      topic: '推送测试',
      category: '科技',
      mode: 'subscribe',
      needSummary: true,
      sources: '["全部"]',
      cronSchedule: '0 8 * * *',
      isActive: true,
    })
    subId = sub.id
  })

  it('记录推送历史', () => {
    recordPush(subId, 5, '今日有 5 篇相关文章')
    const history = getPushHistory(subId)
    strictEqual(history.length, 1)
    strictEqual(history[0].articlesCount, 5)
    strictEqual(history[0].summary, '今日有 5 篇相关文章')
  })

  it('更新最后执行时间', () => {
    updateLastRun(subId)
    const sub = getSubscription(subId)
    notStrictEqual(sub, null)
    ok(sub!.lastRunAt, 'lastRunAt 不应为空')
  })
})

describe('默认订阅初始化', () => {
  it('初始化默认订阅', () => {
    initDefaultSubscriptions()
    const subs = listActiveSubscriptions()
    const defaultSub = subs.find((s) => s.isDefault)
    notStrictEqual(defaultSub, undefined)
    strictEqual(defaultSub!.topic, 'AI 新闻')
    strictEqual(defaultSub!.cronSchedule, '0 8 * * *')
  })

  it('重复初始化不重复创建', () => {
    initDefaultSubscriptions()
    const subs = listActiveSubscriptions()
    const defaultSubs = subs.filter((s) => s.isDefault && s.topic === 'AI 新闻')
    strictEqual(defaultSubs.length, 1, '默认订阅应只有一条')
  })
})
