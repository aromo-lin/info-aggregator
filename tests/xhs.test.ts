import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseCards, parseNote } from '../src/main/recipes/xiaohongshu'

const fixture = (name: string): string =>
  readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8')

describe('parseCards', () => {
  test('extracts cards with id, likes from a search list', () => {
    const cards = parseCards(fixture('xhs-search.html'))
    expect(cards.length).toBeGreaterThan(0)
    expect(cards[0].id).toMatch(/^[0-9a-f]{10,}$/)
    expect(cards[0].likes).toBeGreaterThan(0)
    expect(cards[0].title).toBeTruthy()
  })

  test('returns empty array on empty html', () => {
    expect(parseCards('')).toEqual([])
  })
})

describe('parseNote', () => {
  test('extracts text and comments from a normal note', () => {
    const note = parseNote(fixture('xhs-note.html'))
    expect(note.text).toBeTruthy()
    expect(note.blocked).toBeFalsy()
    expect(note.comments.length).toBeGreaterThan(0)
  })

  test('marks blocked when the note shows the anti-bot wall', () => {
    const note = parseNote(fixture('xhs-note-blocked.html'))
    expect(note.blocked).toBe(true)
  })
})
