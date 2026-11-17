import { describe, expect, test } from 'vitest'
import { summarize } from '../src/main/ai/provider'
import type { ScrapedItem } from '../src/shared/types'

const items: ScrapedItem[] = [
  { id: '1', sourceId: 's', title: 't', author: 'a', date: '2026-11-01', likes: 1, url: 'u', images: [], text: '内容', comments: [] },
]

type HttpCall = { url: string; init?: RequestInit }

function fakeHttp(response: string): (url: string, init?: RequestInit) => Promise<{ text(): Promise<string> }> {
  return async (url, init) => ({ url, init, text: async () => response } as unknown as { text(): Promise<string> })
}

describe('summarize', () => {
  test('returns the text from the model response', async () => {
    const calls: HttpCall[] = []
    const http = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { text: async () => '{"result":"综述内容"}' } as { text(): Promise<string> }
    }
    const result = await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: '按点赞' }, http)
    expect(result).toBe('{"result":"综述内容"}')
    expect(calls[0].url).toContain('anthropic')
  })

  test('routes different model families to different providers', async () => {
    const calls: HttpCall[] = []
    const http = async (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return { text: async () => 'ok' } as { text(): Promise<string> }
    }
    await summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r' }, http)
    await summarize(items, { model: 'gpt-4o', apiKey: 'k', requirement: 'r' }, http)
    expect(calls[0].url).toContain('anthropic')
    expect(calls[1].url).toContain('openai')
  })

  test('throws a readable error when the http call fails', async () => {
    const http = async () => { throw new Error('network down') }
    await expect(summarize(items, { model: 'claude-sonnet-5-5', apiKey: 'k', requirement: 'r' }, http)).rejects.toThrow(/network down/)
  })
})
