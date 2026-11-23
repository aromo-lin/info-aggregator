import { describe, expect, test } from 'vitest'
import { summarize, testConnection } from '../src/main/ai/provider'
import type { ScrapedItem } from '../src/shared/types'

const items: ScrapedItem[] = [
  { id: '1', sourceId: 's', title: 't', author: 'a', date: '2026-11-01', likes: 1, url: 'u', images: [], text: '内容', comments: [] },
]

type HttpCall = { url: string; init?: RequestInit }

describe('summarize', () => {
  test('extracts text content from a Claude response', async () => {
    const calls: HttpCall[] = []
    const http = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { text: async () => '{"content":[{"type":"text","text":"综述内容"}]}' } as { text(): Promise<string> }
    }
    const result = await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: '按点赞' }, http)
    expect(result).toBe('综述内容')
    expect(calls[0].url).toContain('anthropic')
  })

  test('extracts text content from an OpenAI response', async () => {
    const http = async () => ({ text: async () => '{"choices":[{"message":{"content":"openai 综述"}}]}' } as { text(): Promise<string> })
    const result = await summarize(items, { model: 'gpt-4o', apiKey: 'k', requirement: 'r' }, http)
    expect(result).toBe('openai 综述')
  })

  test('falls back to raw text when response is not valid json', async () => {
    const http = async () => ({ text: async () => 'not json' } as { text(): Promise<string> })
    const result = await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r' }, http)
    expect(result).toBe('not json')
  })

  test('routes different model families to different providers', async () => {
    const calls: HttpCall[] = []
    const http = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { text: async () => '{"content":[{"type":"text","text":"ok"}]}' } as { text(): Promise<string> }
    }
    await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r' }, http)
    await summarize(items, { model: 'gpt-4o', apiKey: 'k', requirement: 'r' }, http)
    expect(calls[0].url).toContain('anthropic')
    expect(calls[1].url).toContain('openai')
  })

  test('routes domestic models to their domestic endpoints without baseUrl', async () => {
    const calls: string[] = []
    const http = async (url: string) => {
      calls.push(url)
      return { text: async () => '{"choices":[{"message":{"content":"ok"}}]}' } as { text(): Promise<string> }
    }
    await summarize(items, { model: 'deepseek-chat', apiKey: 'k', requirement: 'r' }, http)
    await summarize(items, { model: 'qwen-max', apiKey: 'k', requirement: 'r' }, http)
    await summarize(items, { model: 'glm-4', apiKey: 'k', requirement: 'r' }, http)
    expect(calls[0]).toContain('api.deepseek.com')
    expect(calls[1]).toContain('dashscope.aliyuncs.com')
    expect(calls[2]).toContain('open.bigmodel.cn')
  })

  test('explicit baseUrl overrides routing', async () => {
    const calls: string[] = []
    const http = async (url: string) => {
      calls.push(url)
      return { text: async () => '{"choices":[{"message":{"content":"ok"}}]}' } as { text(): Promise<string> }
    }
    await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r', baseUrl: 'https://my-relay.example.com/v1' }, http)
    expect(calls[0]).toBe('https://my-relay.example.com/v1/chat/completions')
  })

  test('throws a readable error when the http call fails', async () => {
    const http = async () => { throw new Error('network down') }
    await expect(summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r' }, http)).rejects.toThrow(/network down/)
  })
})

describe('testConnection', () => {
  test('returns ok on a valid response', async () => {
    const http = async () => ({ status: 200, text: async () => '{"choices":[{"message":{"content":"ok"}}]}' })
    const r = await testConnection({ model: 'deepseek-chat', apiKey: 'k' }, http)
    expect(r.ok).toBe(true)
    expect(r.detail).toContain('连接成功')
  })

  test('diagnoses a 401 as a key problem', async () => {
    const http = async () => ({ status: 401, text: async () => '{"error":{"message":"令牌已过期或验证不正确"}}' })
    const r = await testConnection({ model: 'deepseek-chat', apiKey: 'bad' }, http)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('401')
    expect(r.detail).toContain('Key')
  })

  test('rejects an empty key without calling the network', async () => {
    const http = async () => { throw new Error('should not be called') }
    const r = await testConnection({ model: 'deepseek-chat', apiKey: ' ' }, http)
    expect(r.ok).toBe(false)
    expect(r.detail).toContain('Key')
  })
})
