import { describe, it, afterEach, mock } from 'node:test'
import { equal, deepEqual, ok } from 'node:assert/strict'
import { formatFeishuMessage, pushToFeishu } from './feishu.js'
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

// ---- formatFeishuMessage ----

describe('formatFeishuMessage', () => {
  it('正常：中英混合 + 每日速览', () => {
    const zh: Article[] = Array.from({ length: 3 }, (_, i) =>
      makeArticle({
        title: `中文文章 ${i + 1}`,
        titleCn: `Chinese Article ${i + 1}`,
        link: `https://example.com/zh/${i + 1}`,
        source: '36氪',
      }),
    )
    const en: Article[] = Array.from({ length: 2 }, (_, i) =>
      makeArticle({
        title: `English Article ${i + 1}`,
        link: `https://example.com/en/${i + 1}`,
        source: 'TechCrunch',
      }),
    )
    const articles = [...zh, ...en]
    const result = formatFeishuMessage(articles, 3, '今日聚焦 AI Agent。', '2026-07-07')

    equal(result.msg_type, 'post')
    equal(result.content.post.zh_cn.title, 'AI 周报 · 2026-07-07')

    const lines = result.content.post.zh_cn.content

    // 第 0 行：标题
    ok(lines[0][0].text.startsWith('📌 AI 周报'))
    equal(lines[0][0].tag, 'text')

    // 第 1 行：每日速览（原来第 2 行，去掉了空行）
    equal(lines[1][0].text, '今日聚焦 AI Agent。')

    // 第 3 行左右：中文精选
    const zhHeader = lines.find(l => l[0]?.text === '🇨🇳 中文精选')
    ok(zhHeader, '应包含中文精选标题')

    // 中文文章 1
    const zh1 = lines.find(l => l[0]?.text?.startsWith('1. Chinese Article 1'))
    ok(zh1, '应包含中文文章 1 标题')
    equal(zh1[0].text, '1. Chinese Article 1 [36氪]')

    // 文章 1 的链接行
    const linkLine = lines.find(l => l.some(e => e.tag === 'a' && e.href === 'https://example.com/zh/1'))
    ok(linkLine, '应包含文章 1 的链接')
    equal(linkLine[0].text, '  👉 ')

    // 英文标题
    const enHeaderIdx = lines.findIndex(l => l[0]?.text === '🌐 英文精选')
    ok(enHeaderIdx > 0)
    // 英文文章：含中文标题对照
    const enTitleLine = lines[enHeaderIdx + 1][0].text as string
    ok(enTitleLine.includes('English Article 1'))
  })

  it('无每日速览', () => {
    const articles = [makeArticle({ title: 'Only Article' })]
    const result = formatFeishuMessage(articles, 1, undefined, '2026-07-07')

    const lines = result.content.post.zh_cn.content

    // 第 0 行标题后，第 1 行是空行，第 2 行直接是内容
    equal(lines[2][0].text, '🇨🇳 中文精选')
  })

  it('自定义日期', () => {
    const articles = [makeArticle({ title: 'Test' })]
    const result = formatFeishuMessage(articles, 1, undefined, '2026-01-01')

    equal(result.content.post.zh_cn.title, 'AI 周报 · 2026-01-01')
    ok(result.content.post.zh_cn.content[0][0].text.includes('2026-01-01'))
  })

  it('中文超过 5 篇只取前 5', () => {
    const zh = Array.from({ length: 10 }, (_, i) =>
      makeArticle({ title: `文章 ${i + 1}`, source: '36氪' }),
    )
    const result = formatFeishuMessage(zh, 10, undefined, '2026-07-07')

    const lines = result.content.post.zh_cn.content
    // 6 行：标题 + 空行 + "中文精选" + 5 × (标题行 + 链接行)
    // 实际: 标题 + 空行 + 中文精选 + (文章1标题 + 文章1链接) × 5 + 底部空行 + 底部分隔线 + 底部文字
    const articleTitleLines = lines.filter(l =>
      /^\d+\. 文章/.test(l[0]?.text ?? ''),
    )
    equal(articleTitleLines.length, 5, '应该只输出 5 篇中文文章')
  })

  it('英文超过 3 篇只取前 3', () => {
    const en = Array.from({ length: 10 }, (_, i) =>
      makeArticle({ title: `EN Article ${i + 1}`, source: 'HN' }),
    )
    const result = formatFeishuMessage(en, 0, undefined, '2026-07-07')

    const lines = result.content.post.zh_cn.content
    const articleTitleLines = lines.filter(l =>
      /^\d+\./.test(l[0]?.text ?? ''),
    )
    equal(articleTitleLines.length, 3, '应该只输出 3 篇英文文章')
  })

  it('空文章列表', () => {
    const result = formatFeishuMessage([], 0, '摘要', '2026-07-07')

    const lines = result.content.post.zh_cn.content
    // 应该有标题 + 空行 + 摘要 + 空行 + 底部分隔线 + 底部文字
    ok(lines.length >= 4)
    ok(lines.some(l => l[0]?.text?.includes('AI News')))
  })

  it('英文文章有 titleCn 时显示中英对照', () => {
    const articles = [
      makeArticle({
        title: 'GPT-5 Released',
        titleCn: 'GPT-5 正式发布',
        link: 'https://example.com/gpt5',
        source: 'TechCrunch',
      }),
    ]
    const result = formatFeishuMessage(articles, 0, undefined, '2026-07-07')

    const lines = result.content.post.zh_cn.content
    const titleLine = lines.find(l =>
      l[0]?.text?.includes('GPT-5'),
    )
    ok(titleLine, '英文文章标题应该出现')
    ok(titleLine[0].text.includes('GPT-5 正式发布'), '应该显示中文翻译')
    ok(titleLine[0].text.includes('GPT-5 Released'), '应该也显示英文原文')
  })
})

// ---- pushToFeishu ----

describe('pushToFeishu', () => {
  afterEach(() => {
    mock.reset()
  })

  it('发送成功 → 返回 true', async () => {
    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ code: 0, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const ok = await pushToFeishu(
      'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      [makeArticle()],
      1,
      '摘要',
    )
    equal(ok, true)
  })

  it('HTTP 非 200 → 返回 false', async () => {
    mock.method(globalThis, 'fetch', async () =>
      new Response('Bad Request', { status: 400 }),
    )

    const ok = await pushToFeishu(
      'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      [makeArticle()],
      1,
    )
    equal(ok, false)
  })

  it('API 返回非零 code → 返回 false', async () => {
    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ code: 19021, msg: 'rate limit' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const ok = await pushToFeishu(
      'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      [makeArticle()],
      1,
    )
    equal(ok, false)
  })

  it('网络异常 → 返回 false（不抛异常）', async () => {
    mock.method(globalThis, 'fetch', async () => {
      throw new Error('fetch failed')
    })

    const ok = await pushToFeishu(
      'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      [makeArticle()],
      1,
    )
    equal(ok, false)
  })
})
