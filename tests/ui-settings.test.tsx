// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Settings } from '../src/renderer/pages/Settings'

describe('Settings', () => {
  test('switching to api mode shows model/key inputs and hides them in export mode', async () => {
    const saveKey = vi.fn().mockResolvedValue(undefined)
    window.api = { saveKey, loadKey: vi.fn().mockResolvedValue(undefined) } as unknown as typeof window.api

    render(<Settings />)

    // 默认导出模式：没有「保存 key」按钮
    expect(screen.queryByText('保存 key')).toBeNull()

    fireEvent.click(screen.getByLabelText('API 模式'))
    expect(screen.getByText('保存 key')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('模型：'), { target: { value: 'claude-opus-5-5' } })
    fireEvent.change(screen.getByLabelText('API key：'), { target: { value: 'sk-test' } })
    fireEvent.click(screen.getByText('保存 key'))

    expect(saveKey).toHaveBeenCalledWith('default', 'sk-test')
  })
})
