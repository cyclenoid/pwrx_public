import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Download, Upload, Undo2, Redo2, LocateFixed, Save, Trash2, Route, X } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import { PlannerMap } from '../features/routePlanner/PlannerMap'
import { draftFromSegments, emptyDraft, isDraft, isPoint, MAX_ANCHORS, routeStats, segmentsFromDraft, splitLeg, distance } from '../features/routePlanner/model'
import type { Leg, Point, Profile, RouteDraft } from '../features/routePlanner/model'
import { exportGpx, parseGpx } from '../features/routePlanner/gpx'
import { plannerText } from '../features/routePlanner/text'

const API = `${String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}/route-planner`
const STORAGE_KEY = 'pwrx-route-draft-v1'
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed'
const primary = `${button} bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/40 hover:bg-orange-500/25`

function Elevation({ draft, label }: { draft: RouteDraft; label: string }) {
  const segments = segmentsFromDraft(draft)
  const points = segments.flat()
  if (points.length < 2 || points.some(p => p.ele === undefined)) return null
  let min = Infinity, max = -Infinity
  points.forEach(p => { min = Math.min(min, p.ele!); max = Math.max(max, p.ele!) })
  const total = routeStats(draft).meters || 1
  let traveled = 0
  const lines: string[] = []
  for (const segment of segments) {
    const line: string[] = []
    for (let i = 0; i < segment.length; i++) {
      if (i) traveled += distance(segment[i - 1], segment[i])
      line.push(`${10 + traveled / total * 580},${85 - (segment[i].ele! - min) / Math.max(1, max - min) * 70}`)
    }
    lines.push(line.join(' '))
  }
  return <div>
    <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{Math.round(min)}–{Math.round(max)} m</span></div>
    <svg viewBox="0 0 600 100" className="h-24 w-full" role="img" aria-label={label}>
      {lines.map((line, i) => <polyline key={i} points={line} fill="none" stroke="#f97316" strokeWidth="2" />)}
    </svg>
  </div>
}

