import { safeStorage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveDataDir } from '../data-dir'

function keyFile(): string {
  const dir = join(resolveDataDir(), 'keys')
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

function encrypt(v: string): string {
  return safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(v).toString('base64') : v
}

function decrypt(v: string): string {
  if (!safeStorage.isEncryptionAvailable()) return v
  return safeStorage.decryptString(Buffer.from(v, 'base64'))
}

export function saveKey(provider: string, key: string): void {
  const all = readAll()
  // 复制粘贴常带入首尾空格/换行，先剥掉再加密存储
  all[provider] = encrypt(key.trim())
  writeFileSync(keyFile(), JSON.stringify(all, null, 2))
}

export function loadKey(provider: string): string | undefined {
  const v = readAll()[provider]
  if (!v) return undefined
  try {
    return decrypt(v)
  } catch {
    return undefined
  }
}
