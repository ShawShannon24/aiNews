import { XMLParser } from 'fast-xml-parser'
import { Article, RSSFeed, RSSItem } from './types.js'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

/** 去掉 HN RSS 中无意义的元数据 */
function cleanDescription(text: string): string {
  // 去掉整行是元数据的行
  const lines = text.split('\n').filter((line) => {
    const trimmed = line.trim()
    // 匹配各种 HN 元数据格式
    if (/^(Article URL|Comments URL|Points|Votes|# Comments|Link):/i.test(trimmed)) return false
    if (/^\d+ points?$/i.test(trimmed)) return false
    return true
  })
  return lines.join(' ').trim()
}

/** 从 HTML 文本中提取纯文本摘要，在自然断句处截断 */
function extractSummary(text: string | undefined): string {
  if (!text) return ''

  // 剥掉 HTML 标签 & 解码实体（保留换行，供 cleanDescription 按行过滤）
  const withNewlines = text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(10|13);/g, '\n') // 换行符实体 → 真正换行
    .replace(/&#\d+;/g, '')

  // 去掉 HN 元数据（此时还有换行，cleanDescription 靠 split('\n') 逐行过滤）
  const cleaned = cleanDescription(withNewlines)
  if (!cleaned) return ''

  // 归一化空格
  const normalized = cleaned.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''

  if (normalized.length <= 100) return normalized

  // 在 40–150 区间内找自然断句点（句号/感叹号/问号）
  const chars = [...normalized]
  const slice = chars.slice(40, 150).join('')
  const breakMatch = slice.match(/[。.!！?？]/)
  if (breakMatch && breakMatch.index !== undefined) {
    const breakAt = 40 + breakMatch.index + 1
    return chars.slice(0, breakAt).join('').trim()
  }

  // 无自然断句则截取前 100 字 + …
  return chars.slice(0, 100).join('').trim() + '…'
}

/** 解析单个 RSS 源的 XML → Article[] */
export function parseFeed(xml: string, sourceName: string): Article[] {
  try {
    const feed = parser.parse(xml) as RSSFeed
    const rawItems = feed.rss?.channel?.item
    if (!rawItems) return []

    const items: RSSItem[] = Array.isArray(rawItems) ? rawItems : [rawItems]

    return items.map((item) => ({
      title: item.title?.trim() || '(无标题)',
      link: item.link?.trim() || '',
      pubDate: item.pubDate?.trim() || '',
      source: sourceName,
      // 优先使用完整正文（content:encoded），回退到 description
      summary: extractSummary(item['content:encoded'] || item.description),
    }))
  } catch (err) {
    console.warn(`[警告] 解析失败 (${sourceName}): ${err}`)
    return []
  }
}

/** 安全解析日期，失败返回 0（排在列表尾部） */
function parseDateSafe(dateStr: string): number {
  if (!dateStr) return 0
  const ts = new Date(dateStr).getTime()
  return isNaN(ts) ? 0 : ts
}

/** 过滤出最近 24 小时的文章 */
export function filterRecent(articles: Article[], hours = 24): Article[] {
  const cutoff = Date.now() - hours * 60 * 60 * 1000
  return articles.filter((a) => {
    const ts = parseDateSafe(a.pubDate)
    return ts > 0 && ts >= cutoff
  })
}

/** 按标题去重（保留最先出现的） */
export function dedupe(articles: Article[]): Article[] {
  const seen = new Set<string>()
  return articles.filter((a) => {
    const key = a.title.toLowerCase().trim()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * 统计每个标题在多少个不同源中出现过（用于跨源热度评分）。
 * 应在 dedupe 之前调用，结果通过 dedupe 后的 sourceCount 字段使用。
 */
export function countSourceOverlap(
  articles: Article[],
): Map<string, number> {
  const map = new Map<string, Set<string>>()
  for (const a of articles) {
    const key = a.title.toLowerCase().trim()
    if (!map.has(key)) map.set(key, new Set())
    map.get(key)!.add(a.source)
  }
  const result = new Map<string, number>()
  for (const [key, sources] of map) {
    result.set(key, sources.size)
  }
  return result
}

/** 按时间降序排列 */
export function sortByDate(articles: Article[]): Article[] {
  return [...articles].sort(
    (a, b) => parseDateSafe(b.pubDate) - parseDateSafe(a.pubDate),
  )
}
