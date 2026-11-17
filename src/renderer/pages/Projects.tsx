import { useEffect, useState } from 'react'
import type { Identity, Project, Source } from '../../shared/types'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function Projects(): React.JSX.Element {
  const [projects, setProjects] = useState<Project[]>([])
  const [sources, setSources] = useState<Source[]>([])
  const [identities, setIdentities] = useState<Identity[]>([])
  const [selected, setSelected] = useState<string | null>(null)

  const reload = async (): Promise<void> => {
    setProjects(await window.api.listProjects())
    setSources(await window.api.listSources())
    setIdentities(await window.api.listIdentities())
  }
  useEffect(() => {
    void reload()
  }, [])

  const project = projects.find((p) => p.id === selected)

  return (
    <div style={{ padding: 16 }}>
      <h2>项目分组</h2>
      <button
        onClick={async () => {
          const p: Project = { id: genId(), name: `新项目 ${projects.length + 1}`, sourceIds: [] }
          await window.api.upsertProject(p)
          await reload()
        }}
      >
        新建项目
      </button>
      <ul>
        {projects.map((p) => (
          <li key={p.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(p.id)}>
            {p.name}
          </li>
        ))}
      </ul>
      {project && (
        <SourceEditor
          project={project}
          sources={sources}
          identities={identities}
          onChanged={reload}
        />
      )}
      <Identities identities={identities} onChanged={reload} />
    </div>
  )
}

export function SourceEditor(props: {
  project: Project
  sources: Source[]
  identities: Identity[]
  onChanged: () => Promise<void>
}): React.JSX.Element {
  const { project, sources, identities, onChanged } = props
  const [draft, setDraft] = useState<Source>(() => ({
    id: genId(),
    type: 'search',
    site: 'xiaohongshu',
    keywordOrUrl: '',
    identityId: null,
    config: { count: 10, contentTypes: ['image', 'text'], includeComments: false, sort: 'likes', timeRangeDays: null },
    seenItemIds: [],
  }))

  const projectSources = sources.filter((s) => project.sourceIds.includes(s.id))

  return (
    <div style={{ border: '1px solid #ccc', padding: 12, marginTop: 8 }}>
      <h3>{project.name} 的信息源</h3>
      <label>
        站点：
        <select value={draft.site} onChange={(e) => setDraft({ ...draft, site: e.target.value })}>
          <option value="xiaohongshu">小红书</option>
          <option value="generic">公开网页</option>
        </select>
      </label>{' '}
      <label>
        类型：
        <select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as Source['type'] })}>
          <option value="search">搜索</option>
          <option value="fixed-url">固定网址</option>
        </select>
      </label>{' '}
      <label htmlFor="kw-input">关键词/网址：</label>{' '}
      <input id="kw-input" value={draft.keywordOrUrl} onChange={(e) => setDraft({ ...draft, keywordOrUrl: e.target.value })} />{' '}
      <label>
        身份：
        <select value={draft.identityId ?? ''} onChange={(e) => setDraft({ ...draft, identityId: e.target.value || null })}>
          <option value="">（无）</option>
          {identities.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>
      </label>{' '}
      <label htmlFor="count-input">抓取条数：</label>{' '}
      <input
        id="count-input"
        type="number"
        value={draft.config.count}
        onChange={(e) => setDraft({ ...draft, config: { ...draft.config, count: Number(e.target.value) } })}
      />{' '}
      <label>
        <input
          type="checkbox"
          checked={draft.config.includeComments}
          onChange={(e) => setDraft({ ...draft, config: { ...draft.config, includeComments: e.target.checked } })}
        />
        抓评论
      </label>
      <button
        onClick={async () => {
          await window.api.upsertSource(draft)
          await window.api.upsertProject({ ...project, sourceIds: [...project.sourceIds, draft.id] })
          setDraft({ ...draft, id: genId(), keywordOrUrl: '' })
          await onChanged()
        }}
      >
        添加信息源
      </button>
      <ul>
        {projectSources.map((s) => (
          <li key={s.id}>
            {s.site} · {s.keywordOrUrl || '(空)'}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Identities(props: { identities: Identity[]; onChanged: () => Promise<void> }): React.JSX.Element {
  const [label, setLabel] = useState('')
  const [site, setSite] = useState('xiaohongshu')
  return (
    <div style={{ marginTop: 16 }}>
      <h3>登录身份</h3>
      <label>
        名称：<input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>{' '}
      <label>
        站点：
        <select value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="xiaohongshu">小红书</option>
          <option value="generic">公开网页</option>
        </select>
      </label>{' '}
      <button
        onClick={async () => {
          await window.api.upsertIdentity({ id: genId(), label, site, profileDir: '' })
          setLabel('')
          await props.onChanged()
        }}
      >
        新建身份
      </button>
      <ul>
        {props.identities.map((i) => (
          <li key={i.id}>
            {i.label}（{i.site}）
          </li>
        ))}
      </ul>
    </div>
  )
}
