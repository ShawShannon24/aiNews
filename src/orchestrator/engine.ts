/**
 * 编排引擎 — 核心模块
 *
 * 编排完整的追踪流程：解析意图 → 匹配信源 → 抓取 → 过滤 → 生成 → 推送
 *
 * 两种运行模式：
 * 1. 作为模块被 bot/router.ts 调用（handleUserMessage）
 * 2. 作为 CLI 独立运行（tsx src/orchestrator/engine.ts --mode hotspot --topic "xxx"）
 */
import { fetchAllFeeds } from '../fetcher.js'
import { parseFeed, filterRecent, dedupe, countSourceOverlap } from '../parser.js'
import { filterAIArticles } from '../filter.js'
import { sortByHotness } from '../scorer.js'
import { generateSummary } from '../summarizer.js'
import { loadConfig } from '../config.js'
import { matchSources } from './sourceMatcher.js'
import { filterByTopic } from './topicFilter.js'
import { buildTimeline } from './timelineBuilder.js'
import { parseIntent, Intent } from './intentParser.js'
import {
  createSubscription,
  cancelSubscriptionByTopic,
  findSubscriptionByTopic,
  listActiveSubscriptions,
  getSubscription,
  updateLastRun,
  recordPush,
} from './db.js'

export interface EngineResult {
  /** 成功还是部分失败 */
  success: boolean
  /** 要推送给用户的文本 */
  output: string
  /** 找到的文章数 */
  articleCount: number
}

// ---- 核心编排 ----

/**
 * 处理用户消息，返回结果。
 * 由 bot/router.ts 在后台调用。
 */
export async function handleUserMessage(text: string): Promise<EngineResult> {
  // 1. 解析意图
  const intent = await parseIntent(text)

  // 2. 根据意图执行
  switch (intent.mode) {
    case 'subscribe':
      return handleSubscribe(intent)
    case 'hotspot':
      return handleHotspot(intent)
    case 'view':
      return handleView()
    case 'cancel':
      return handleCancel(intent)
    default:
      return {
        success: false,
        output: '🤔 没完全理解，能说得具体一点吗？\n你可以这样问我：\n- "订阅 人形机器人"（长期追踪某个话题）\n- "帮我看看 OpenAI 最近的消息"（立即查一次）\n- "查看"（看当前订阅了哪些）',
        articleCount: 0,
      }
  }
}

// ---- 订阅模式 ----

async function handleSubscribe(intent: Intent): Promise<EngineResult> {
  if (!intent.topic) {
    return {
      success: false,
      output: '请告诉我你想订阅什么话题，例如「订阅 人形机器人」',
      articleCount: 0,
    }
  }

  // 检查是否已订阅
  const existing = findSubscriptionByTopic(intent.topic)
  if (existing) {
    return {
      success: true,
      output: `「${intent.topic}」已经在追踪中了，无需重复订阅 😄`,
      articleCount: 0,
    }
  }

  // 匹配信源
  const sources = matchSources(intent.category)

  // 保存订阅
  const sub = createSubscription({
    topic: intent.topic,
    category: intent.category,
    mode: 'subscribe',
    needSummary: intent.needSummary,
    sources: JSON.stringify(sources.map((s) => s.name)),
    cronSchedule: '0 8 * * *', // 默认每天 08:00
    isActive: true,
  })

  const sourceNames = sources.map((s) => s.name).join('、')

  return {
    success: true,
    output: `✅ 已开始追踪「${intent.topic}」

📌 模式：长期订阅
📡 信源：${sourceNames}
⏰ 推送时间：每天 08:00（可调整）

你可以说：
- 「查看」查看所有订阅
- 「取消 ${intent.topic}」取消追踪`,
    articleCount: 0,
  }
}

// ---- 热点追踪模式 ----

