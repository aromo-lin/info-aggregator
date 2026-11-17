import type { ScrapedItem } from '../../shared/types'

export type HttpFn = (url: string, init?: RequestInit) => Promise<{ text(): Promise<string> }>

export interface SummarizeOpts {
  model: string
  apiKey: string
  requirement: string
}

const defaultHttp: HttpFn = (url, init) => fetch(url, init).then((r) => ({ text: () => r.text() }))

function buildPrompt(items: ScrapedItem[], requirement: string): string {
  const body = items
    .map((it) => `- 【${it.title}】${it.text || '(无正文)'}`)
    .join('\n')
  return `请根据以下资料做汇总整理。要求：${requirement}\n\n资料：\n${body}`
}

// 按 model 前缀路由到不同 provider。model 以 'claude' 开头走 Anthropic，'gpt'/'openai' 走 OpenAI。
export async function summarize(items: ScrapedItem[], opts: SummarizeOpts, http: HttpFn = defaultHttp): Promise<string> {
  const prompt = buildPrompt(items, opts.requirement)
  if (opts.model.startsWith('claude')) {
    const url = 'https://api.anthropic.com/v1/messages'
    const res = await http(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: opts.model, max_tokens: 2048, messages: [{ role: 'user', content: prompt }] }),
    })
    return await res.text()
  }
  const url = 'https://api.openai.com/v1/chat/completions'
  const res = await http(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify({ model: opts.model, messages: [{ role: 'user', content: prompt }] }),
  })
  return await res.text()
}
