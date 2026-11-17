import { chromium, type BrowserContext, type Page } from 'playwright'

export interface Session {
  page: Page
  context: BrowserContext
  close(): Promise<void>
}

// 用 Playwright 自带的内核 + 一个按身份隔离的持久化 profile 启动真实可见浏览器。
export async function launchSession(profileDir: string): Promise<Session> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
    args: ['--start-maximized'],
  })
  const page = context.pages()[0] ?? (await context.newPage())
  return {
    page,
    context,
    close: () => context.close(),
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
