/**
 * 信源匹配模块测试
 */
import { describe, it } from 'node:test'
import { strictEqual, deepStrictEqual, ok } from 'node:assert'

// 注意：该模块依赖 sources.json 文件，测试时假设文件可读
import { matchSources } from './sourceMatcher.js'

describe('信源匹配 (matchSources)', () => {
  it('"科技" 分类至少匹配 3 个源', () => {
    const sources = matchSources('科技')
    ok(sources.length >= 3, `科技分类应匹配多个源，实际 ${sources.length}`)
    // 所有匹配的源都应包含 "科技" 分类
    for (const s of sources) {
      ok(s.categories?.includes('科技'), `${s.name} 应包含科技分类`)
    }
  })

  it('"兜底" 返回全部源', () => {
    const sources = matchSources('兜底')
    const allSources = matchSources('')
    ok(sources.length >= 7, `兜底应返回全部源，实际 ${sources.length}`)
  })

  it('不存在的分类降级为全部源', () => {
    const sources = matchSources('不存在的分类')
    ok(sources.length >= 7, `不存在的分类应降级为全部源，实际 ${sources.length}`)
  })

  it('返回结果包含各字段', () => {
    const sources = matchSources('科技')
    for (const s of sources) {
      ok(s.name, '应有 name')
      ok(s.url, '应有 url')
      ok(s.lang === 'zh' || s.lang === 'en', `应有 lang，实际 ${s.lang}`)
    }
  })
})
