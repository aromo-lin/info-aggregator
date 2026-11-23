import { useState } from 'react'
import type { CollectField, ScrapeConfig, Source, TaskSettings, UrlEntry, UrlFilter } from '../../shared/types'
import { DEFAULT_TASK_SETTINGS } from '../../shared/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const ALL_FIELDS: CollectField[] = ['title', 'content', 'image', 'url']
const FIELD_LABELS: Record<CollectField, string> = {
  title: '标题',
  content: '内容',
  image: '图片',
  url: '链接',
}

function defaultFilter(): UrlFilter {
  return { minLikes: null, minSales: null, timeRangeDays: null, category: '' }
}

// 老数据兼容：把旧的账号密码登录方式迁移为「在采集浏览器里登录」
function normalizeEntry(u: UrlEntry): UrlEntry {
  const raw = u as UrlEntry & { loginType?: string }
  const loginType = raw.loginType === 'qr' ? 'qr' : 'none'
  return {
    id: u.id,
    url: u.url,
    loginType,
    searchField: u.searchField ?? '',
    filter: u.filter ?? defaultFilter(),
    fields: u.fields?.length ? u.fields : ['title', 'content', 'image', 'url'],
  }
}

function newEntry(): UrlEntry {
  return { id: genId(), url: '', loginType: 'none', searchField: '', filter: defaultFilter(), fields: ['title', 'content', 'image', 'url'] }
}

