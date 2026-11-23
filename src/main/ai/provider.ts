import type { ScrapedItem } from '../../shared/types'

export type HttpFn = (url: string, init?: RequestInit) => Promise<{ text(): Promise<string>; status?: number }>

export interface SummarizeOpts {
  model: string
  apiKey: string
  requirement: string
  baseUrl?: string
}

// 主进程优先走 Electron net.fetch：复用 Chromium 网络栈、自动跟随系统代理
// （Node 自带的 fetch 不认系统代理，国内环境下会 fetch failed；测试环境没有 electron，退回全局 fetch）
let electronNet: typeof import('electron')['net'] | null | undefined
async function getDefaultHttp(): Promise<HttpFn> {
  if (electronNet === undefined) {
    try {
      const mod = (await import('electron')) as unknown as { net?: typeof import('electron')['net'] }
      electronNet = mod.net ?? null
    } catch {
      electronNet = null
    }
  }
  if (electronNet?.fetch) {
    return async (url, init) => {
      const res = await electronNet!.fetch(url, init)
      return { text: () => res.text(), status: res.status }
    }
  }
  return async (url, init) => {
    const res = await fetch(url, init)
    return { text: () => res.text(), status: res.status }
  }
}

function buildPrompt(items: ScrapedItem[], requirement: string): string {
  const body = items
    .map((it) => `- 【${it.title}】${it.text || '(无正文)'}`)
    .join('\n')
  return `请根据以下资料做汇总整理。要求：${requirement}\n\n资料：\n${body}`
}

// 国内模型的 OpenAI 兼容端点：按模型名自动路由；设置里填了「接口地址」则以它为准（无需代理直连）
const DOMESTIC_BASES: Array<[RegExp, string]> = [
  [/deepseek/i, 'https://api.deepseek.com/v1'],
  [/qwen|通义|千问/i, 'https://dashscope.aliyuncs.com/compatible-mode/v1'],
  [/glm|chatglm|智谱/i, 'https://open.bigmodel.cn/api/paas/v4'],
  [/kimi|moonshot/i, 'https://api.moonshot.cn/v1'],
  [/minimax|abab/i, 'https://api.minimax.chat/v1'],
]

function chatUrlFor(model: string, baseUrl?: string): string {
  const b = (baseUrl || '').trim().replace(/\/+$/, '')
  if (b) return `${b}/chat/completions`
  if (model.startsWith('claude')) return 'https://api.anthropic.com/v1/messages'
  for (const [re, base] of DOMESTIC_BASES) {
    if (re.test(model)) return `${base}/chat/completions`
  }
  return 'https://api.openai.com/v1/chat/completions'
}

// 按 model 前缀路由到不同 provider：填了接口地址（或识别出国内模型）走 OpenAI 兼容协议，
// 否则 claude 开头走 Anthropic，其余走 OpenAI。
async function callModel(model: string, apiKey: string, prompt: string, maxTokens: number, http?: HttpFn, baseUrl?: string): Promise<string> {
  const doHttp = http ?? (await getDefaultHttp())
  const post = async (url: string, init: RequestInit): Promise<string> => {
    let res
    try {
      res = await doHttp(url, init)
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      throw new Error(`无法连接 AI 接口（${url}）：${detail}。请确认网络/代理已开启，应用内请求需要能访问该地址。`)
    }
    const raw = await res.text()
    if (typeof res.status === 'number' && res.status >= 400) {
      throw new Error(`AI 接口返回 ${res.status}：${raw.slice(0, 300)}`)
    }
    return raw
  }

  if (model.startsWith('claude') && !(baseUrl || '').trim()) {
    const raw = await post('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }),
    })
    return extractClaudeText(raw)
  }
  const raw = await post(chatUrlFor(model, baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }),
  })
  return extractOpenAiText(raw)
}

export async function summarize(items: ScrapedItem[], opts: SummarizeOpts, http?: HttpFn): Promise<string> {
  return callModel(opts.model, opts.apiKey, buildPrompt(items, opts.requirement), 2048, http, opts.baseUrl)
}

// —— AI 内容提炼：版式由内置杂志模板完成，AI 只负责 主题/摘要/金句 —— //

export interface ReportOpts {
  model: string
  apiKey: string
  requirement: string
  baseUrl?: string
}

export interface EditorialItem {
  summary: string
  quote: string
}

export interface Editorial {
  theme: string
  subtitle: string
  items: EditorialItem[]
}

