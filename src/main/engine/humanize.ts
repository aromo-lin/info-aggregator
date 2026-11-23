import type { Page } from 'playwright'
import type { RateConfig } from '../../shared/types'

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function randomBetween(min: number, max: number): number {
  if (max <= min) return min
  return min + Math.floor(Math.random() * (max - min + 1))
}

// 拟人停顿：启用时按 [minDelayMs, maxDelayMs] 随机等待；未启用时给一个很短的随机停顿。
export async function humanDelay(rate: RateConfig): Promise<void> {
  if (rate.enabled) {
    await sleep(randomBetween(rate.minDelayMs, rate.maxDelayMs))
  } else {
    await sleep(randomBetween(200, 600))
  }
}

// 拟人滚动：分多段小幅滚动，段间随机停顿，模拟人慢慢往下看。
export async function humanScroll(page: Page, rate: RateConfig): Promise<void> {
  const steps = Math.max(1, rate.scrollSteps)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, randomBetween(300, 900))
    await humanDelay(rate)
  }
}

// 拟人鼠标移动：分段逼近目标点，避免瞬间跳变。
export async function humanMove(page: Page, x: number, y: number, rate: RateConfig): Promise<void> {
  const steps = 6
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(Math.round((x * i) / steps), Math.round((y * i) / steps), { steps: 3 })
    await sleep(randomBetween(30, 80))
  }
}
