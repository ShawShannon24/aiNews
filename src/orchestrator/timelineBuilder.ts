/**
 * 时间线+观点生成模块
 *
 * 接收按时间排序的文章列表 → 调 DeepSeek（可选）→ 生成结构化输出。
 * 如果 DeepSeek 不可用，降级为简单的文章列表。
 */
import { Article } from '../types.js'
import { loadConfig } from '../config.js'

const DEEPSEEK_SYSTEM_PROMPT = `你是一个新闻分析师。收到一组关于 "{topic}" 的系列报道，
需要完成两项任务：

1. 梳理时间线
   按日期列出关键事件，格式：
   📅 时间线
   MM/DD | 事件简述 | [来源]
   MM/DD | 事件简述 | [来源]

2. 观点归纳
   阅读所有报道，提取目前存在的不同观点/立场。
   区分 2-4 类明显不同的观点，每类用一句话概括，
   并注明哪些报道支持该观点。格式：
   💡 各方观点
   - 观点一：...（来源：源A、源B）
   - 观点二：...（来源：源C）

注意：
  - 时间线按日期从旧到新排列
  - 如果所有报道观点一致，就写 "目前各方观点较为一致" 并概括
  - 输出纯文本，不用 markdown 包装
  - 总字数控制在 500 字以内`

/**
 * 使用 DeepSeek 生成时间线+观点。
 */
async function generateWithLLM(
  articles: Article[],
  topic: string,
  apiKey: string,
  baseUrl: string,
): Promise<string | null> {
  const articleText = articles
    .map(
      (a, i) =>
        `${i + 1}. [${a.source}] ${a.pubDate ? new Date(a.pubDate).toLocaleDateString('zh-CN') : '日期未知'} | ${a.titleCn || a.title} | ${(a.summaryCn || a.summary).slice(0, 200)}`,
    )
    .join('\n')

  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: DEEPSEEK_SYSTEM_PROMPT.replace('{topic}', topic) },
      { role: 'user', content: `以下是关于「${topic}」的系列报道：\n\n${articleText}\n\n请生成时间线和观点归纳。` },
    ],
    temperature: 0.3,
    max_tokens: 1000,
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 20_000)

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) return null

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return data.choices?.[0]?.message?.content?.trim() || null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[timelineBuilder] DeepSeek 调用失败: ${msg}`)
    return null
  }
}

/**
 * 降级方案：直接格式化文章列表。
 */
function formatArticleList(articles: Article[], topic: string): string {
  if (articles.length === 0) {
    return `当前没有关于「${topic}」的新内容`
  }

  const lines: string[] = []
  lines.push(`📌 关于「${topic}」的相关文章（${articles.length} 篇）`)
  lines.push('')

  // 按日期分组
  const byDate = new Map<string, Article[]>()
  for (const a of articles) {
    const dateKey = a.pubDate
      ? new Date(a.pubDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      : '日期未知'
    if (!byDate.has(dateKey)) byDate.set(dateKey, [])
    byDate.get(dateKey)!.push(a)
  }

  // 日期降序排列
  const sortedDates = [...byDate.entries()].sort((a, b) => {
    if (a[0] === '日期未知') return 1
    if (b[0] === '日期未知') return -1
    return b[0].localeCompare(a[0])
  })

  for (const [date, items] of sortedDates) {
    lines.push(`📅 ${date}`)
    for (const a of items) {
      const title = a.titleCn || a.title
      lines.push(`  ${title} [${a.source}]`)
      lines.push(`  👉 ${a.link}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 生成时间线+观点内容。
 *
 * @param articles 按时间倒序排列的文章列表
 * @param topic    主题词
 * @returns 格式化的 Markdown 文本
 */
export async function buildTimeline(
  articles: Article[],
  topic: string,
): Promise<string> {
  // 最多使用前 20 篇
  const topArticles = articles.slice(0, 20)
  if (topArticles.length === 0) {
    return `当前没有关于「${topic}」的新内容`
  }

  // 尝试 DeepSeek 生成
  const config = loadConfig()
  const deepseekConfig = config?.deepseek

  if (deepseekConfig?.apiKey) {
    const llmResult = await generateWithLLM(
      topArticles,
      topic,
      deepseekConfig.apiKey,
      deepseekConfig.baseUrl || 'https://api.deepseek.com/v1',
    )
    if (llmResult) return llmResult
    console.warn('[timelineBuilder] DeepSeek 生成失败，使用降级方案')
  }

  // 降级：直接展示文章列表
  return formatArticleList(topArticles, topic)
}
