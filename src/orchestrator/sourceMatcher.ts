/**
 * 信源匹配模块
 *
 * 根据分类返回应抓取的信源列表。
 * 纯数据驱动，简单过滤，不使用 LLM。
 */
import { readFileSync } from 'node:fs'
import { FeedSource } from '../types.js'

const SOURCES_PATH = new URL('../../sources.json', import.meta.url)

/**
 * 加载 sources.json 中的信源列表。
 */
function loadSources(): FeedSource[] {
  try {
    const data = readFileSync(SOURCES_PATH, 'utf-8')
    return JSON.parse(data) as FeedSource[]
  } catch (err) {
    console.warn('[sourceMatcher] sources.json 加载失败:', err)
    return []
  }
}

/**
 * 根据分类匹配信源。
 *
 * @param category 分类名称（"科技" | "财经" | "体育" | "兜底"）
 * @returns 匹配的信源列表
 */
export function matchSources(category: string): FeedSource[] {
  const allSources = loadSources()

  if (!category || category === '兜底') {
    // "兜底" = 全部信源
    return allSources
  }

  const matched = allSources.filter(
    (s) => s.categories?.includes(category),
  )

  // 如果该分类没有匹配到任何源，降级为全部源
  if (matched.length === 0) {
    console.warn(`[sourceMatcher] 分类 "${category}" 无匹配信源，使用全部源`)
    return allSources
  }

  return matched
}
