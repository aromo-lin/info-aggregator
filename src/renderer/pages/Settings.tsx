import { useEffect, useState } from 'react'

export function Settings(): React.JSX.Element {
  const [mode, setMode] = useState<'export' | 'api'>('export')
  const [model, setModel] = useState('claude-sonnet-5-5')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    void window.api.loadKey('default').then((k) => k && setApiKey(k))
  }, [])

  return (
    <div style={{ padding: 16 }}>
      <h2>设置</h2>
      <div>
        <label htmlFor="mode-export">
          <input id="mode-export" type="radio" checked={mode === 'export'} onChange={() => setMode('export')} />
          导出模式
        </label>{' '}
        <label htmlFor="mode-api">
          <input id="mode-api" type="radio" checked={mode === 'api'} onChange={() => setMode('api')} />
          API 模式
        </label>
      </div>
      {mode === 'api' && (
        <div>
          <label htmlFor="model-input">
            模型：<input id="model-input" value={model} onChange={(e) => setModel(e.target.value)} />
          </label>{' '}
          <label htmlFor="apikey-input">
            API key：
            <input id="apikey-input" value={apiKey} type="password" onChange={(e) => setApiKey(e.target.value)} />
          </label>{' '}
          <button onClick={() => void window.api.saveKey('default', apiKey)}>保存 key</button>
        </div>
      )}
    </div>
  )
}