export function TaskEditor(props: {
  initial: Source | null
  running: boolean
  defaultCount: number
  onCancel?: () => void
  onSave: (task: Source) => Promise<void>
  onCollect: (task: Source) => Promise<void>
}): React.JSX.Element {
  const { initial, running, defaultCount, onCancel, onSave, onCollect } = props

  const [name, setName] = useState(initial?.name || '')
  const [urls, setUrls] = useState<UrlEntry[]>(() => {
    if (initial?.urls && initial.urls.length) return initial.urls.map(normalizeEntry)
    return [newEntry()]
  })
  const [config, setConfig] = useState<ScrapeConfig>(
    initial?.config || { count: defaultCount, contentTypes: ['image', 'text'], includeComments: false, sort: 'likes', timeRangeDays: null },
  )
  const [settings, setSettings] = useState<TaskSettings>({ ...DEFAULT_TASK_SETTINGS, ...(initial?.settings || {}) })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const updateEntry = (id: string, patch: Partial<UrlEntry>): void => {
    setUrls((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)))
  }
  const removeEntry = (id: string): void => {
    setUrls((prev) => (prev.length > 1 ? prev.filter((u) => u.id !== id) : prev))
  }
  const addEntry = (): void => setUrls((prev) => [...prev, newEntry()])

  const toggleField = (id: string, f: CollectField): void => {
    setUrls((prev) =>
      prev.map((u) => {
        if (u.id !== id) return u
        const has = u.fields.includes(f)
        return { ...u, fields: has ? u.fields.filter((x) => x !== f) : [...u.fields, f] }
      }),
    )
  }

  const updateFilter = (id: string, patch: Partial<UrlFilter>): void => {
    setUrls((prev) => prev.map((u) => (u.id === id ? { ...u, filter: { ...(u.filter ?? defaultFilter()), ...patch } } : u)))
  }

  const buildTask = async (): Promise<Source | null> => {
    const trimmed = urls.map((u) => ({ ...u, url: (u.url || '').trim() }))
    if (trimmed.length === 0 || trimmed.some((u) => !u.url)) {
      window.alert('每个网址的「网址」为必填项')
      return null
    }
    const firstUrl = trimmed[0].url
    const task: Source = {
      id: initial?.id || genId(),
      type: 'fixed-url',
      keywordOrUrl: firstUrl,
      identityId: initial?.identityId ?? null,
      config,
      seenItemIds: initial?.seenItemIds ?? [],
      name: name.trim() || firstUrl || '未命名任务',
      urls: trimmed,
      settings,
      order: typeof initial?.order === 'number' ? initial.order : Date.now(),
    }
    return task
  }

  const handleSave = async (): Promise<void> => {
    setBusy(true)
    try {
      const task = await buildTask()
      if (task) await onSave(task)
    } finally {
      setBusy(false)
    }
  }

  const handleCollect = async (): Promise<void> => {
    setBusy(true)
    try {
      const task = await buildTask()
      if (task) await onCollect(task)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="task-editor">
      <div className="task-editor-head">
        <div className="field" style={{ flex: 1 }}>
          <label>任务名</label>
          <input
            className="name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：时尚资讯采集"
          />
        </div>
        <div className="head-actions">
          <button className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>设置</button>
          <button className="btn btn-ghost" onClick={addEntry}>+ 添加网址</button>
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label>采集条数</label>
        <input
          type="number"
          min={1}
          max={200}
          value={config.count}
          onChange={(e) => setConfig({ ...config, count: Math.max(1, Number(e.target.value) || 1) })}
        />
        <span className="hint" style={{ margin: 0 }}>每个网址最多采集的条目数（会逐条点进去读详情）</span>
      </div>

      {urls.map((u, idx) => (
        <div className="url-card" key={u.id}>
          <div className="url-card-head">
            <span className="url-card-title">网址 {idx + 1}</span>
            {urls.length > 1 && (
              <button className="icon-btn del" onClick={() => removeEntry(u.id)}>✕ 删除</button>
            )}
          </div>

          <div className="field">
            <label>
              网址 <em className="req">*</em>
            </label>
            <input
              type="text"
              value={u.url}
              onChange={(e) => updateEntry(u.id, { url: e.target.value })}
              placeholder="https://…"
            />
          </div>

          <div className="field">
            <label>登录方式</label>
            <select
              value={u.loginType || 'none'}
              onChange={(e) => updateEntry(u.id, { loginType: e.target.value as UrlEntry['loginType'] })}
            >
              <option value="none">无需登录</option>
              <option value="qr">需要登录（首次在采集浏览器里手动/扫码）</option>
            </select>
          </div>

          {u.loginType === 'qr' && (
            <div className="hint" style={{ marginLeft: 130 }}>
              首次运行会弹出采集浏览器，等你在里面登录一次；登录态保存在本机，下次免登录。
            </div>
          )}

          <div className="field">
            <label>搜索字段</label>
            <input
              type="text"
              value={u.searchField || ''}
              onChange={(e) => updateEntry(u.id, { searchField: e.target.value })}
              placeholder="在站内搜索框输入的关键词"
            />
          </div>

          <div className="field">
            <label>归类关键词</label>
            <input
              type="text"
              value={u.filter?.category || ''}
              onChange={(e) => updateFilter(u.id, { category: e.target.value })}
              placeholder="按标题/正文包含的词归类，留空不筛"
            />
          </div>

          <div className="field-row">
            <div className="field">
              <label>最少点赞</label>
              <input
                type="number"
                min={0}
                value={u.filter?.minLikes ?? ''}
                onChange={(e) => updateFilter(u.id, { minLikes: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                placeholder="不限"
              />
            </div>
            <div className="field">
              <label>最少销量</label>
              <input
                type="number"
                min={0}
                value={u.filter?.minSales ?? ''}
                onChange={(e) => updateFilter(u.id, { minSales: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
                placeholder="不限"
              />
            </div>
            <div className="field">
              <label>上传时间</label>
              <select
                value={u.filter?.timeRangeDays ?? ''}
                onChange={(e) => updateFilter(u.id, { timeRangeDays: e.target.value === '' ? null : Number(e.target.value) })}
              >
                <option value="">不限</option>
                <option value={7}>近 7 天</option>
                <option value={30}>近 30 天</option>
                <option value={90}>近 90 天</option>
                <option value={365}>近一年</option>
              </select>
            </div>
          </div>
          <div className="hint" style={{ marginLeft: 130, marginTop: -4, marginBottom: 10 }}>
            点赞 / 销量 / 时间这些只在该网站能识别到对应数据时才筛选，识别不到就自动跳过（都不是必填）。
          </div>

          <div className="field">
            <label>采集内容</label>
            <div className="checks">
              {ALL_FIELDS.map((f) => (
                <label key={f} className="check">
                  <input type="checkbox" checked={u.fields.includes(f)} onChange={() => toggleField(u.id, f)} />
                  {FIELD_LABELS[f]}
                </label>
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className="task-editor-foot">
        <span className="hint">任务将按网址从上到下串行采集，不并发，模拟人工操作，安全优先</span>
        <div className="foot-actions">
          {onCancel && (
            <button className="btn btn-ghost" disabled={running || busy} onClick={onCancel}>
              取消
            </button>
          )}
          <button className="btn btn-ghost" disabled={running || busy} onClick={() => void handleSave()}>
            {busy ? '保存中…' : '保存'}
          </button>
          <button className="btn btn-primary" disabled={running || busy} onClick={() => void handleCollect()}>
            {running ? '采集中…' : '开始采集'}
          </button>
        </div>
      </div>

      {settingsOpen && <SettingsModal settings={settings} onChange={setSettings} onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

function SettingsModal(props: {
  settings: TaskSettings
  onChange: (s: TaskSettings) => void
  onClose: () => void
}): React.JSX.Element {
  const { settings, onChange, onClose } = props
  const set = (patch: Partial<TaskSettings>): void => onChange({ ...settings, ...patch })

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>任务设置</span>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <label className="switch">
            <input type="checkbox" checked={settings.dedup} onChange={(e) => set({ dedup: e.target.checked })} />
            数据去重（跳过已采集过的条目）
          </label>
          <div className="hint" style={{ marginTop: 10 }}>
            关闭后，同一网址里的重复条目、以及以前采集过的条目都会被保留。
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  )
}