export function RoutePlanner() {
  const { i18n } = useTranslation()
  const text = plannerText[i18n.language.startsWith('de') ? 'de' : 'en']
  const [history, setHistory] = useState<{ past: RouteDraft[]; current: RouteDraft; future: RouteDraft[] }>({ past: [], current: emptyDraft(), future: [] })
  const draft = history.current
  const [profile, setProfile] = useState<Profile>('touring')
  const [mode, setMode] = useState<'routed' | 'direct'>('routed')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [fitToken, setFitToken] = useState(0)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)
  const stats = useMemo(() => routeStats(draft), [draft])
  const canRoute = configured === true
  const canEdit = mode === 'direct' || canRoute
  const hasGeometry = draft.legs.some(leg => leg !== null)

  useEffect(() => () => pending.current?.abort(), [])
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (draft.anchors.length) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft.anchors.length])
  useEffect(() => {
    const abort = new AbortController()
    fetch(`${API}/status`, { signal: abort.signal }).then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setConfigured(data.configured === true)).catch(() => { if (!abort.signal.aborted) setConfigured(false) })
    return () => abort.abort()
  }, [])

  const retryStatus = async () => {
    setConfigured(null)
    try {
      const response = await fetch(`${API}/status`, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error()
      setConfigured((await response.json()).configured === true)
    } catch { setConfigured(false) }
  }
  const commit = (next: RouteDraft) => {
    setHistory(current => ({ past: [...current.past.slice(-19), current.current], current: next, future: [] }))
    setError(''); setMessage('')
  }
  const report = (reason: unknown) => {
    const code = reason instanceof Error ? reason.message : 'FAILED'
    setError(text.errors[code as keyof typeof text.errors] || text.errors.FAILED)
  }
  const execute = async (work: (signal: AbortSignal) => Promise<RouteDraft>) => {
    if (pending.current) return
    const abort = new AbortController()
    pending.current = abort
    setBusy(true); setError(''); setMessage('')
    try {
      const next = await work(abort.signal)
      if (!abort.signal.aborted) {
        if (!isDraft(next)) throw new Error('GPX_SIZE')
        commit(next)
      }
    } catch (reason) { if (!abort.signal.aborted) report(reason) }
    finally {
      if (pending.current === abort) { pending.current = null; setBusy(false) }
    }
  }
  const calculate = async (a: Point, b: Point, signal: AbortSignal, forceRouting = false): Promise<Leg> => {
    if (mode === 'direct' && !forceRouting) return { points: [a, b], source: 'direct' }
    const response = await fetch(`${API}/calculate`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [a, b], profile }), signal: AbortSignal.any([signal, AbortSignal.timeout(35000)]),
    })
    const data = await response.json().catch(() => { throw new Error('ROUTING_UNAVAILABLE') })
    if (!response.ok) throw new Error(data.code || 'ROUTING_UNAVAILABLE')
    if (!Array.isArray(data.points) || data.points.length < 2 || data.points.length > 150000 || !data.points.every(isPoint)) {
      throw new Error('INVALID_ROUTE_RESPONSE')
    }
    return { points: data.points, source: 'routed' }
  }
  const addPoint = (point: Point) => {
    if (busy || !canEdit) return
    if (draft.anchors.length >= MAX_ANCHORS) { report(new Error('MAX_ANCHORS')); return }
    void execute(async signal => ({ ...draft, anchors: [...draft.anchors, point],
      legs: draft.anchors.length ? [...draft.legs, await calculate(draft.anchors[draft.anchors.length - 1], point, signal)] : [],
    }))
  }
  const movePoint = (index: number, point: Point) => {
    if (busy || !canEdit) return
    void execute(async signal => {
      const anchors = [...draft.anchors], legs = [...draft.legs]
      anchors[index] = point
      // Preserve every untouched leg, including original GPX geometry and segment breaks.
      for (const legIndex of [index - 1, index]) {
        if (legs[legIndex]) legs[legIndex] = await calculate(anchors[legIndex], anchors[legIndex + 1], signal)
      }
      return { ...draft, anchors, legs }
    })
  }
  const removePoint = (index: number) => {
    if (busy) return
    void execute(async signal => {
      const anchors = [...draft.anchors], legs = [...draft.legs]
      if (index === 0) legs.shift()
      else if (index === anchors.length - 1) legs.pop()
      else {
        const merged = legs[index - 1] && legs[index]
          ? await calculate(anchors[index - 1], anchors[index + 1], signal) : null
        legs.splice(index - 1, 2, merged)
      }
      anchors.splice(index, 1)
      return { ...draft, anchors, legs }
    })
  }
  const undo = () => {
    if (!history.past.length || busy) return
    setHistory({ past: history.past.slice(0, -1), current: history.past[history.past.length - 1], future: [draft, ...history.future] })
    setError(''); setMessage('')
  }
  const redo = () => {
    if (!history.future.length || busy) return
    setHistory({ past: [...history.past, draft], current: history.future[0], future: history.future.slice(1) })
    setError(''); setMessage('')
  }
  const confirmReplace = () => !draft.anchors.length || window.confirm(text.replaceConfirm)
  const importFile = async (file: File) => {
    if (busy || pending.current || !confirmReplace()) return
    if (file.size > 10 * 1024 * 1024) { report(new Error('GPX_SIZE')); return }
    await execute(async signal => {
      const name = file.name.replace(/\.(gpx|fit)$/i, '')
      let next: RouteDraft
      if (/\.fit$/i.test(file.name)) {
        const response = await fetch(`${API}/import-fit`, { method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' }, body: file,
          signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
        })
        const data = await response.json().catch(() => { throw new Error('FIT_IMPORT_FAILED') })
        if (!response.ok) throw new Error(data.code || 'FIT_IMPORT_FAILED')
        if (!Array.isArray(data.segments) || !data.segments.every((segment: unknown) => Array.isArray(segment) && segment.every(isPoint))) {
          throw new Error('INVALID_FIT')
        }
        next = draftFromSegments(name, data.segments)
      } else if (/\.gpx$/i.test(file.name)) {
        next = parseGpx(await file.text(), name)
      } else throw new Error('UNSUPPORTED_FILE')
      if (signal.aborted) return draft
      setAdding(false); setFitToken(token => token + 1)
      return next
    })
  }
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportGpx(draft)], { type: 'application/gpx+xml' }))
    const link = document.createElement('a')
    link.href = url
    const filename = Array.from(draft.name || 'PWRX Route', char => char.charCodeAt(0) < 32 ? '-' : char).join('')
    link.download = `${filename.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100)}.gpx`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage(text.exported); setError('')
  }
  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, draft, profile, mode }))
      setMessage(text.saved); setError('')
    } catch { report(new Error('STORAGE')) }
  }
  const load = () => {
    if (!confirmReplace()) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) { report(new Error('NO_DRAFT')); return }
      const data = JSON.parse(raw)
      if (data.version !== 1 || !isDraft(data.draft)) throw new Error()
      commit(data.draft)
      if (['road', 'gravel', 'touring'].includes(data.profile)) setProfile(data.profile)
      setMode(data.mode === 'direct' ? 'direct' : 'routed')
      setAdding(false); setFitToken(token => token + 1)
    } catch { report(new Error('STORAGE')) }
  }

  return <div className="flex h-dvh flex-col bg-background text-foreground">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
      <div className="flex items-center gap-3">
        <Link to="/" className={button} aria-label={text.back} onClick={event => { if (!confirmReplace()) event.preventDefault() }}><ArrowLeft size={18} /></Link>
        <div><h1 className="flex items-center gap-2 text-xl font-bold"><Route size={21} />{text.title}<span className="rounded border border-orange-500/30 px-2 py-0.5 text-xs font-normal text-orange-500">{text.beta}</span></h1><p className="hidden text-xs text-muted-foreground sm:block">{text.subtitle}</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button className={`${button} max-sm:px-2 max-sm:text-xs`} disabled={busy} onClick={() => fileRef.current?.click()}><Upload size={16} />{text.import}</button>
        <button className={`${primary} max-sm:px-2 max-sm:text-xs`} disabled={busy || !hasGeometry} onClick={download}><Download size={16} />{text.export}</button>
        <ThemeToggle />
        <input ref={fileRef} type="file" accept=".gpx,.fit,application/gpx+xml" className="hidden" aria-label={text.import}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importFile(file) }} />
      </div>
    </header>
    <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(240px,48%)_minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
      <aside className="order-2 min-h-0 overflow-y-auto border-r p-4 md:order-1">
        <div className="space-y-5">
          <label className="block text-sm font-medium">{text.name}<input className="mt-2 w-full rounded-lg border bg-background px-3 py-2" maxLength={200} placeholder={text.untitled} value={draft.name} disabled={busy}
            onChange={event => { const name = event.target.value; setHistory(current => ({ ...current, current: { ...current.current, name } })); setMessage('') }} /></label>
          <fieldset disabled={busy} className="space-y-2"><legend className="mb-2 text-sm font-medium">{text.profile}</legend>
            <div className="grid grid-cols-1 gap-2">{(['road', 'gravel', 'touring'] as const).map(value => <button key={value} type="button" aria-pressed={profile === value} className={`${button} justify-start ${profile === value ? 'border-orange-500/50 bg-orange-500/15 text-orange-600 dark:text-orange-400' : ''}`} onClick={() => setProfile(value)}>{text[value]}</button>)}</div>
            <p className="text-xs text-muted-foreground">{text[`${profile}Hint`]}</p><p className="text-xs text-muted-foreground">{text.profileHint}</p>
          </fieldset>
          <label className="block text-sm font-medium">{text.mode}<select className="mt-2 w-full rounded-lg border bg-background px-3 py-2" value={mode} disabled={busy} onChange={event => setMode(event.target.value as typeof mode)}><option value="routed">{text.routed}</option><option value="direct">{text.direct}</option></select></label>
          {mode === 'direct' && <p className="text-xs text-amber-600 dark:text-amber-400">{text.directHint}</p>}
          {!canRoute && <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm" role="status">{configured === null ? text.checking : text.offline}
            {configured === false && <button className={`${button} mt-2`} disabled={busy} onClick={() => void retryStatus()}>{text.retry}</button>}
          </div>}
          <div className="flex gap-2"><button className={`${primary} flex-1 ${adding ? 'bg-orange-500/25' : ''}`} disabled={busy || !canEdit} aria-pressed={adding} onClick={() => setAdding(!adding)}>{adding ? text.stop : text.add}</button>
            <button className={button} title={text.fit} aria-label={text.fit} disabled={!draft.anchors.length} onClick={() => setFitToken(token => token + 1)}><LocateFixed size={18} /></button></div>
          <p className="text-xs leading-relaxed text-muted-foreground">{adding ? text.hint : text.idleHint}</p>
          <div className="grid grid-cols-2 gap-2"><button className={button} disabled={busy || !history.past.length} onClick={undo}><Undo2 size={16} />{text.undo}</button><button className={button} disabled={busy || !history.future.length} onClick={redo}><Redo2 size={16} />{text.redo}</button></div>
          {busy && <div role="status" className="flex items-center justify-between rounded-lg bg-secondary p-3 text-sm">{text.working}<button className={button} onClick={() => pending.current?.abort()}><X size={14} />{text.cancel}</button></div>}
          {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
          {message && <p role="status" className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">{message}</p>}
          <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-3"><div><p className="text-xs text-muted-foreground">{text.distance}</p><p className="text-xl font-semibold">{(stats.meters / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} km</p></div><div><p className="text-xs text-muted-foreground">{text.ascent}</p><p className="text-xl font-semibold">{stats.ascent === null ? '–' : `${Math.round(stats.ascent)} m`}</p></div></div>
          {stats.ascent === null ? <p className="text-xs text-muted-foreground">{text.noElevation}</p> : <Elevation draft={draft} label={text.elevation} />}
          {draft.legs.some(leg => leg?.source === 'imported') && <p className="border-l-2 border-sky-400 pl-3 text-xs text-muted-foreground">{text.importedHint}</p>}
          {segmentsFromDraft(draft).length > 1 && <p className="text-xs text-muted-foreground">{text.gapHint}</p>}
          <section><h2 className="mb-2 text-sm font-medium">{text.points} <span className="text-muted-foreground">{draft.anchors.length}/{MAX_ANCHORS}</span></h2><ol className="max-h-64 space-y-1 overflow-y-auto">{draft.anchors.map((point, index) => <li key={index} className="flex items-center gap-2 rounded-lg bg-secondary/50 p-2 text-xs"><span className="w-5 font-semibold text-orange-500">{index + 1}</span><span className="flex-1">{index === 0 ? text.start : index === draft.anchors.length - 1 ? text.finish : text.via}<span className="block text-muted-foreground">{point.lat.toFixed(4)}, {point.lng.toFixed(4)}</span></span><button className={button} aria-label={`${text.remove} ${index + 1}`} disabled={busy || (!canEdit && index > 0 && index < draft.anchors.length - 1 && Boolean(draft.legs[index - 1] && draft.legs[index]))} onClick={() => removePoint(index)}><Trash2 size={14} /></button></li>)}</ol></section>
          <button className={`${button} w-full`} disabled={busy || !canRoute || !hasGeometry} onClick={() => {
            if (!window.confirm(text.recalcConfirm)) return
            void execute(async signal => {
              const legs: RouteDraft['legs'] = []
              for (let i = 0; i < draft.legs.length; i++) legs.push(draft.legs[i] ? await calculate(draft.anchors[i], draft.anchors[i + 1], signal, true) : null)
              return { ...draft, legs }
            })
          }}>{text.recalc}</button>
          <div className="border-t pt-4"><div className="grid grid-cols-2 gap-2"><button className={button} disabled={busy || !draft.anchors.length} onClick={save}><Save size={16} />{text.save}</button><button className={button} disabled={busy} onClick={load}>{text.load}</button></div><p className="mt-2 text-xs text-muted-foreground">{text.storageHint}</p></div>
          <button className={`${button} w-full`} disabled={busy} onClick={() => { if (confirmReplace()) { commit(emptyDraft()); setAdding(false) } }}>{text.new}</button>
          <p className="text-xs text-muted-foreground">{text.attribution}</p>
        </div>
      </aside>
      <main className="relative order-1 min-h-0 min-w-0 md:order-2" aria-label={text.title}>
        <PlannerMap draft={draft} adding={adding} disabled={busy || !canEdit} fitToken={fitToken} onAdd={addPoint} onMove={movePoint} onSplit={(index, point) => {
          if (draft.anchors.length >= MAX_ANCHORS) { report(new Error('MAX_ANCHORS')); return }
          const next = splitLeg(draft, index, point)
          if (next !== draft) commit(next)
        }} />
      </main>
    </div>
  </div>
}
