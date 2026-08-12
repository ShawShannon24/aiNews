import { parseArgs } from 'node:util'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { FeedSource } from './types.js'
import { fetchAllFeeds } from './fetcher.js'
import { parseFeed, filterRecent, dedupe, countSourceOverlap } from './parser.js'
import { filterAIArticles } from './filter.js'
import { sortByHotness } from './scorer.js'
import { generateSummary } from './summarizer.js'
import { generateReport } from './reporter.js'
import { batchTranslate } from './translator.js'
import { loadConfig } from './config.js'
import { pushToFeishu, pushAlertToFeishu } from './publishers/feishu.js'
import { generateXHSPost } from './publishers/xiaohongshu.js'

const DEFAULT_SOURCES: FeedSource[] = [
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/category/artificial-intelligence/feed/',
  },
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml',
  },
  {
    name: 'Hacker News',
    url: 'https://hnrss.org/newest?q=AI&count=30',
  },
]

async function loadSources(): Promise<FeedSource[]> {
  try {
    const data = await readFile(
      new URL('../sources.json', import.meta.url),
      'utf-8',
    )
    const sources = JSON.parse(data) as FeedSource[]
    if (Array.isArray(sources) && sources.length > 0) return sources
  } catch {
    console.warn('[提示] sources.json 读取失败，使用默认源')
  }
  return DEFAULT_SOURCES
}

