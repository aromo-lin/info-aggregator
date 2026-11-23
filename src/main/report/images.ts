import { mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

// 把远程图片下载成本地文件：PDF 内嵌用 file:// 引用，避免防盗链裂图；失败时保留原 URL
export class ImageLocalizer {
  private cache = new Map<string, Promise<string>>()

  constructor(private dir: string) {}

  async localizeAll(urls: string[]): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    // 有限并发，避免一次性打爆
    const queue = [...new Set(urls.filter((u) => /^https?:\/\//i.test(u)))]
    const workers = Array.from({ length: 4 }, async () => {
      for (;;) {
        const u = queue.shift()
        if (!u) return
        await this.localize(u).catch(() => {})
      }
    })
    await Promise.all(workers)
  }

  resolve(url: string): string {
    // localizeAll 完成后同步取缓存值（已 resolve 的 Promise 值存这里）
    return this.resolved.get(url) ?? url
  }

  private resolved = new Map<string, string>()

  private localize(url: string): Promise<string> {
    const existing = this.cache.get(url)
    if (existing) return existing
    const p = (async () => {
      const http = await getHttp()
      const res = await http(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
          accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
          referer: refererFor(url),
        },
      })
      const buf = Buffer.from(await res.arrayBuffer())
      // 太小的响应基本是占位图/防盗链拦截页，忽略
      if (buf.length < 800) return url
      const ext = extFor(url, res.headers.get('content-type') || '')
      const name = createHash('md5').update(url).digest('hex').slice(0, 20) + ext
      const file = join(this.dir, name)
      await writeFile(file, buf)
      const local = 'file://' + file
      this.resolved.set(url, local)
      return local
    })().catch(() => url)
    this.cache.set(url, p)
    return p
  }
}

function extFor(url: string, contentType: string): string {
  if (/png/i.test(contentType) || /\.png(\?|$)/i.test(url)) return '.png'
  if (/webp/i.test(contentType) || /\.webp(\?|$)/i.test(url)) return '.webp'
  if (/gif/i.test(contentType) || /\.gif(\?|$)/i.test(url)) return '.gif'
  return '.jpg'
}

function refererFor(url: string): string {
  if (/xhscdn\.com|xiaohongshu\.com/i.test(url)) return 'https://www.xiaohongshu.com/'
  if (/selfimg\.com\.cn|vogue\.com\.cn/i.test(url)) return 'https://www.vogue.com.cn/'
  try {
    return new URL(url).origin + '/'
  } catch {
    return ''
  }
}

type HttpLike = (url: string, init?: RequestInit) => Promise<Response>

let electronNetFetch: HttpLike | null | undefined
async function getHttp(): Promise<HttpLike> {
  if (electronNetFetch === undefined) {
    try {
      const mod = (await import('electron')) as unknown as { net?: { fetch: HttpLike } }
      electronNetFetch = mod.net?.fetch ?? null
    } catch {
      electronNetFetch = null
    }
  }
  return electronNetFetch ?? ((url, init) => fetch(url, init))
}
