import { useEffect, useState } from 'react'
import type { RateConfig, RunRecord, ScrapedItem, Source } from '../shared/types'
import { DEFAULT_RATE } from '../shared/types'
import { TaskEditor } from './pages/TaskEditor'
import { DataView } from './pages/DataView'
import { Settings } from './pages/Settings'

type Tab = 'home' | 'data' | 'settings'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

const fmtTime = (iso: string): string => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// 旧数据兼容：补默认任务名 / urls / settings / order
function normalizeSource(s: Source, idx: number): Source {
  return {
    ...s,
    name: s.name || s.keywordOrUrl || '未命名任务',
    urls:
      s.urls && s.urls.length
        ? s.urls
        : [{ id: s.id, url: s.keywordOrUrl || '', fields: ['title', 'content', 'image', 'url'] }],
    settings: { dedup: s.settings?.dedup !== false },
    order: typeof s.order === 'number' ? s.order : idx,
  }
}

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('home')
  const [tasks, setTasks] = useState<Source[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [editingNew, setEditingNew] = useState(false) // 右侧正在编辑新任务（不改动当前选中任务）
  const [records, setRecords] = useState<RunRecord[]>([])
  const [viewingRecordId, setViewingRecordId] = useState<string | null>(null)
  const [items, setItems] = useState<ScrapedItem[]>([])
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [rate, setRate] = useState<RateConfig>(DEFAULT_RATE)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [defaultCount, setDefaultCount] = useState(20)

  const reloadTasks = async (): Promise<void> => {
    const list = await window.api.listSources()
    const normalized = list.map(normalizeSource).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    setTasks(normalized)
  }

  const reloadRecords = async (): Promise<void> => {
    const list = await window.api.listRunRecords().catch(() => [])
    setRecords(list)
  }

  useEffect(() => {
    void reloadTasks()
    void reloadRecords()
    void window.api.getRateConfig().then(setRate).catch(() => {})
    void window.api.getSetting('count').then((c) => c != null && setDefaultCount(Number(c))).catch(() => {})
  }, [])

  // 点任务菜单以外的地方时收起 ⋯ 菜单
  useEffect(() => {
    if (!menuId) return
    const close = (): void => setMenuId(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuId])

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null

  const persistTask = async (task: Source): Promise<void> => {
    await window.api.upsertSource(task)
    await reloadTasks()
  }

  const handleSave = async (task: Source): Promise<void> => {
    try {
      await persistTask(task)
      setActiveTaskId(task.id)
      setEditingNew(false)
      setTab('home')
    } catch (e) {
      window.alert(`保存失败：${String(e)}`)
    }
  }

  // 采集完成后把结果存成任务记录，左侧「任务记录」里可回看
  const saveRecord = async (task: Source, result: ScrapedItem[]): Promise<void> => {
    if (result.length === 0) return
    const record: RunRecord = {
      id: genId(),
      taskId: task.id,
      taskName: task.name || '未命名任务',
      endedAt: new Date().toISOString(),
      items: result,
    }
    await window.api.saveRunRecord(record).catch(() => {})
    void reloadRecords()
  }

  const handleCollect = async (task: Source): Promise<void> => {
    try {
      await persistTask(task)
    } catch (e) {
      window.alert(`保存任务失败：${String(e)}`)
      return
    }
    setActiveTaskId(task.id)
    setEditingNew(false)
    setViewingRecordId(null)
    setRunning(true)
    setRunningTaskId(task.id)
    setStopping(false)
    setLog([])
    setItems([])
    setTab('data')
    setLog((l) => [...l, `开始采集：${task.name}`])
    try {
      const r = await window.api.runSource(task.id, (msg) => setLog((l) => [...l, msg]))
      setItems(r.items)
      setLog((l) => [...l, `✓ 完成，共 ${r.items.length} 条`])
      await saveRecord(task, r.items)
    } catch (e) {
      setLog((l) => [...l, `✗ 失败：${String(e)}`])
    } finally {
      setRunning(false)
      setRunningTaskId(null)
      setStopping(false)
      void reloadTasks()
    }
  }

  // 左侧菜单「开始采集」：直接跑已保存的任务
  const runTask = async (t: Source): Promise<void> => {
    setMenuId(null)
    await handleCollect(t)
  }

  // 真正停止：通知主进程中断浏览器操作并保留已采集的部分
  const stopCollection = async (): Promise<void> => {
    if (!runningTaskId) return
    setStopping(true)
    try {
      await window.api.abortRun(runningTaskId)
    } catch {
      /* 已结束 */
    }
  }

  const copyTask = async (t: Source): Promise<void> => {
    setMenuId(null)
    const copy: Source = {
      ...t,
      id: genId(),
      name: `${t.name} 副本`,
      seenItemIds: [],
      urls: (t.urls || []).map((u) => ({ ...u, id: genId() })),
    }
    await window.api.upsertSource(copy)
    await reloadTasks()
  }

  const deleteTask = async (t: Source): Promise<void> => {
    setMenuId(null)
    if (!window.confirm(`确定删除任务「${t.name}」？`)) return
    await window.api.removeSource(t.id)
    if (activeTaskId === t.id) setActiveTaskId(null)
    await reloadTasks()
  }

  const selectTask = (t: Source): void => {
    setActiveTaskId(t.id)
    setEditingNew(false)
    setViewingRecordId(null)
  }

  // 点任务记录：右侧数据页直接展示这次采集的结果
  const viewRecord = (r: RunRecord): void => {
    setViewingRecordId(r.id)
    setItems(r.items)
    setLog([])
    setTab('data')
  }

  const clearRecord = async (r: RunRecord): Promise<void> => {
    if (!window.confirm(`清除记录「${r.taskName} ${fmtTime(r.endedAt)}」？清除后这次采集的数据不再保留。`)) return
    await window.api.removeRunRecord(r.id)
    if (viewingRecordId === r.id) {
      setViewingRecordId(null)
      setItems([])
    }
    void reloadRecords()
  }

  const onDragStart = (id: string): void => setDragId(id)
  const onDrop = (targetId: string): void => {
    if (!dragId || dragId === targetId) return
    const from = tasks.findIndex((t) => t.id === dragId)
    const to = tasks.findIndex((t) => t.id === targetId)
    if (from < 0 || to < 0) return
    const next = [...tasks]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const reordered = next.map((t, i) => ({ ...t, order: i }))
    setTasks(reordered)
    void Promise.all(reordered.map((t) => window.api.upsertSource(t)))
    setDragId(null)
  }

  const viewTitle = viewingRecordId
    ? records.find((r) => r.id === viewingRecordId)
      ? `任务记录：${records.find((r) => r.id === viewingRecordId)!.taskName}（${fmtTime(records.find((r) => r.id === viewingRecordId)!.endedAt)}）`
      : ''
    : ''

  return (
    <div className="app">
      <header className="topbar">
        <div className="logo">信息采集器</div>
        <nav className="tabs" style={{ marginLeft: 'auto' }}>
          <button className={tab === 'home' ? 'active' : ''} onClick={() => setTab('home')}>首页</button>
          <button className={tab === 'data' ? 'active' : ''} onClick={() => setTab('data')}>数据</button>
          <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>设置</button>
        </nav>
      </header>

      <div className="body">
        <aside className="sidebar">
          <button
            className="btn btn-primary new-task-btn"
            onClick={() => {
              setEditingNew(true)
              setViewingRecordId(null)
              setTab('home')
            }}
          >
            ＋ 新建任务
          </button>
          <div className="sidebar-head">我的任务</div>
          <div className="task-list">
            {tasks.length === 0 && <div className="empty" style={{ padding: 16 }}>暂无任务</div>}
            {tasks.map((t) => (
              <div
                key={t.id}
                className={`task-item ${activeTaskId === t.id && !editingNew ? 'active' : ''} ${dragId === t.id ? 'dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(t.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(t.id)}
                onDragEnd={() => setDragId(null)}
                onClick={() => selectTask(t)}
              >
                <span className="drag-handle" title="拖动排序">⠿</span>
                <span className="task-name">{t.name}</span>
                <span
                  className="task-more"
                  title="更多操作"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMenuId(menuId === t.id ? null : t.id)
                  }}
                >
                  ⋯
                </span>
                {menuId === t.id && (
                  <div className="task-menu" onClick={(e) => e.stopPropagation()}>
                    <button className="menu-item" onClick={() => void runTask(t)}>开始采集</button>
                    <button className="menu-item" onClick={() => { selectTask(t); setTab('home'); setMenuId(null) }}>编辑</button>
                    <button className="menu-item" onClick={() => void copyTask(t)}>复制任务</button>
                    <button className="menu-item danger" onClick={() => void deleteTask(t)}>删除任务</button>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="records-block">
            <div className="records-head">任务记录</div>
            <div className="records-list">
              {records.length === 0 && <div className="empty" style={{ padding: 12 }}>暂无记录</div>}
              {records.map((r) => (
                <div
                  key={r.id}
                  className={`record-item ${viewingRecordId === r.id ? 'active' : ''}`}
                  onClick={() => viewRecord(r)}
                >
                  <div className="record-info">
                    <div className="record-name">{r.taskName}</div>
                    <div className="record-meta">{fmtTime(r.endedAt)} · {r.items.length} 条</div>
                  </div>
                  <button
                    className="icon-btn record-clear"
                    title="清除记录"
                    onClick={(e) => {
                      e.stopPropagation()
                      void clearRecord(r)
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <main className="main">
          {tab === 'home' && (
            <TaskEditor
              key={editingNew || !activeTask ? 'new' : activeTaskId}
              initial={editingNew ? null : activeTask}
              running={running}
              defaultCount={defaultCount}
              onCancel={editingNew ? () => setEditingNew(false) : undefined}
              onSave={handleSave}
              onCollect={handleCollect}
            />
          )}
          {tab === 'data' && (
            <DataView
              items={items}
              log={log}
              running={running}
              stopping={stopping}
              onStop={() => void stopCollection()}
              viewingLabel={viewTitle}
            />
          )}
          {tab === 'settings' && <Settings rate={rate} onRateChange={setRate} />}
        </main>
      </div>
    </div>
  )
}
