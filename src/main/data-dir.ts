import { app } from 'electron'

// 统一使用系统 userData 目录（dev 与打包后都一致）：
// macOS 下为 ~/Library/Application Support/info-aggregator
export function resolveDataDir(): string {
  return app.getPath('userData')
}
