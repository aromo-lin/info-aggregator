import type { Page } from 'playwright'

// 在站内搜索框里填关键词并回车，模拟人工搜索。
// 只选「可见」的输入框，优先有搜索 placeholder 的主搜索框；回车后等 URL 跳转或新内容出现，没跳转再补点搜索按钮。
export async function trySearch(page: Page, keyword: string): Promise<boolean> {
  const candidates = [
    'input[type="search"]',
    'input[placeholder*="搜索"]',
    'input[placeholder*="search" i]',
    'input[name="q"]',
    'input[name="query"]',
    'input[name="keyword"]',
    'input[name*="search" i]',
  ]
  const seen = new Set<unknown>()

  for (const sel of candidates) {
    const loc = page.locator(sel)
    const n = await loc.count().catch(() => 0)
    for (let i = 0; i < n; i++) {
      const input = loc.nth(i)
      try {
        const handle = await input.elementHandle()
        if (!handle || seen.has(handle)) continue
        seen.add(handle)
        if (!(await input.isVisible())) continue
        const box = await input.boundingBox()
        if (!box || box.width < 80) continue // 太窄的多半是隐藏/装饰输入框

        const before = page.url()
        await input.click({ timeout: 3000 })
        await input.fill('')
        await input.fill(keyword)
        await input.press('Enter')
        const navigated = await waitForSearchSettle(page, before)
        if (!navigated) {
          // 回车没触发跳转：找旁边的搜索按钮补点一下
          const clicked = await clickSearchButton(page)
          if (clicked) await waitForSearchSettle(page, before)
        }
        return true
      } catch {
        /* 换下一个输入框 */
      }
    }
  }
  return false
}

// 等搜索结果「真的变了」：URL 变化 / 新导航发生 / 链接数量明显增加；最多 ~15s
async function waitForSearchSettle(page: Page, beforeUrl: string): Promise<boolean> {
  const linksBefore = await page.locator('a[href]').count().catch(() => 0)
  const deadline = Date.now() + 15000
  let settled = false
  while (Date.now() < deadline) {
    if (page.url() !== beforeUrl) {
      settled = true
      break
    }
    await page.waitForTimeout(600)
  }
  await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {})
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  if (!settled) {
    const after = await page.locator('a[href]').count().catch(() => 0)
    settled = after > linksBefore + 3
  }
  // 再等懒加载渲染
  await page.waitForTimeout(1500)
  return settled
}

async function clickSearchButton(page: Page): Promise<boolean> {
  const btns = [
    'button:has-text("搜索")',
    'button:has-text("搜 索")',
    '[role="button"]:has-text("搜索")',
    'a:has-text("搜索")',
    'button[type="submit"]',
    '[class*="search"] button',
    '[class*="search-btn"]',
    '.search-button',
  ]
  for (const sel of btns) {
    try {
      const b = page.locator(sel).first()
      if ((await b.count()) > 0 && (await b.isVisible())) {
        await b.click({ timeout: 3000 })
        return true
      }
    } catch {
      /* 下一个 */
    }
  }
  return false
}