async function handleHotspot(intent: Intent): Promise<EngineResult> {
  if (!intent.topic) {
    return {
      success: false,
      output: '请告诉我你想搜索什么，例如「看看 OpenAI 最近的消息」',
      articleCount: 0,
    }
  }

  // 匹配信源
  const sources = matchSources(intent.category)
  if (sources.length === 0) {
    return {
      success: false,
      output: '⚠️ 没有可用的信源，请稍后再试',
      articleCount: 0,
    }
  }

  // 抓取 RSS
  console.log(`[引擎] 热点追踪「${intent.topic}」，${sources.length} 个信源`)
  const results = await fetchAllFeeds(sources)

  // 解析
  const allArticles = results.flatMap((r) =>
    r.xml ? parseFeed(r.xml, r.name) : [],
  )

  // 过滤最近 48 小时
  const recent = filterRecent(allArticles, 48)

  // 去重
  const deduped = dedupe(recent)

  // AI 关键词过滤
  const aiRelated = filterAIArticles(deduped)

  // 主题二次过滤
  const matched = filterByTopic(aiRelated, intent.topic)

  if (matched.length === 0) {
    return {
      success: true,
      output: `当前没有关于「${intent.topic}」的新内容 😅

共检索 ${allArticles.length} 篇，最近 48h ${recent.length} 篇，无相关匹配。`,
      articleCount: 0,
    }
  }

  // 热度排序
  const sourceCounts = countSourceOverlap(matched)
  const sorted = sortByHotness(matched)
  for (const a of sorted) {
    a.sourceCount = sourceCounts.get(a.title.toLowerCase().trim()) ?? 1
  }

  // 生成时间线/总结
  const timeline = await buildTimeline(sorted, intent.topic)

  // 尝试生成每日总结风格的小结（复用现有模板）
  const config = loadConfig()
  let summaryNote = ''
  if (config?.deepseek?.apiKey && sorted.length >= 3 && intent.needSummary) {
    // LLM 已经在 buildTimeline 中调用
    // 这里不再重复调用
  } else if (intent.needSummary) {
    // 使用模板总结
    summaryNote = generateSummary(sorted)
  }

  const output = [
    `🔍 关于「${intent.topic}」的搜索结果`,
    `共 ${matched.length} 篇相关文章`,
    '',
    summaryNote ? `📌 ${summaryNote}\n` : '',
    timeline,
    '',
    `— AI News · 话题追踪`,
  ].filter(Boolean).join('\n')

  return {
    success: true,
    output,
    articleCount: matched.length,
  }
}

// ---- 查看订阅 ----

async function handleView(): Promise<EngineResult> {
  const subs = listActiveSubscriptions()

  if (subs.length === 0) {
    return {
      success: true,
      output: '📋 当前没有活跃订阅\n你可以说「订阅 话题名」开始追踪',
      articleCount: 0,
    }
  }

  const lines: string[] = ['📋 当前订阅']
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i]
    const tag = s.isDefault ? '（默认）' : ''
    const lastRun = s.lastRunAt
      ? `· 上次推送 ${new Date(s.lastRunAt).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}`
      : '· 尚未推送'
    lines.push(`${i + 1}. ${s.topic}${tag}`)
    lines.push(`   ${s.cronSchedule} ${lastRun}`)
  }

  return {
    success: true,
    output: lines.join('\n'),
    articleCount: 0,
  }
}

// ---- 取消订阅 ----

async function handleCancel(intent: Intent): Promise<EngineResult> {
  if (!intent.topic) {
    return {
      success: false,
      output: '请告诉我你想取消什么，例如「取消 人形机器人」',
      articleCount: 0,
    }
  }

  const cancelled = cancelSubscriptionByTopic(intent.topic)
  if (cancelled) {
    return {
      success: true,
      output: `✅ 已取消追踪「${intent.topic}」`,
      articleCount: 0,
    }
  }

  return {
    success: true,
    output: `没有找到「${intent.topic}」的活跃订阅`,
    articleCount: 0,
  }
}

// ---- 订阅执行（定时任务用） ----

