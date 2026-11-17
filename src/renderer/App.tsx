import { useState } from 'react'
import { Projects } from './pages/Projects'
import { RunView } from './pages/RunView'
import { Settings } from './pages/Settings'

type Tab = 'projects' | 'run' | 'settings'

export default function App(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('projects')
  return (
    <div style={{ fontFamily: 'sans-serif' }}>
      <nav style={{ padding: 12, borderBottom: '1px solid #ddd' }}>
        <button onClick={() => setTab('projects')}>项目</button>
        <button onClick={() => setTab('run')}>运行</button>
        <button onClick={() => setTab('settings')}>设置</button>
      </nav>
      {tab === 'projects' && <Projects />}
      {tab === 'run' && <RunView />}
      {tab === 'settings' && <Settings />}
    </div>
  )
}
