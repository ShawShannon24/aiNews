/** 单篇文章 */
export interface Article {
  title: string
  link: string
  pubDate: string
  source: string
  summary: string
  /** 中文翻译（可选） */
  titleCn?: string
  summaryCn?: string
  /** 同一标题出现的源数量（用于跨源热度评分） */
  sourceCount?: number
}

/** RSS 源配置 */
export interface FeedSource {
  name: string
  url: string
  /** 语言: zh = 中文, en = 英文（默认 en） */
  lang?: 'zh' | 'en'
  /** 分类: 科技 / 财经 / 体育 / 兜底（用于话题追踪信源匹配） */
  categories?: string[]
}

/** RSS XML 顶层结构 */
export interface RSSFeed {
  rss: {
    channel: {
      item: RSSItem | RSSItem[]
    }
  }
}

export interface RSSItem {
  title?: string
  link?: string
  pubDate?: string
  description?: string
  ['content:encoded']?: string
}