const EDITORIAL_SYSTEM = '你是资深时尚杂志主编。根据采集到的资讯，为每篇提炼摘要和金句，并归纳本期主题。只输出 JSON，不要输出任何其他文字。'

function buildEditorialPrompt(items: ScrapedItem[], requirement: string): string {
  const body = items
    .map((it, i) => `${i + 1}. 标题：${it.title || '(无标题)'}\n   正文：${(it.text || '').slice(0, 1200)}`)
    .join('\n')
  return `${EDITORIAL_SYSTEM}

用户要求：
${requirement}

资讯列表（共 ${items.length} 篇）：
${body}

严格输出如下 JSON（items 数组长度必须与资讯数一致、顺序对应；正文短或像笔记文案时，摘要改写成通顺的一句话编辑点评，不要照抄标签）：
{"theme":"本期主题(4~10字)","subtitle":"一句副标题","items":[{"summary":"通顺的一句话摘要(25~45字)","quote":"金句或看点(20字内)"}]}`
}

export async function generateEditorial(items: ScrapedItem[], opts: ReportOpts, http?: HttpFn): Promise<Editorial> {
  const raw = await callModel(opts.model, opts.apiKey, buildEditorialPrompt(items, opts.requirement), 2500, http, opts.baseUrl)
  const fallback: Editorial = {
    theme: '时尚资讯精选',
    subtitle: '',
    items: items.map((it) => ({ summary: cleanCaption(it.text).slice(0, 60), quote: '' })),
  }
  try {
    const jsonText = raw.match(/\{[\s\S]*\}/)?.[0] ?? raw
    const data = JSON.parse(jsonText) as Partial<Editorial>
    return {
      theme: data.theme || fallback.theme,
      subtitle: data.subtitle || '',
      items: items.map((_, i) => ({
        summary: data.items?.[i]?.summary || fallback.items[i].summary,
        quote: data.items?.[i]?.quote || '',
      })),
    }
  } catch {
    return fallback
  }
}

// 兜底摘要：去掉 #话题标签、表情方括号、多余空白
function cleanCaption(text: string): string {
  return (text || '')
    .replace(/#[^#\s]+/g, '')
    .replace(/\[[^\[\]]{1,12}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// 设置页「测试连接」：发一个最小请求验证 模型/接口地址/Key 是否可用，失败时给出可操作的中文诊断
export async function testConnection(opts: { model: string; apiKey: string; baseUrl?: string }, http?: HttpFn): Promise<{ ok: boolean; detail: string }> {
  if (!opts.apiKey.trim()) return { ok: false, detail: 'API Key 是空的，请先填写' }
  if (!opts.model.trim()) return { ok: false, detail: '模型名是空的，请先填写' }
  try {
    await callModel(opts.model.trim(), opts.apiKey.trim(), '回复 ok', 16, http, opts.baseUrl)
    const endpoint = opts.model.startsWith('claude') && !(opts.baseUrl || '').trim()
      ? 'https://api.anthropic.com/v1/messages'
      : chatUrlFor(opts.model, opts.baseUrl)
    return { ok: true, detail: `连接成功！模型「${opts.model}」可用（${endpoint}）` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    let advice = ''
    if (/401|403|令牌|Unauthorized|authentication|invalid_api_key/i.test(msg)) {
      advice = '—— Key 无效/过期或与平台不匹配：请确认这个 Key 就是当前接口所属平台发放的，且复制完整、没过期。'
    } else if (/404/.test(msg)) {
      advice = '—— 接口或模型名不对：检查「接口地址」是否多了/少了路径，模型名是否与平台文档一致。'
    } else if (/429|余额|quota|insufficient/i.test(msg)) {
      advice = '—— 额度不足或被限流：去平台控制台查余额/用量。'
    } else if (/无法连接|fetch|network|ECONNREFUSED|timeout/i.test(msg)) {
      advice = '—— 网络不通：国内模型一般不需要代理；国外模型需开启代理后重试。'
    }
    return { ok: false, detail: `${msg} ${advice}`.trim() }
  }
}

// 从 Claude Messages API 响应里取正文（解析失败则原样返回）
function extractClaudeText(raw: string): string {
  try {
    const data = JSON.parse(raw) as { content?: Array<{ type?: string; text?: string }> }
    const block = data.content?.find((b) => b.type === 'text')
    return block?.text ?? raw
  } catch {
    return raw
  }
}

// 从 OpenAI Chat Completions 响应里取正文（解析失败则原样返回）
function extractOpenAiText(raw: string): string {
  try {
    const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    return data.choices?.[0]?.message?.content ?? raw
  } catch {
    return raw
  }
}
