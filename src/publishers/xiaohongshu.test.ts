import { describe, it } from 'node:test'
import { equal, ok, match } from 'node:assert/strict'
import { formatXHSPost } from './xiaohongshu.js'
import { Article } from '../types.js'

/** 造一篇测试文章的工厂函数 */
function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    title: 'Test Article',
    link: 'https://example.com/test',
    pubDate: '2026-07-07T10:00:00Z',
    source: 'TestSource',
    summary: '',
    titleCn: undefined,
    summaryCn: undefined,
    ...overrides,
  }
}

describe('formatXHSPost', () => {
  it('正常：中英混合 + 每日速览', () => {
    const zh: Article[] = Array.from({ length: 3 }, (_, i) =>
      makeArticle({
        title: `English Title ${i + 1}`,
        titleCn: `中文文章 ${i + 1}`,
        link: `https://example.com/zh/${i + 1}`,
        source: '36氪',
        summary: `这是中文文章${i + 1}的详细介绍内容。`,
        summaryCn: undefined,
      }),
    )
    const en: Article[] = Array.from({ length: 2 }, (_, i) =>
      makeArticle({
        title: `English Article ${i + 1}`,
        link: `https://example.com/en/${i + 1}`,
        source: 'TechCrunch',
        summary: `This is English article ${i + 1}`,
      }),
    )
    const articles = [...zh, ...en]
    const result = formatXHSPost(articles, 3, '今日聚焦 AI Agent 与多模态大模型发展。', '2026-07-07')

    // 验证标题 ≤20 字符
    const titleLine = result.split('\n')[0]
    const titleLen = [...titleLine].length
    ok(titleLen <= 20, `标题长度 ${titleLen} 应 ≤20`)

    // 验证正文 ≤1000 字符
    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `正文长度 ${bodyLen} 应 ≤1000`)

    // 验证包含标题
    ok(titleLine.length > 0, '应有标题')

    // 验证包含中文文章标题
    ok(result.includes('中文文章 1'), '应包含中文文章 1')

    // 验证包含英文文章
    ok(result.includes('English Article 1'), '应包含英文文章')

    // 验证包含来源
    ok(result.includes('[36氪]'), '应包含来源 36氪')
    ok(result.includes('[TechCrunch]'), '应包含来源 TechCrunch')

    // 验证包含话题标签
    ok(result.includes('#人工智能'), '应包含 #人工智能')
    ok(result.includes('#AI'), '应包含 #AI')

    // 验证包含 Emoji 排版
    ok(result.includes('📰'), '应包含 Emoji 排版')
  })

  it('无每日速览', () => {
    const articles = [makeArticle({ title: 'GPT-5 Released', summary: 'A big release' })]
    const result = formatXHSPost(articles, 1, undefined, '2026-07-07')

    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `正文长度 ${bodyLen} 应 ≤1000`)

    // 无 dailySummary 时使用 fallback 标题
    const titleLine = result.split('\n')[0]
    ok(titleLine.includes('AI'), 'fallback 标题应包含 AI')
    const titleLen = [...titleLine].length
    ok(titleLen <= 20, `标题长度 ${titleLen} 应 ≤20`)

    // 正文应有今日要点
    ok(result.includes('今日要点'), '应有今日要点')
  })

  it('自定义日期（仅传参，不影响内容格式）', () => {
    const articles = [makeArticle({ title: 'Test Article', source: 'HN' })]
    const result = formatXHSPost(articles, 0, '每日速览', '2026-01-01')

    // formatXHSPost 的日期仅用于 generateXHSPost 文件命名，不嵌入正文
    // 正文应包含 dailySummary 内容
    ok(result.includes('每日速览'), '应包含每日速览内容')
    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `正文长度 ${bodyLen} 应 ≤1000`)
  })

  it('空文章列表', () => {
    const result = formatXHSPost([], 0, '今日无新闻', '2026-07-07')

    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `空列表正文长度 ${bodyLen} 应 ≤1000`)

    // 空列表时今日要点部分无文章
    const lines = result.split('\n')
    const hasTitle = lines.some(l => l.includes('AI'))
    ok(hasTitle, '应有标题')
  })

  it('只有英文文章', () => {
    const en: Article[] = Array.from({ length: 5 }, (_, i) =>
      makeArticle({
        title: `EN Article ${i + 1}`,
        source: 'TechCrunch',
        summary: `Summary for article ${i + 1}`,
      }),
    )
    const result = formatXHSPost(en, 0, 'All English today', '2026-07-07')

    // 验证标题 ≤20
    const titleLen = [...result.split('\n')[0]].length
    ok(titleLen <= 20, `标题长度 ${titleLen} 应 ≤20`)

    // 验证正文 ≤1000
    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `正文长度 ${bodyLen} 应 ≤1000`)

    // 验证所有 5 篇文章都在
    for (let i = 1; i <= 5; i++) {
      ok(result.includes(`EN Article ${i}`), `应包含 EN Article ${i}`)
    }

    // 应包含话题标签
    ok(result.includes('#AI'), '应包含 #AI')
  })

  it('中文超过 5 篇只取前 5', () => {
    const zh = Array.from({ length: 10 }, (_, i) =>
      makeArticle({
        title: `文章 ${i + 1}`,
        titleCn: undefined,
        source: '36氪',
        summary: `这是第 ${i + 1} 篇文章。`,
      }),
    )
    const result = formatXHSPost(zh, 10, '十篇文章', '2026-07-07')

    // 只应显示前 5 篇
    ok(result.includes('文章 1'), '应包含文章 1')
    ok(result.includes('文章 5'), '应包含文章 5')
    equal(result.includes('文章 6'), false, '不应包含文章 6')

    const bodyLen = [...result].length
    ok(bodyLen <= 1000, `正文长度 ${bodyLen} 应 ≤1000`)
  })

  it('摘要过长时自动截断到 ≈50 字符', () => {
    const articles = [
      makeArticle({
        titleCn: '这是一个非常长的中文标题用于测试截断功能',
        summary: '这是一个非常长的中文摘要，用来测试 extractBlurb 函数是否能够正确截断超长摘要并添加省略号。这个摘要远远超过了五十个字符的限制。',
      }),
    ]
    const result = formatXHSPost(articles, 1, '每日速览', '2026-07-07')

    // 找到简介行（以空格开头的行）
    const lines = result.split('\n')
    const blurbLines = lines.filter(l => l.startsWith('   '))
    ok(blurbLines.length > 0, '应有简介行')

    const blurb = blurbLines[0].trim()
    // 如果超过 50 字符，应有省略号
    if ([...blurb].length > 50) {
      ok(blurb.endsWith('…'), '超长摘要应添加省略号')
    }
  })

  it('话题标签根据内容自动生成', () => {
    const articles = [
      makeArticle({
        title: 'OpenAI Releases GPT-5 with 1M Context Window',
        titleCn: 'OpenAI 发布 GPT-5，百万上下文窗口',
        source: 'TechCrunch',
        summary: 'OpenAI 今天正式发布 GPT-5 大模型',
      }),
      makeArticle({
        title: 'NVIDIA Announces Next-Gen AI Chip',
        titleCn: '英伟达发布新一代 AI 芯片',
        source: 'TechCrunch',
        summary: 'NVIDIA 发布 Blackwell GPU',
      }),
    ]
    const result = formatXHSPost(articles, 2, 'OpenAI 发布 GPT-5', '2026-07-07')

    // 应包含匹配的标签
    ok(result.includes('#大模型'), '应包含 #大模型')
    ok(result.includes('#芯片'), '应包含 #芯片')

    // 应始终包含基础标签
    ok(result.includes('#人工智能'), '应始终包含 #人工智能')
    ok(result.includes('#AI'), '应始终包含 #AI')
  })
})
