import { useEffect, useState } from 'react'
import type { RateConfig } from '../../shared/types'

const PRESETS: Array<{ label: string; cfg: RateConfig }> = [
  { label: '保守（最稳，8~20秒）', cfg: { enabled: true, minDelayMs: 8000, maxDelayMs: 20000, scrollSteps: 6 } },
  { label: '平衡（3~8秒）', cfg: { enabled: true, minDelayMs: 3000, maxDelayMs: 8000, scrollSteps: 5 } },
  { label: '快速（0.5~1.5秒，风险高）', cfg: { enabled: true, minDelayMs: 500, maxDelayMs: 1500, scrollSteps: 3 } },
  { label: '关闭限速', cfg: { enabled: false, minDelayMs: 200, maxDelayMs: 600, scrollSteps: 2 } },
]

export function Settings(props: { rate: RateConfig; onRateChange: (r: RateConfig) => void }): React.JSX.Element {
  const { rate, onRateChange } = props
  const [saved, setSaved] = useState(false)
  const [model, setModel] = useState('claude-sonnet-5-5')
  const [apiKey, setApiKey] = useState('')
  const [aiBaseUrl, setAiBaseUrl] = useState('')
  const [count, setCount] = useState(20)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; detail: string } | null>(null)

  useEffect(() => {
    void window.api.loadKey('default').then((k) => k && setApiKey(k))
    void window.api.getSetting('model').then((m) => m && setModel(String(m)))
    void window.api.getSetting('aiBaseUrl').then((u) => u && setAiBaseUrl(String(u)))
    void window.api.getSetting('count').then((c) => c != null && setCount(Number(c)))
  }, [])

  const save = async (): Promise<void> => {
    await window.api.saveRateConfig(rate)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveAi = async (): Promise<void> => {
    await window.api.saveKey('default', apiKey)
    await window.api.saveSetting('model', model)
    await window.api.saveSetting('aiBaseUrl', aiBaseUrl.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const saveCount = async (): Promise<void> => {
    await window.api.saveSetting('count', count)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  // 直接用输入框里当前的值测试（不依赖是否已保存）
  const testAi = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await window.api.testAiConnection({ model: model.trim(), apiKey: apiKey.trim(), baseUrl: aiBaseUrl.trim() })
      setTestResult(r)
    } catch (e) {
      setTestResult({ ok: false, detail: String(e) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="settings">
      <h2>设置</h2>

      <div className="setting-group">
        <h3>采集默认</h3>
        <div className="field">
          <label>默认采集条数</label>
          <input type="number" min={1} max={200} value={count} onChange={(e) => setCount(Number(e.target.value))} />
          <button className="btn btn-ghost" onClick={() => void saveCount()}>保存</button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>已保存</span>}
        </div>
        <div className="hint">新建任务时默认使用的采集条数；也可在单个任务编辑页里单独覆盖。</div>
      </div>

      <div className="setting-group">
        <h3>拟人限速</h3>
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="switch">
            <input
              type="checkbox"
              checked={rate.enabled}
              onChange={(e) => onRateChange({ ...rate, enabled: e.target.checked })}
            />
            启用拟人限速（随机停顿、低速滚动，降低被风控风险）
          </label>
        </div>
        <div className="field">
          <label>最小间隔（毫秒）</label>
          <input
            type="number"
            value={rate.minDelayMs}
            onChange={(e) => onRateChange({ ...rate, minDelayMs: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>最大间隔（毫秒）</label>
          <input
            type="number"
            value={rate.maxDelayMs}
            onChange={(e) => onRateChange({ ...rate, maxDelayMs: Number(e.target.value) })}
          />
        </div>
        <div className="field">
          <label>滚动分段次数</label>
          <input
            type="number"
            value={rate.scrollSteps}
            onChange={(e) => onRateChange({ ...rate, scrollSteps: Number(e.target.value) })}
          />
        </div>
        <div className="field" style={{ flexWrap: 'wrap' }}>
          <label>快速预设</label>
          {PRESETS.map((p) => (
            <button key={p.label} className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => onRateChange(p.cfg)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label></label>
          <button className="btn btn-primary" onClick={() => void save()}>保存限速设置</button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>已保存</span>}
        </div>
        <div className="hint">提示：这是「自用、安全第一」的采集器。保守档最不容易触发风控，但采集速度慢；请按目标网站的承受能力选择。</div>
      </div>

      <div className="setting-group">
        <h3>AI 汇总（可选）</h3>
        <div className="field">
          <label>模型</label>
          <input type="text" value={model} onChange={(e) => setModel(e.target.value)} placeholder="如 deepseek-chat / qwen-max / claude-..." />
        </div>
        <div className="field">
          <label>接口地址（国内模型免代理）</label>
          <input
            type="text"
            value={aiBaseUrl}
            onChange={(e) => setAiBaseUrl(e.target.value)}
            placeholder="留空=按模型名自动识别，如 DeepSeek 填 https://api.deepseek.com/v1"
          />
        </div>
        <div className="field">
          <label>API Key</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label></label>
          <button className="btn btn-ghost" onClick={() => void saveAi()}>保存 AI 设置</button>
          <button className="btn btn-ghost" disabled={testing} onClick={() => void testAi()}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          {saved && <span style={{ color: '#16a34a', fontSize: 13 }}>已保存</span>}
        </div>
        {testResult && (
          <div className={testResult.ok ? 'ai-test-ok' : 'ai-test-err'} style={{ margin: '8px 0 12px', fontSize: 13, lineHeight: 1.7, wordBreak: 'break-all' }}>
            {testResult.ok ? '✓ ' : '✗ '}
            {testResult.detail}
          </div>
        )}
        <div className="hint">
          国内模型（deepseek / qwen / glm / kimi / minimax）会按模型名自动走对应国内接口，直连即可、不用开代理；
          其他模型或中转站可在「接口地址」里手动填写 OpenAI 兼容地址。API Key 用系统安全存储加密保存，仅存本机。
        </div>
      </div>
    </div>
  )
}