/**
 * 执行单个订阅的追踪任务（由 node-cron 定时调用）。
 * 与 handleHotspot 流程类似，但使用订阅的配置。
 */
export async function executeSubscription(subscriptionId: string): Promise<EngineResult> {
  const sub = getSubscription(subscriptionId)
  if (!sub || !sub.isActive) {
    return { success: false, output: '订阅不存在或已取消', articleCount: 0 }
  }

  // 解析 sources
  let sourceNames: string[]
  try {
    sourceNames = JSON.parse(sub.sources) as string[]
  } catch {
    sourceNames = []
  }

  // 匹配信源
  const config = loadConfig()
  const sources = matchSources(sub.category)

  // 抓取
  const results = await fetchAllFeeds(sources)
  const allArticles = results.flatMap((r) =>
    r.xml ? parseFeed(r.xml, r.name) : [],
  )

  // 过滤 → 去重 → AI 过滤
  const recent = filterRecent(allArticles, 48)
  const deduped = dedupe(recent)
  const aiRelated = filterAIArticles(deduped)

  // 主题过滤（非默认订阅才做二次过滤）
  const matched = sub.isDefault
    ? aiRelated
    : filterByTopic(aiRelated, sub.topic)

  if (matched.length === 0) {
    updateLastRun(sub.id)
    recordPush(sub.id, 0, null)
    return { success: true, output: `「${sub.topic}」暂无新内容`, articleCount: 0 }
  }

  // 热度排序
  const sourceCounts = countSourceOverlap(matched)
  const sorted = sortByHotness(matched)
  for (const a of sorted) {
    a.sourceCount = sourceCounts.get(a.title.toLowerCase().trim()) ?? 1
  }

  // 生成
  const timeline = await buildTimeline(sorted, sub.topic)
  const summaryNote = generateSummary(sorted)

  const output = [
    `📌 每日追踪 · ${sub.topic} · ${new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}`,
    '',
    summaryNote ? `📌 ${summaryNote}\n` : '',
    timeline,
    '',
    `— AI News · 话题追踪`,
  ].filter(Boolean).join('\n')

  // 记录
  updateLastRun(sub.id)
  recordPush(sub.id, matched.length, summaryNote)

  return { success: true, output, articleCount: matched.length }
}

// ---- CLI 入口 ----

/**
 * CLI 入口（用于独立测试）。
 *
 * 用法：
 *   tsx src/orchestrator/engine.ts --mode hotspot --topic "人形机器人"
 *   tsx src/orchestrator/engine.ts --mode subscribe --topic "OpenAI"
 */
async function main() {
  const args = process.argv.slice(2)
  const modeIndex = args.indexOf('--mode')
  const topicIndex = args.indexOf('--topic')

  const mode = modeIndex >= 0 ? args[modeIndex + 1] || 'hotspot' : 'hotspot'
  const topic = topicIndex >= 0 ? args[topicIndex + 1] || '' : ''

  if (!topic && mode !== 'view') {
    console.error('用法: tsx src/orchestrator/engine.ts --mode hotspot|subscribe|view|cancel --topic "关键词"')
    console.error('  --mode  hotspot   = 立即执行一次热点追踪')
    console.error('  --mode  subscribe = 保存为定时订阅')
    console.error('  --mode  view      = 查看当前订阅（无需 --topic）')
    console.error('  --mode  cancel    = 取消订阅')
    process.exit(1)
  }

  const result = await handleUserMessage(
    mode === 'subscribe'
      ? `订阅 ${topic}`
      : mode === 'hotspot'
        ? `看看 ${topic}`
        : mode === 'view'
          ? '查看'
          : `取消 ${topic}`,
  )

  console.log('\n' + result.output)
  process.exit(result.success ? 0 : 1)
}

// 允许作为模块导入或 CLI 执行
const isCLI = process.argv[1]?.includes('engine.ts')
if (isCLI) {
  main().catch((err) => {
    console.error('[引擎错误]', err)
    process.exit(1)
  })
}
