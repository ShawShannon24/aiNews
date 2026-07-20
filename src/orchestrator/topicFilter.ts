/**
 * 主题二次过滤模块
 *
 * 在通用 AI/科技关键词过滤基础上，进一步按用户指定 topic 筛选文章。
 * 使用简单的关键词匹配（标题 + 摘要）。
 */
import { Article } from '../types.js'

/**
 * 按主题过滤文章列表。
 *
 * @param articles 已通过 AI 关键词过滤的文章
 * @param topic    用户订阅/查询的主题词
 * @returns 仅包含与 topic 相关的文章
 */
export function filterByTopic(articles: Article[], topic: string): Article[] {
  if (!topic.trim()) return articles

  const keywords = extractKeywords(topic)

  if (keywords.length === 0) return articles

  return articles.filter((a) => {
    const searchText = `${a.title} ${a.summary} ${a.titleCn || ''} ${a.summaryCn || ''}`.toLowerCase()
    return keywords.some((kw) => searchText.includes(kw))
  })
}

/**
 * 从主题词中提取关键词。
 *
 * - 中文按字拆分（通常 2-4 字的中文词本身就是关键词）
 * - 英文按空格分词
 * - 去掉长度 <= 1 的字符
 */
function extractKeywords(topic: string): string[] {
  const trimmed = topic.trim().toLowerCase()
  if (!trimmed) return []

  // 检测是否包含英文
  const hasEnglish = /[a-z]/.test(trimmed)

  if (hasEnglish) {
    // 英文或混合：按空格分词
    return trimmed
      .split(/\s+/)
      .filter((w) => w.length > 1)
  }

  // 纯中文：主题词本身就是关键词
  // 对于 "人形机器人"，匹配时用整个短语
  // 但如果主题很长（> 8 字），拆成 2-4 字的关键词
  if (trimmed.length > 8) {
    // 按常见分隔符拆分
    const parts = trimmed.split(/[,，、\s]+/).filter((p) => p.length >= 2)
    if (parts.length > 0) return parts
  }

  return [trimmed]
}
