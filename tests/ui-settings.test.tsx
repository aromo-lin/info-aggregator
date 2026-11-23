// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Settings } from '../src/renderer/pages/Settings'
import { DEFAULT_RATE } from '../src/shared/types'

describe('Settings', () => {
  test('renders rate config and saves via saveRateConfig', async () => {
    const saveRateConfig = vi.fn().mockResolvedValue(undefined)
    window.api = {
      saveRateConfig,
      saveKey: vi.fn().mockResolvedValue(undefined),
      loadKey: vi.fn().mockResolvedValue(undefined),
      getSetting: vi.fn().mockResolvedValue(undefined),
      saveSetting: vi.fn().mockResolvedValue(undefined),
    } as unknown as typeof window.api

    render(<Settings rate={DEFAULT_RATE} onRateChange={() => {}} />)

    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(true)

    fireEvent.click(screen.getByText('保存限速设置'))
    expect(saveRateConfig).toHaveBeenCalled()
  })
})
