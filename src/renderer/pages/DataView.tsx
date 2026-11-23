import { useEffect, useMemo, useState } from 'react'
import { DEFAULT_AI_REPORT_PROMPT } from '../../shared/types'
import type { ExportFormat } from '../../shared/api'
import type { ScrapedItem } from '../../shared/types'

type Field = 'all' | 'title' | 'author' | 'text' | 'url'

const EXPORT_OPTIONS: Array<{ value: ExportFormat; label: string }> = [
  { value: 'xlsx', label: 'Excel(*.xlsx)' },
  { value: 'csv', label: 'CSV(*.csv)' },
  { value: 'md', label: 'Markdown(*.md)' },
  { value: 'html', label: 'HTML(*.html)' },
  { value: 'txt', label: 'TXT(*.txt)' },
]

export function DataView(props: {
  items: ScrapedItem[]
  log: string[]
  running: boolean
  stopping?: boolean
  onStop: () => void
  viewingLabel?: string
}): React.JSX.Element {
  const { items, log, running, stopping, onStop, viewingLabel } = props
  const [kw, setKw] = useState('')
  const [field, setField] = useState<Field>('all')
  const [onlyImage, setOnlyImage] = useState(false)
  const [exported, setExported] = useState<string | null>(null)
  const [expErr, setExpErr] = useState('')
  // 行勾选：key = id|url（空则行号兜底）；不勾任何行=默认全部
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 统一导出弹窗：先选格式，点导出后再选保存位置
  const [expOpen, setExpOpen] = useState(false)
  const [expFmt, setExpFmt] = useState<ExportFormat>('xlsx')
  const [exporting, setExporting] = useState(false)
  // AI 报告弹窗：提示词留空则用默认的 A4 图文排版规则
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiErr, setAiErr] = useState('')
  const [aiPath, setAiPath] = useState<string | null>(null)

  const keyOf = (it: ScrapedItem, i: number): string => it.id || it.url || `row-${i}`

  // 换一批数据（新采集/切换记录）时清空勾选
  useEffect(() => {
    setSelected(new Set())
  }, [items])

  const filtered = useMemo(() => {
    let out = items
    if (onlyImage) out = out.filter((it) => it.images.length > 0)
    const k = kw.trim().toLowerCase()
    if (k) {
      out = out.filter((it) => {
        const v =
          field === 'all'
            ? `${it.title} ${it.author} ${it.text} ${it.url}`
            : field === 'title'
              ? it.title
              : field === 'author'
                ? it.author
                : field === 'text'
                  ? it.text
                  : it.url
        return v.toLowerCase().includes(k)
      })
    }
    return out
  }, [items, kw, field, onlyImage])

  // 勾选了就用勾选的（在筛选结果内），否则用全部筛选结果
  const chosen = useMemo(() => {
    if (selected.size === 0) return filtered
    return filtered.filter((it, i) => selected.has(keyOf(it, i)))
  }, [filtered, selected])

  const allChecked = filtered.length > 0 && filtered.every((it, i) => selected.has(keyOf(it, i)))
  const toggleAll = (): void => {
    if (allChecked) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((it, i) => keyOf(it, i))))
    }
  }
  const toggleOne = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const imgCount = items.reduce((n, it) => n + it.images.length, 0)

  const doExport = async (): Promise<void> => {
    setExporting(true)
    setExported(null)
    setExpErr('')
    try {
      const path = await window.api.exportItems(chosen, expFmt)
      if (path) {
        setExported(path)
        setExpOpen(false)
      }
    } catch (e) {
      setExpErr(`导出失败：${String(e)}`)
    } finally {
      setExporting(false)
    }
  }

  const openAiModal = (): void => {
    setAiErr('')
    setAiPrompt('')
    setAiOpen(true)
  }

  const doAiReport = async (): Promise<void> => {
    setAiBusy(true)
    setAiErr('')
    try {
      const apiKey = (await window.api.loadKey('default')) || ''
      if (!apiKey) {
        setAiErr('还没有配置 AI，请先到「设置」里填写模型和 API Key，保存后再来生成。')
        return
      }
      const path = await window.api.aiReport(chosen, aiPrompt.trim() || DEFAULT_AI_REPORT_PROMPT)
      if (path) {
        setAiPath(path)
        setAiOpen(false)
      }
    } catch (e) {
      setAiErr(`生成失败：${String(e)}`)
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="data-view">
      <div className="stats">
        <div className="stat-card">
          <div className="label">采集结果</div>
          <div className="value">{items.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">运行状态</div>
          <div className="value">{running ? '采集中' : '空闲'}</div>
        </div>
        <div className="stat-card">
          <div className="label">图片数</div>
          <div className="value">{imgCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">筛选后</div>
          <div className="value">{filtered.length}</div>
        </div>
      </div>

      {viewingLabel && <div className="viewing-banner">{viewingLabel}</div>}

      {running && (
        <div className="toolbar">
          <button className="btn btn-ghost" disabled={stopping} onClick={onStop}>
            {stopping ? '停止中…' : '停止'}
          </button>
          <span className="hint" style={{ margin: 0 }}>采集中，浏览器窗口会自动弹出，请勿手动关闭</span>
        </div>
      )}

      {log.length > 0 && <div className="log-box">{log.join('\n')}</div>}

      <div className="toolbar">
        <select value={field} onChange={(e) => setField(e.target.value as Field)}>
          <option value="all">全部字段</option>
          <option value="title">标题</option>
          <option value="author">作者</option>
          <option value="text">正文</option>
          <option value="url">链接</option>
        </select>
        <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="输入关键词筛选" />
        <label className="switch" style={{ fontSize: 13 }}>
          <input type="checkbox" checked={onlyImage} onChange={(e) => setOnlyImage(e.target.checked)} />
          仅看有图片
        </label>
        <button className="btn btn-ghost" disabled={chosen.length === 0} onClick={() => setExpOpen(true)}>
          导出文件
        </button>
        <button className="btn btn-primary" disabled={chosen.length === 0} onClick={openAiModal}>
          生成AI报告
        </button>
        {selected.size > 0 && <span className="hint" style={{ margin: 0 }}>已勾选 {chosen.length} 条</span>}
        {exported && <span className="hint" style={{ margin: 0 }}>已导出：{exported}</span>}
        {expErr && <span className="hint" style={{ margin: 0, color: '#b45309' }}>{expErr}</span>}
        {aiPath && <span className="hint" style={{ margin: 0 }}>已生成：{aiPath}</span>}
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="empty">
            {items.length === 0 ? '还没有数据，去首页新建任务并点「开始采集」' : '没有符合筛选条件的结果'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} title="全选/全不选" />
                </th>
                <th style={{ width: 320 }}>标题</th>
                <th style={{ width: 120 }}>作者</th>
                <th style={{ width: 70 }}>点赞</th>
                <th style={{ width: 90 }}>链接</th>
                <th>正文摘要</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it, i) => {
                const key = keyOf(it, i)
                const checked = selected.has(key)
                return (
                  <tr key={key} className={checked ? 'row-checked' : ''}>
                    <td>
                      <input type="checkbox" checked={checked} onChange={() => toggleOne(key)} />
                    </td>
                    <td>
                      <div className="cell-title">
                        {it.images[0] && <img className="thumb" src={it.images[0]} alt="" loading="lazy" />}
                        <div>
                          <div>{it.title || '(无标题)'}</div>
                          {it.images.length > 0 && <span className="img-badge">📷 {it.images.length}</span>}
                        </div>
                      </div>
                    </td>
                    <td>{it.author || it.date || '—'}</td>
                    <td>{it.likes}</td>
                    <td>{it.url ? <a href={it.url} target="_blank" rel="noreferrer">打开</a> : '—'}</td>
                    <td style={{ color: '#6b7280' }}>{it.text ? it.text.slice(0, 120) + (it.text.length > 120 ? '…' : '') : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {expOpen && (
        <div className="modal-mask" onClick={() => { if (!exporting) setExpOpen(false) }}>
          <div className="modal export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>导出文件</span>
              <button className="icon-btn" disabled={exporting} onClick={() => setExpOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="field">
                <label>导出类型</label>
                <select value={expFmt} onChange={(e) => setExpFmt(e.target.value as ExportFormat)}>
                  {EXPORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="hint">将导出 <strong>{chosen.length}</strong> 条{selected.size > 0 ? '（已勾选）' : '（未勾选=全部）'}。点「导出」后弹出保存窗口选位置，完成后自动定位到文件。</div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" disabled={exporting} onClick={() => setExpOpen(false)}>取消</button>
              <button className="btn btn-primary" disabled={exporting || chosen.length === 0} onClick={() => void doExport()}>
                {exporting ? '导出中…' : '导出'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aiOpen && (
        <div className="modal-mask" onClick={() => { if (!aiBusy) setAiOpen(false) }}>
          <div className="modal report-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <span>生成 AI 报告</span>
              <button className="icon-btn" disabled={aiBusy} onClick={() => setAiOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="hint" style={{ marginTop: 0 }}>
                将对 <strong>{chosen.length}</strong> 条{selected.size > 0 ? '（已勾选）' : ''}生成报告。写下要生成什么报告；留空则按默认规则：A4 排版 PDF，每页一条资讯（标题 + 摘要 + 配图）。
              </p>
              <textarea
                className="ai-prompt-input"
                rows={11}
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder={DEFAULT_AI_REPORT_PROMPT}
              />
              {aiErr && <div className="hint" style={{ color: '#b45309', marginTop: 8 }}>{aiErr}</div>}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" disabled={aiBusy} onClick={() => setAiOpen(false)}>取消</button>
              <button className="btn btn-primary" disabled={aiBusy || chosen.length === 0} onClick={() => void doAiReport()}>
                {aiBusy ? '生成中…（约需 1 分钟）' : '生成 PDF 报告'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
