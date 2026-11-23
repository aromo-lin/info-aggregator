import type { Session } from '../browser/session'
import type { RateConfig, ScrapedItem, Source } from '../../shared/types'

export type Progress = { message: string }

export interface Recipe {
  site: string
  run(
    session: Session,
    source: Source,
    onProgress: (p: Progress) => void,
    rate: RateConfig,
  ): Promise<ScrapedItem[]>
}
