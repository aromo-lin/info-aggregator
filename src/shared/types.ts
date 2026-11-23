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

// 采集内容维度（标题/正文/图片/链接）
export type CollectField = 'title' | 'content' | 'image' | 'url'

// 筛选条件（可选填，站点有对应数据才生效）
export interface UrlFilter {
  minLikes: number | null // 最少点赞数（null=不限）
  minSales: number | null // 最少销量（电商，null=不限）
  timeRangeDays: number | null // 仅近 N 天（null=不限）
  category: string // 归类关键词（留空=不按归类筛选）
}

// 一个任务下的单个网址及其录入信息
export interface UrlEntry {
  id: string
  url: string // 必填
  loginType?: 'none' | 'qr' // 登录方式：无需登录 / 首次在采集浏览器里手动或扫码登录（之后自动记住）
  searchField?: string // 搜索字段：填入站内搜索框 / 平台标签
  filter?: UrlFilter // 筛选条件
  fields: CollectField[] // 需要采集的内容
}

// 任务级设置
export interface TaskSettings {
  dedup: boolean // 数据去重（默认 true）：同一批/历史已采集的条目跳过
}

export interface Source {
  id: string
  type: SourceType
  site?: string
  keywordOrUrl: string
  identityId: string | null
  config: ScrapeConfig
  seenItemIds: string[]
  // v2 扩展（旧数据缺省时由渲染层补默认值）
  name?: string
  urls?: UrlEntry[]
  settings?: TaskSettings
  order?: number
  // 运行期注入：当前 url 条目的搜索/筛选字段（来自 UrlEntry）
  searchField?: string
  filter?: UrlFilter
}

export interface Project {
  id: string
  name: string
  sourceIds: string[]
}

// 一次采集的记录：保存结果供回看，可单独清除
export interface RunRecord {
  id: string
  taskId: string
  taskName: string
  endedAt: string // ISO 时间
  items: ScrapedItem[]
}

export interface ScrapedItem {
  id: string
  sourceId: string
  title: string
  author: string
  date: string
  likes: number
  sales?: number
  url: string
  images: string[]
  videoCover?: string
  videoUrl?: string
  text: string
  comments: string[]
  blocked?: boolean
}

// 拟人限速配置（自用采集，宁可慢、不触发风控）
export interface RateConfig {
  enabled: boolean // 是否启用拟人限速
  minDelayMs: number // 每次操作最小随机间隔
  maxDelayMs: number // 每次操作最大随机间隔
  scrollSteps: number // 翻页/滚动的分段次数
}

export const DEFAULT_RATE: RateConfig = {
  enabled: true,
  minDelayMs: 3000,
  maxDelayMs: 8000,
  scrollSteps: 5,
}

export const DEFAULT_TASK_SETTINGS: TaskSettings = {
  dedup: true,
}

// 「生成AI报告」的默认提示词（用户没填时用它；也在输入框里作为浅灰占位展示）
// 版式由内置杂志风模板固定生成，这段提示词只影响 AI 对内容角度的提炼（摘要/金句/主题）
export const DEFAULT_AI_REPORT_PROMPT = `素材：已采集的时尚资讯（标题+正文+配图）
任务：提炼成一期时尚杂志的内容素材
要求：
1. 主题：根据全部资讯归纳一个简洁有力的本期主题（4~10字）
2. 每篇资讯：通顺的一句话摘要（25~45字，点明看点；正文很短或像笔记文案时改写成编辑点评，不要照抄#标签）+ 一句金句或看点（20字内）
3. 不虚构事实；语言克制、时尚杂志语感
4. 版式（封面/目录/每篇一页/图注/页脚）由程序模板完成，不需要你输出HTML`
