import { beforeEach, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createStore } from '../src/main/store/store'
import type { Project } from '../src/shared/types'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ia-store-'))
})

function cleanup(): void {
  rmSync(dir, { recursive: true, force: true })
}

describe('createStore', () => {
  test('persists a project and reads it back from a fresh store', () => {
    const project: Project = { id: 'p1', name: '时尚资讯', sourceIds: ['s1', 's2'] }

    const store1 = createStore(dir)
    store1.projects.upsert(project)

    const store2 = createStore(dir)
    const all = store2.projects.getAll()
    expect(all).toHaveLength(1)
    expect(all[0]).toEqual(project)

    cleanup()
  })

  test('remove deletes an entity', () => {
    const project: Project = { id: 'p1', name: 'x', sourceIds: [] }

    const store = createStore(dir)
    store.projects.upsert(project)
    store.projects.remove('p1')

    expect(store.projects.getAll()).toHaveLength(0)
    cleanup()
  })
})
