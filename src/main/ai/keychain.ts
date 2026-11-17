import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function keyFile(): string {
  const dir = join(app.getPath('userData'), 'keys')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'aikeys.json')
}

type KeyMap = Record<string, string>

function readAll(): KeyMap {
  try {
    return JSON.parse(readFileSync(keyFile(), 'utf-8')) as KeyMap
  } catch {
    return {}
  }
}

export function saveKey(provider: string, key: string): void {
  const all = readAll()
  all[provider] = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(key).toString('base64')
    : key
  writeFileSync(keyFile(), JSON.stringify(all, null, 2))
}

export function loadKey(provider: string): string | undefined {
  const v = readAll()[provider]
  if (!v) return undefined
  if (!safeStorage.isEncryptionAvailable()) return v
  try {
    return safeStorage.decryptString(Buffer.from(v, 'base64'))
  } catch {
    return undefined
  }
}

export function hasStoredKey(provider: string): boolean {
  return existsSync(keyFile()) && readAll()[provider] != null
}
