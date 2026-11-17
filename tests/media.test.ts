import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cacheMedia } from '../src/main/media/cache'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ia-media-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('cacheMedia', () => {
  test('downloads successful urls and keeps original url on failure', async () => {
    const fetchFn = async (url: string) => {
      if (url.includes('fail')) throw new Error('boom')
      return { arrayBuffer: async () => new TextEncoder().encode('imgdata').buffer }
    }
    const result = await cacheMedia(['https://x.com/a.jpg', 'https://x.com/fail.jpg'], dir, fetchFn)
    expect(result).toHaveLength(2)
    expect(result[0]).not.toBe('https://x.com/a.jpg')
    expect(existsSync(result[0])).toBe(true)
    expect(result[1]).toBe('https://x.com/fail.jpg')
  })
})
