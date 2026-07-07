import { FeedSource } from './types.js'

const MAX_RETRIES = 2

async function fetchWithRetry(
  source: FeedSource,
  attempt: number,
): Promise<{ name: string; xml: string | null }> {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'ai-news-cli/1.0' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { name: source.name, xml: await res.text() }
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = attempt === 1 ? 1000 : 3000
      console.warn(`[警告] ${source.name} 抓取失败，${delay / 1000}s 后重试 (${attempt}/${MAX_RETRIES}): ${err}`)
      await new Promise((r) => setTimeout(r, delay))
      return fetchWithRetry(source, attempt + 1)
    }
    console.warn(`[警告] ${source.name} 抓取失败，已重试 ${MAX_RETRIES} 次: ${err}`)
    return { name: source.name, xml: null }
  }
}

/** 并发抓取所有 RSS 源（带重试），返回 { sourceName, xmlText } 列表 */
export async function fetchAllFeeds(
  sources: FeedSource[],
): Promise<{ name: string; xml: string | null }[]> {
  const results = await Promise.allSettled(
    sources.map((s) => fetchWithRetry(s, 1)),
  )

  return results.map((r) => {
    if (r.status === 'fulfilled') return r.value
    // Promise.allSettled 本身不应走到这里（fetchWithRetry 已捕获所有异常）
    return { name: '', xml: null }
  })
}
