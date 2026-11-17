export type SourceType = 'search' | 'fixed-url'
export type ContentType = 'image' | 'gif' | 'video' | 'text'
export type SortKey = 'likes' | 'latest'

export interface ScrapeConfig {
  count: number
  contentTypes: ContentType[]
  includeComments: boolean // 默认 false
  sort: SortKey
  timeRangeDays: number | null // null=不限；按 item.date 过滤
}

export interface Identity {
  id: string
  label: string
  site: string
  profileDir: string
}

export interface Source {
  id: string
  type: SourceType
  site: string
  keywordOrUrl: string
  identityId: string | null
  config: ScrapeConfig
  seenItemIds: string[]
}

export interface Project {
  id: string
  name: string
  sourceIds: string[]
}

export interface ScrapedItem {
  id: string
  sourceId: string
  title: string
  author: string
  date: string
  likes: number
  url: string
  images: string[]
  videoCover?: string
  videoUrl?: string
  text: string
  comments: string[]
  blocked?: boolean
}
