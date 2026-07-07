import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseFeed, filterRecent, dedupe, sortByDate } from './parser.js'
import { Article } from './types.js'

// ---------------------------------------------------------------------------
// 模拟 RSS XML
// ---------------------------------------------------------------------------
const MOCK_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>AI Breakthrough in Neural Networks</title>
      <link>https://example.com/ai-1</link>
      <pubDate>Sat, 27 Jun 2026 10:00:00 +0000</pubDate>
      <description>Researchers announce a major breakthrough in neural network training efficiency.</description>
    </item>
    <item>
      <title>New Machine Learning Framework Released</title>
      <link>https://example.com/ml-1</link>
      <pubDate>Sun, 28 Jun 2026 10:00:00 +0000</pubDate>
      <description>A new open-source machine learning framework promises faster inference on edge devices.</description>
    </item>
  </channel>
</rss>`

const MOCK_RSS_HN = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>Show HN: AI News CLI</title>
      <link>https://example.com/hn-1</link>
      <pubDate>Sun, 28 Jun 2026 12:00:00 +0000</pubDate>
      <description>Article URL: https://example.com/article&#10;Comments URL: https://example.com/comments&#10;Points: 50&#10;&#10;I built a CLI tool that aggregates AI news from multiple sources.</description>
    </item>
  </channel>
</rss>`

// ---------------------------------------------------------------------------
// parseFeed
// ---------------------------------------------------------------------------
describe('parseFeed', () => {
  it('应解析 RSS XML 为文章列表', () => {
    const articles = parseFeed(MOCK_RSS, 'TestSource')
    assert.equal(articles.length, 2)
    assert.equal(articles[0].title, 'AI Breakthrough in Neural Networks')
    assert.equal(articles[0].link, 'https://example.com/ai-1')
    assert.equal(articles[0].source, 'TestSource')
  })

  it('应提取 summary', () => {
    const articles = parseFeed(MOCK_RSS, 'Test')
    assert.ok(articles[0].summary.length > 0)
    assert.ok(articles[0].summary.includes('neural network'))
  })

  it('应过滤 HN 元数据', () => {
    const articles = parseFeed(MOCK_RSS_HN, 'Hacker News')
    assert.equal(articles.length, 1)
    assert.ok(!articles[0].summary.includes('Article URL'))
    assert.ok(!articles[0].summary.includes('Comments URL'))
    assert.ok(!articles[0].summary.includes('Points:'))
    assert.ok(articles[0].summary.includes('CLI tool'))
  })

  it('空 XML 应返回空数组', () => {
    const articles = parseFeed('<rss><channel></channel></rss>', 'Empty')
    assert.equal(articles.length, 0)
  })
})

// ---------------------------------------------------------------------------
// filterRecent
// ---------------------------------------------------------------------------
function makeArticle(overrides: Partial<Article> & { pubDate: string }): Article {
  return {
    title: 'Test',
    link: 'https://example.com',
    summary: '',
    source: 'Test',
    ...overrides,
  }
}

describe('filterRecent', () => {
  const now = Date.now()
  const oneHourMs = 3_600_000

  it('应保留时间窗口内的文章', () => {
    const articles = [
      makeArticle({ title: 'Recent', pubDate: new Date(now - oneHourMs).toISOString() }),
      makeArticle({ title: 'Old', pubDate: new Date(now - 48 * oneHourMs).toISOString() }),
    ]
    const result = filterRecent(articles, 24)
    assert.equal(result.length, 1)
    assert.equal(result[0].title, 'Recent')
  })

  it('支持自定义 hours 参数', () => {
    const articles = [
      makeArticle({ title: 'Two hours ago', pubDate: new Date(now - 2 * oneHourMs).toISOString() }),
      makeArticle({ title: 'Six hours ago', pubDate: new Date(now - 6 * oneHourMs).toISOString() }),
    ]
    const result = filterRecent(articles, 4)
    assert.equal(result.length, 1)
    assert.equal(result[0].title, 'Two hours ago')
  })

  it('无日期文章不通过过滤', () => {
    const articles = [
      makeArticle({ title: 'No date', pubDate: '' }),
    ]
    assert.equal(filterRecent(articles).length, 0)
  })
})

// ---------------------------------------------------------------------------
// dedupe
// ---------------------------------------------------------------------------
describe('dedupe', () => {
  it('应去除重复标题（大小写不敏感）', () => {
    const articles = [
      makeArticle({ title: 'AI News', pubDate: '2026-06-28T10:00:00Z' }),
      makeArticle({ title: 'ai news', pubDate: '2026-06-28T11:00:00Z' }),
      makeArticle({ title: 'Different Story', pubDate: '2026-06-28T12:00:00Z' }),
    ]
    const result = dedupe(articles)
    assert.equal(result.length, 2)
    assert.equal(result[0].title, 'AI News')
    assert.equal(result[1].title, 'Different Story')
  })

  it('保留第一条出现的', () => {
    const articles = [
      makeArticle({ title: 'Original', pubDate: '2026-06-27T10:00:00Z' }),
      makeArticle({ title: 'Original', pubDate: '2026-06-28T10:00:00Z' }),
    ]
    const result = dedupe(articles)
    assert.equal(result.length, 1)
    assert.equal(result[0].pubDate, '2026-06-27T10:00:00Z')
  })
})

// ---------------------------------------------------------------------------
// sortByDate
// ---------------------------------------------------------------------------
describe('sortByDate', () => {
  it('按时间降序排列', () => {
    const articles = [
      makeArticle({ title: 'Oldest', pubDate: '2026-06-27T10:00:00Z' }),
      makeArticle({ title: 'Middle', pubDate: '2026-06-28T10:00:00Z' }),
      makeArticle({ title: 'Newest', pubDate: '2026-06-28T14:00:00Z' }),
    ]
    const result = sortByDate(articles)
    assert.equal(result[0].title, 'Newest')
    assert.equal(result[1].title, 'Middle')
    assert.equal(result[2].title, 'Oldest')
  })

  it('无日期文章排在尾部', () => {
    const articles = [
      makeArticle({ title: 'Dated', pubDate: '2026-06-28T10:00:00Z' }),
      makeArticle({ title: 'No date', pubDate: '' }),
    ]
    const result = sortByDate(articles)
    assert.equal(result[0].title, 'Dated')
    assert.equal(result[1].title, 'No date')
  })
})
