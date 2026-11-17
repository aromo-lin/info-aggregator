import { useState } from 'react'
import type { Project, ScrapedItem, Source } from '../../shared/types'

export function RunView(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [log, setLog] = useState<string[]>([])
  const [report, setReport] = useState<{ html: string; markdown: string } | null>(null)
  const [running, setRunning] = useState(false)

  const reload = async (): Promise<void> => {
    setProjects(await window.api.listProjects())
    setSources(await window.api.listSources())
  }

  const run = async (): Promise<void> => {
    setRunning(true)
    setLog([])
    const allItems: ScrapedItem[] = []
    const selected = sources.filter((s) => checked.has(s.id))
    for (const s of selected) {
      setLog((l) => [...l, `开始抓取：${s.site} ${s.keywordOrUrl}`])
      try {
        const r = await window.api.runSource(s.id, (msg) => setLog((l) => [...l, msg]))
        allItems.push(...r.items)
        setLog((l) => [...l, `完成，抓取 ${r.items.length} 条`])
      } catch (e) {
        setLog((l) => [...l, `失败：${String(e)}`])
      }
    }
    const r = await window.api.buildReport('运行结果', allItems)
    setReport(r)
    setRunning(false)
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>运行</h2>
      <button onClick={() => void reload()}>刷新</button>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <label>
              <input
                type="checkbox"
                checked={checked.has(s.id)}
                onChange={(e) => {
                  const next = new Set(checked)
                  if (e.target.checked) next.add(s.id)
                  else next.delete(s.id)
                  setChecked(next)
                }}
              />
              {s.site} · {s.keywordOrUrl}
            </label>
          </li>
        ))}
      </ul>
      <button disabled={running} onClick={() => void run()}>
        {running ? '运行中…' : '运行选中源'}
      </button>
      <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 8 }}>{log.join('\n')}</pre>
      {report && <ReportView report={report} />}
    </div>
  )
}

export function ReportView(props: { report: { html: string; markdown: string } }): React.JSX.Element {
  const [summary, setSummary] = useState('')
  const [mode, setMode] = useState<'export' | 'api'>('export')
  const [model, setModel] = useState('claude-sonnet-5-5')
  const [apiKey, setApiKey] = useState('')
  const [preview, setPreview] = useState(props.report.html)

  return (
    <div style={{ marginTop: 16 }}>
      <h3>报告</h3>
      <div>
        <label>
          <input type="radio" checked={mode === 'export'} onChange={() => setMode('export')} />
          导出模式（粘进自己的 AI）
        </label>{' '}
        <label>
          <input type="radio" checked={mode === 'api'} onChange={() => setMode('api')} />
          API 模式
        </label>
      </div>
      {mode === 'api' && (
        <div>
          <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="模型" />
          <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" type="password" />
        </div>
      )}
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="把 AI 综述粘回这里（可选）" />
      <div dangerouslySetInnerHTML={{ __html: preview }} />
    </div>
  )
}
