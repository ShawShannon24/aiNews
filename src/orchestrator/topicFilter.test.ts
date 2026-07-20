/**
 * 主题过滤模块测试
 */
import { describe, it } from 'node:test'
import { strictEqual, deepStrictEqual } from 'node:assert'
import { Article } from '../types.js'
import { filterByTopic } from './topicFilter.js'

function makeArticle(title: string, summary = '', source = 'Test'): Article {
  return { title, summary, source, link: 'https://example.com', pubDate: '' }
}

describe('主题过滤 (filterByTopic)', () => {
  it('空 topic 返回全部文章', () => {
    const articles = [makeArticle('AI 新闻'), makeArticle('科技')]
    const result = filterByTopic(articles, '')
    strictEqual(result.length, 2)
  })

  it('匹配标题中的关键词', () => {
    const articles = [
      makeArticle('人形机器人发布新进展'),
      makeArticle('AI 模型训练技巧'),
      makeArticle('云计算市场分析'),
    ]
    const result = filterByTopic(articles, '人形机器人')
    strictEqual(result.length, 1)
    strictEqual(result[0].title, '人形机器人发布新进展')
  })

  it('匹配摘要中的关键词', () => {
    const articles = [
      makeArticle('某公司发布会', '今天发布了新一代人形机器人产品'),
      makeArticle('天气预报', '明天有雨'),
    ]
    const result = filterByTopic(articles, '人形机器人')
    strictEqual(result.length, 1)
  })

  it('英文关键词匹配', () => {
    const articles = [
      makeArticle('OpenAI releases new model', 'GPT-5 is here'),
      makeArticle('Apple stock rises', 'AAPL up 2%'),
    ]
    const result = filterByTopic(articles, 'OpenAI')
    strictEqual(result.length, 1)
  })

  it('无匹配返回空数组', () => {
    const articles = [makeArticle('AI 新闻'), makeArticle('科技进展')]
    const result = filterByTopic(articles, '体育赛事')
    strictEqual(result.length, 0)
  })
})