async function main() {
  const { values } = parseArgs({
    options: {
      translate: { type: 'boolean', short: 't', default: true },
      summary: { type: 'boolean', short: 's', default: true },
      'out-dir': { type: 'string', short: 'o', default: './output' },
      hours: { type: 'string', short: 'h', default: '24' },
      max: { type: 'string', short: 'm', default: '20' },
      help: { type: 'boolean', short: '?', default: false },
      feishu: { type: 'boolean', short: 'f', default: false },
      xhs: { type: 'boolean', short: 'x', default: false },
    },
    strict: true,
    allowPositionals: false,
  })

  if (values.help) {
    console.log(`用法: npx tsx src/index.ts [选项]

选项:
  -t, --translate      翻译标题和摘要为中英对照 (默认: 开启)
  -s, --summary        生成 AI 资讯速览 (默认: 开启)
  -o, --out-dir <路径>  输出目录 (默认: ./output)
  -h, --hours <小时数>   时间过滤窗口 (默认: 24)
  -m, --max <数量>      最多输出文章数 (默认: 20)
  -?, --help           显示此帮助
  -f, --feishu         推送精简版到飞书群机器人
  -x, --xhs            生成小红书发布内容
  --no-translate       关闭翻译
  --no-summary         关闭每日总结`)
    return
  }

  const doTranslate = values.translate
  const doSummary = values.summary
  const doFeishu = values.feishu
  const doXhs = values.xhs
  const outDir = resolve(values['out-dir'])
  const hours = parseInt(values.hours, 10) || 24
  const maxArticles = parseInt(values.max, 10) || 20

  const SOURCES = await loadSources()

  console.log('🤖 正在抓取 AI 新闻…')
  console.log(`   源: ${SOURCES.map((s) => s.name).join('、')}\n`)

  // 1. 并发抓取
  const results = await fetchAllFeeds(SOURCES)

  // 2. 解析
  const allArticles = results.flatMap((r) =>
    r.xml ? parseFeed(r.xml, r.name) : [],
  )

  // 3. 过滤 + 去重 + 跨源统计 + AI 过滤 + 热度排序
  const recent = filterRecent(allArticles, hours)

  // 3a. 去重前统计跨源重叠
  const sourceCounts = countSourceOverlap(recent)

  // 3b. 去重
  const deduped = dedupe(recent)

  // 3c. 附加跨源计数
  for (const a of deduped) {
    a.sourceCount = sourceCounts.get(a.title.toLowerCase().trim()) ?? 1
  }

  // 3d. 垂直化过滤：只保留 AI/科技相关内容
  const filtered = filterAIArticles(deduped)

  // 3e. 综合热度排序（替代纯时间排序）
  const sorted = sortByHotness(filtered)

  // 4. 按语言分组：中文 10 篇 + 外文 10 篇，先中后英（用热度排序后的结果）
  const sourceLang = new Map(SOURCES.map((s) => [s.name, s.lang ?? 'en']))
  const zhArticles = sorted.filter((a) => sourceLang.get(a.source) === 'zh')
  const enArticles = sorted.filter((a) => sourceLang.get(a.source) !== 'zh')
  const top = [...zhArticles.slice(0, 10), ...enArticles.slice(0, 10)]

  console.log(`   共抓取 ${allArticles.length} 篇，` +
    `最近 ${hours}h ${recent.length} 篇，去重后 ${deduped.length} 篇` +
    (zhArticles.length > 10 || enArticles.length > 10
      ? `，精选中文 ${Math.min(10, zhArticles.length)} 篇 + 外文 ${Math.min(10, enArticles.length)} 篇\n`
      : '\n'))

  // 6. 生成每日总结（可选）
  let dailySummary = ''
  if (doSummary && top.length > 0) {
    dailySummary = generateSummary(top)
    console.log(`📌 AI 资讯速览: ${dailySummary.slice(0, 60)}…\n`)
  }

  // 7. 翻译（可选）
  if (doTranslate) {
    console.log('🌐 正在翻译标题和摘要…')

    const titleTexts = top.map((a, i) => ({ index: i, text: a.title }))
    const summaryTexts = top
      .map((a, i) => ({ index: i, text: a.summary }))
      .filter((t) => t.text.length > 0)

    const [titleResults, summaryResults] = await Promise.all([
      batchTranslate(titleTexts, (d, t) => {
        process.stdout.write(`\r   标题翻译进度: ${d}/${t}`)
      }),
      summaryTexts.length > 0
        ? batchTranslate(summaryTexts, (d, t) => {
            process.stdout.write(`\r   摘要翻译进度: ${d}/${t}`)
          })
        : Promise.resolve(new Map<number, string>()),
    ])
    process.stdout.write('\n')

    top.forEach((a, i) => {
      a.titleCn = titleResults.get(i)
      const summaryResult = summaryResults.get(i)
      if (summaryResult) a.summaryCn = summaryResult
    })

    console.log('')
  }

  // 8. 生成报告（中英分段 + 每日总结）
  const zhCount = zhArticles.slice(0, 10).length
  const filePath = await generateReport(top, outDir, zhCount, dailySummary)

  console.log(`✅ 日报已生成: ${filePath}`)

  // 9. 推送到飞书（可选）
  if (doFeishu) {
    const config = loadConfig()
    const webhookUrl = config?.feishu?.webhookUrl
    if (webhookUrl) {
      console.log('📤 正在推送到飞书…')
      const ok = await pushToFeishu(webhookUrl, top, zhCount, dailySummary)
      if (ok) {
        console.log('✅ 飞书推送完成')
      } else {
        console.error('❌ 飞书推送失败')
      }
    } else {
      console.warn('[提示] 未配置飞书 Webhook URL，跳过推送')
      console.warn('  请编辑 ~/.ainews/config.json 或设置 AINEWS_FEISHU_WEBHOOK_URL')
    }
  }

  // 10. 生成小红书发布内容（可选）
  if (doXhs) {
    console.log('📕 正在生成小红书发布内容…')
    const xhsPath = await generateXHSPost(top, zhCount, dailySummary)
    console.log(`✅ 小红书内容已生成: ${xhsPath}`)
  }
}

main().catch(async (err) => {
  console.error('[错误]', err)

  // ---- 日报失败告警：推送纯文本到飞书群机器人 ----
  try {
    const config = loadConfig()
    const webhookUrl = config?.feishu?.webhookUrl
    if (webhookUrl) {
      const message = err instanceof Error ? err.message : String(err)
      const alertText = [
        '⚠️ 今日 AI 日报生成失败',
        '',
        `时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`,
        `原因：${message}`,
        '请检查服务器日志（journalctl -u ai-news.service）',
      ].join('\n')
      const ok = await pushAlertToFeishu(webhookUrl, alertText)
      if (ok) {
        console.log('✅ 失败告警已推送至飞书')
      } else {
        console.error('❌ 失败告警推送失败（见上方日志）')
      }
    } else {
      console.warn('[告警] 未配置飞书 Webhook URL，跳过失败告警')
    }
  } catch (alertErr) {
    console.error('[告警] 推送失败告警时出错:', alertErr)
  }

  process.exit(1)
})
