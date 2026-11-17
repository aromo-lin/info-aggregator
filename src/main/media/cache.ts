import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'

type FetchFn = (url: string) => Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>

const defaultFetch: FetchFn = (url) => fetch(url).then((r) => r.arrayBuffer().then((buf) => ({ arrayBuffer: () => Promise.resolve(buf) })))

export async function cacheMedia(urls: string[], destDir: string, fetchFn: FetchFn = defaultFetch): Promise<string[]> {
  mkdirSync(destDir, { recursive: true })
  const out: string[] = []
  for (const url of urls) {
    try {
      const buf = await fetchFn(url)
      const ab = await buf.arrayBuffer()
      const hash = createHash('md5').update(url).digest('hex').slice(0, 12)
      const ext = extname(basename(new URL(url).pathname)) || '.img'
      const file = join(destDir, `${hash}${ext}`)
      writeFileSync(file, Buffer.from(ab))
      out.push(file)
    } catch {
      out.push(url) // 下载失败保留原 URL
    }
  }
  return out
}
