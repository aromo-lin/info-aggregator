import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDataDir } from '../data-dir'

export interface Session {
  page: Page
  context: BrowserContext
  close(): Promise<void>
}

const CDP_URL = 'http://127.0.0.1:9222'

// 本机已装 Chrome 的可执行路径（不重新下载浏览器）
function chromePath(): string | null {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    process.env['CHROME_PATH'] || '',
  ]
  for (const c of candidates) if (c && existsSync(c)) return c
  return null
}

// 采集专用 profile：独立于用户日常浏览器，登录态存这里、越用越真实。
// 注意：新版 Chrome 禁止「默认 profile + 远程调试」，所以必须用独立 profile 才能 CDP 接管。
function collectionProfileDir(): string {
  const dir = join(resolveDataDir(), 'collection-profile')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function isCdpUp(): Promise<boolean> {
  try {
    const res = await fetch(`${CDP_URL}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

async function waitCdpUp(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isCdpUp()) return true
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function launchCollectionChrome(): boolean {
  const exe = chromePath()
  if (!exe) return false
  try {
    const child = spawn(
      exe,
      ['--remote-debugging-port=9222', `--user-data-dir=${collectionProfileDir()}`, '--no-first-run', '--no-default-browser-check'],
      { detached: true, stdio: 'ignore' },
    )
    child.unref()
    return true
  } catch {
    return false
  }
}

// 接管「采集专用 Chrome 实例」（本机已装 Chrome + 独立 profile，带调试端口）。
// 没有就启动一个；登录态持久化在该 profile，全程不下载新浏览器。
export async function launchSession(
  _legacyProfileDir?: string,
  onProgress: (msg: string) => void = () => {},
): Promise<Session> {
  if (!(await isCdpUp())) {
    onProgress('启动采集专用浏览器（用你本机的 Chrome，登录态保存在本地）…')
    if (!launchCollectionChrome()) {
      throw new Error('未找到本机 Chrome。请安装 Google Chrome，或设置环境变量 CHROME_PATH 指向你的浏览器。')
    }
    if (!(await waitCdpUp(15000))) {
      throw new Error('采集浏览器未能开启调试端口（9222）。请确认没有其它采集实例残留，或重启应用后重试。')
    }
  }

  const browser: Browser = await chromium.connectOverCDP(CDP_URL)
  const context = browser.contexts()[0] ?? (await browser.newContext())
  const page = await context.newPage()
  return {
    page,
    context,
    // 只关我们开的标签页，保留采集专用浏览器与登录态供下次复用
    close: async () => {
      await page.close().catch(() => {})
    },
  }
}

// 轮询登录指示元素；到上限返回 false（绝不抛异常、绝不无限挂起）。
export async function waitForLogin(page: Page, loginSelector: string, timeoutMs: number): Promise<boolean> {
  const stepMs = 2000
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if ((await page.locator(loginSelector).count()) > 0) return true
    await new Promise((r) => setTimeout(r, stepMs))
  }
  return false
}
