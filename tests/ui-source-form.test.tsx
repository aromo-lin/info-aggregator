// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SourceEditor } from '../src/renderer/pages/Projects'
import type { Project } from '../src/shared/types'

const project: Project = { id: 'p1', name: '时尚资讯', sourceIds: [] }

function setupApi(upsertSource = vi.fn()) {
  window.api = {
    upsertSource,
    upsertProject: vi.fn(),
  } as unknown as typeof window.api
}

describe('SourceEditor', () => {
  test('includeComments is unchecked by default', () => {
    setupApi()
    render(<SourceEditor project={project} sources={[]} identities={[]} onChanged={async () => {}} />)
    const checkbox = screen.getByLabelText('抓评论') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  test('submits the entered values to upsertSource', () => {
    const upsertSource = vi.fn().mockResolvedValue(undefined)
    setupApi(upsertSource)
    render(<SourceEditor project={project} sources={[]} identities={[]} onChanged={async () => {}} />)

    fireEvent.change(screen.getByLabelText('关键词/网址：'), { target: { value: '秋冬穿搭' } })
    fireEvent.change(screen.getByLabelText('抓取条数：'), { target: { value: '20' } })
    fireEvent.click(screen.getByText('添加信息源'))

    expect(upsertSource).toHaveBeenCalled()
    const arg = upsertSource.mock.calls[0][0]
    expect(arg.keywordOrUrl).toBe('秋冬穿搭')
    expect(arg.config.count).toBe(20)
    expect(arg.config.includeComments).toBe(false)
  })
})
