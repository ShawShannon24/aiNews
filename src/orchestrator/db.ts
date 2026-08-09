/**
 * SQLite 数据库模块
 *
 * 订阅数据持久化 + 推送历史。
 * 使用 better-sqlite3（同步 API，简单可靠）。
 */
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface Subscription {
  id: string
  topic: string
  category: string
  mode: 'subscribe' | 'hotspot'
  needSummary: boolean
  sources: string                      // JSON 数组字符串
  cronSchedule: string                 // crontab 格式, 如 "0 8 * * *"
  /** 定时推送的目标会话（群/单聊 chat_id），无则不在 Bot 侧推送 */
  chatId: string | null
  isDefault: boolean
  createdAt: string                    // ISO 8601
  lastRunAt: string | null
  isActive: boolean
}

export interface PushHistory {
  id: number
  subscriptionId: string
  pushedAt: string
  articlesCount: number
  summary: string | null
}

// ---- 数据库初始化 ----

let db: Database.Database | null = null

function getDbPath(): string {
  return process.env.DB_PATH || './data/ainews.db'
}

function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath()
    // 自动创建父目录
    mkdirSync(dirname(dbPath), { recursive: true })
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initTables()
  }
  return db
}

function initTables(): void {
  const d = getDb()

  d.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id            TEXT PRIMARY KEY,
      topic         TEXT NOT NULL,
      category      TEXT NOT NULL DEFAULT '科技',
      mode          TEXT NOT NULL DEFAULT 'subscribe',
      need_summary  INTEGER NOT NULL DEFAULT 1,
      sources       TEXT NOT NULL,
      cron_schedule TEXT NOT NULL DEFAULT '0 8 * * *',
      chat_id       TEXT,
      is_default    INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL,
      last_run_at   TEXT,
      is_active     INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS push_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subscription_id TEXT NOT NULL,
      pushed_at       TEXT NOT NULL,
      articles_count  INTEGER NOT NULL DEFAULT 0,
      summary         TEXT,
      FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
    );

    CREATE INDEX IF NOT EXISTS idx_push_history_sub_id ON push_history(subscription_id);
  `)

  migrate()
}

/**
 * 存量库迁移：早期版本的 subscriptions 表没有 chat_id 列，
 * 检测到缺列时自动补上（ALTER TABLE ADD COLUMN）。
 */
function migrate(): void {
  const d = getDb()
  const columns = d.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[]
  if (!columns.some((c) => c.name === 'chat_id')) {
    d.exec('ALTER TABLE subscriptions ADD COLUMN chat_id TEXT')
    console.log('[DB] 迁移完成: subscriptions 表新增 chat_id 列')
  }
}

// ---- 默认订阅 ----

const DEFAULT_SUBSCRIPTIONS: Omit<Subscription, 'id' | 'createdAt' | 'lastRunAt'>[] = [
  {
    topic: 'AI 新闻',
    category: '科技',
    mode: 'subscribe',
    needSummary: true,
    sources: '["全部"]',
    cronSchedule: '0 8 * * *',
    chatId: null,
    isDefault: true,
    isActive: true,
  },
]

/**
 * 初始化默认订阅（启动时调用）。
 * 如果默认订阅不存在则自动创建。
 */
export function initDefaultSubscriptions(): void {
  const d = getDb()

  for (const sub of DEFAULT_SUBSCRIPTIONS) {
    const existing = d
      .prepare('SELECT id FROM subscriptions WHERE is_default = 1 AND topic = ?')
      .get(sub.topic) as { id: string } | undefined

    if (!existing) {
      const now = new Date().toISOString()
      d.prepare(`
        INSERT INTO subscriptions (id, topic, category, mode, need_summary, sources, cron_schedule, chat_id, is_default, created_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1)
      `).run(randomUUID(), sub.topic, sub.category, sub.mode, sub.needSummary ? 1 : 0, sub.sources, sub.cronSchedule, sub.chatId, now)
      console.log(`[DB] 已创建默认订阅: "${sub.topic}"`)
    }
  }
}

// ---- 订阅 CRUD ----

/**
 * 创建订阅。
 */
export function createSubscription(
  data: Omit<Subscription, 'id' | 'createdAt' | 'lastRunAt' | 'isDefault'>,
): Subscription {
  const d = getDb()
  const id = randomUUID()
  const now = new Date().toISOString()

  d.prepare(`
    INSERT INTO subscriptions (id, topic, category, mode, need_summary, sources, cron_schedule, chat_id, is_default, created_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1)
  `).run(id, data.topic, data.category, data.mode, data.needSummary ? 1 : 0, data.sources, data.cronSchedule, data.chatId, now)

  return getSubscription(id)!
}

/**
 * 查询单个订阅。
 */
export function getSubscription(id: string): Subscription | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM subscriptions WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToSubscription(row)
}

/**
 * 查询所有活跃订阅。
 */
export function listActiveSubscriptions(): Subscription[] {
  const d = getDb()
  const rows = d.prepare('SELECT * FROM subscriptions WHERE is_active = 1 ORDER BY created_at').all() as Record<string, unknown>[]
  return rows.map(rowToSubscription)
}

/**
 * 查询指定 topic 的活跃订阅。
 */
export function findSubscriptionByTopic(topic: string): Subscription | null {
  const d = getDb()
  const row = d.prepare('SELECT * FROM subscriptions WHERE is_active = 1 AND topic = ?').get(topic) as Record<string, unknown> | undefined
  if (!row) return null
  return rowToSubscription(row)
}

/**
 * 取消订阅（软删除）。
 */
export function cancelSubscription(id: string): boolean {
  const d = getDb()
  const result = d.prepare('UPDATE subscriptions SET is_active = 0 WHERE id = ?').run(id)
  return result.changes > 0
}

/**
 * 按 topic 取消订阅。
 */
export function cancelSubscriptionByTopic(topic: string): boolean {
  const d = getDb()
  const result = d.prepare('UPDATE subscriptions SET is_active = 0 WHERE topic = ? AND is_active = 1').run(topic)
  return result.changes > 0
}

/**
 * 更新最后执行时间。
 */
export function updateLastRun(id: string): void {
  const d = getDb()
  d.prepare('UPDATE subscriptions SET last_run_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

// ---- 推送历史 ----

/**
 * 记录推送历史。
 */
export function recordPush(
  subscriptionId: string,
  articlesCount: number,
  summary: string | null,
): void {
  const d = getDb()
  d.prepare(`
    INSERT INTO push_history (subscription_id, pushed_at, articles_count, summary)
    VALUES (?, ?, ?, ?)
  `).run(subscriptionId, new Date().toISOString(), articlesCount, summary)
}

/**
 * 查询推送历史。
 */
export function getPushHistory(subscriptionId: string, limit = 10): PushHistory[] {
  const d = getDb()
  const rows = d.prepare(`
    SELECT * FROM push_history WHERE subscription_id = ? ORDER BY pushed_at DESC LIMIT ?
  `).all(subscriptionId, limit) as Record<string, unknown>[]
  return rows.map(rowToPushHistory)
}

// ---- 内部转换 ----

function rowToSubscription(row: Record<string, unknown>): Subscription {
  return {
    id: row.id as string,
    topic: row.topic as string,
    category: row.category as string,
    mode: row.mode as 'subscribe' | 'hotspot',
    needSummary: Boolean(row.need_summary),
    sources: row.sources as string,
    cronSchedule: row.cron_schedule as string,
    chatId: row.chat_id as string | null,
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at as string,
    lastRunAt: row.last_run_at as string | null,
    isActive: Boolean(row.is_active),
  }
}

function rowToPushHistory(row: Record<string, unknown>): PushHistory {
  return {
    id: row.id as number,
    subscriptionId: row.subscription_id as string,
    pushedAt: row.pushed_at as string,
    articlesCount: row.articles_count as number,
    summary: row.summary as string | null,
  }
}
