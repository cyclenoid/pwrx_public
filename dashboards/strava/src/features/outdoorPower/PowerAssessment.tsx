import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Calculator, Check, ChevronDown, RotateCcw } from 'lucide-react'
import { Card, CardContent } from '../../components/ui/card'
import { powerText } from './text'
import { canAssess } from './types'
import type { Activity, Assessment, Context, Parameters, Stored } from './types'

const API = `${String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}/power-assessments`
const button = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40'
const input = 'mt-1 w-full min-w-0 rounded-lg border bg-transparent px-3 py-2 text-sm'
type Form = Omit<Parameters, 'riderKg' | 'equipmentKg' | 'windKmh'> & { riderKg: string; equipmentKg: string; windKmh: string }
const formFor = (p: Parameters): Form => ({ ...p, riderKg: p.riderKg ? String(p.riderKg) : '', equipmentKg: String(p.equipmentKg), windKmh: String(p.windKmh) })
const parametersFor = (form: Form): Parameters => ({ ...form, riderKg: form.riderKg.trim() ? Number(form.riderKg.replace(',', '.')) : NaN,
  equipmentKg: form.equipmentKg.trim() ? Number(form.equipmentKg.replace(',', '.')) : NaN, windKmh: form.windKmh.trim() ? Number(form.windKmh.replace(',', '.')) : NaN })
const valid = (p: Parameters) => p.riderKg >= 25 && p.riderKg <= 250 && p.equipmentKg >= 0 && p.equipmentKg <= 80 && p.windKmh >= 0 && p.windKmh <= 80
async function request<T>(id: string | number, path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`${API}/${id}${path}`, { ...init, headers: { 'Content-Type': 'application/json' },
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000) })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => { throw new Error('POWER_FAILED') })
  if (!response.ok) throw new Error(data.code || 'POWER_FAILED')
  return data as T
}

export function OutdoorPowerAssessment({ activity }: { activity: Activity }) {
  if (!canAssess(activity)) return null
  return <AssessmentCard key={`${activity.strava_activity_id}:${activity.gear_id || ''}`} id={activity.strava_activity_id} />
}

function AssessmentCard({ id }: { id: string | number }) {
  const { i18n } = useTranslation(), language = i18n.language.startsWith('de') ? 'de' : 'en', text = powerText[language]
  const [context, setContext] = useState<Context | null>(null), [form, setForm] = useState<Form | null>(null)
  const [preview, setPreview] = useState<Assessment | null>(null), [saved, setSaved] = useState<Stored | null>(null)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    void (async () => {
      try {
        const data = await request<Context>(id, '', { signal: controller.signal })
        if (controller.signal.aborted) return
        setContext(data)
        if (!data.eligible) return
        setSaved(data.stored)
        const params = data.stored?.payload.parameters || data.defaults
        setForm(formFor(params))
        if (data.stored && !data.stored.stale) setPreview(data.stored.payload)
        else if (data.sufficient && valid(params)) {
          const result = await request<Assessment>(id, '/preview', { method: 'POST', body: JSON.stringify({ parameters: params }), signal: controller.signal })
          if (!controller.signal.aborted) setPreview(result)
        }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'POWER_FAILED') }
      finally { if (!controller.signal.aborted) setLoading(false) }
    })()
    return () => controller.abort()
  }, [id, reload])
  const change = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm(current => current ? { ...current, [key]: value } : current); setPreview(null); setError('')
  }
  const calculate = async () => {
    if (!form || busy) return
    setBusy(true); setError('')
    try { setPreview(await request<Assessment>(id, '/preview', { method: 'POST', body: JSON.stringify({ parameters: parametersFor(form) }) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'POWER_FAILED') } finally { setBusy(false) }
  }
  const accept = async () => {
    if (!preview || busy) return
    setBusy(true); setError('')
    try { setSaved(await request<Stored>(id, '', { method: 'PUT', body: JSON.stringify({ parameters: preview.parameters, fingerprint: preview.fingerprint, revision: saved?.revision || null }) })) }
    catch (e) { setError(e instanceof Error ? e.message : 'POWER_FAILED') } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!saved || busy || !window.confirm(text.removeConfirm)) return
    setBusy(true); setError('')
    try { await request(id, `?revision=${saved.revision}`, { method: 'DELETE' }); setSaved(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'POWER_FAILED') } finally { setBusy(false) }
  }
  if (context && !context.eligible) return null
  const run = context?.kind === 'run', disabled = busy || loading
  const accepted = !!preview && saved?.payload.fingerprint === preview.fingerprint && !saved.stale
  const format = (value: number, digits = 0) => value.toLocaleString(i18n.language, { maximumFractionDigits: digits })
  const minutes = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, '0')} h`
  return <Card aria-label={run ? text.runTitle : text.title}>
    <details className="group">
    <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3 text-sm transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
      <span className="flex flex-1 items-center gap-2 font-medium"><Calculator size={16} className="shrink-0 text-orange-500" />{run ? text.runTitle : text.title}</span>
      {saved && <span className={`inline-flex items-center gap-1 text-xs ${saved.stale ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`} title={saved.stale ? text.stale : text.accepted}>
        {!saved.stale && <Check size={14} aria-hidden="true" />}{format(saved.payload.watts)} W
      </span>}
      <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <CardContent className="space-y-4 border-t pt-4">
      <p className="text-sm text-muted-foreground">{text.intro}</p>
      {accepted && <p role="status" className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><Check size={14} />{text.accepted}</p>}
      {loading && <p role="status" className="text-sm text-muted-foreground">{text.working}</p>}
      {preview && <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{text.original}</p><p className="mt-1 text-2xl font-semibold">{preview.originalWatts === null ? text.noOriginal : `${format(preview.originalWatts)} W`}</p></div>
          <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3"><p className="text-xs text-muted-foreground">{run ? text.runModel : text.model}</p><p className="mt-1 text-2xl font-semibold text-orange-500">{format(preview.watts)} W</p>
            {!run && preview.originalWatts !== null && <p className="mt-1 text-xs text-muted-foreground">{preview.watts >= preview.originalWatts ? '+' : ''}{format(preview.watts - preview.originalWatts)} W</p>}
          </div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{text.range}</p><p className="mt-1 text-2xl font-semibold">{format(preview.lowWatts)}–{format(preview.highWatts)} W</p></div>
        </div>
        <p className="text-xs text-muted-foreground">{text.rangeHint}</p>
        {preview.calories && <section aria-label={text.calories} className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-medium">{text.calories}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{text.original}</p><p className="mt-1 text-xl font-semibold">{preview.calories.originalKcal === null ? text.noOriginal : `${format(preview.calories.originalKcal)} kcal`}</p></div>
            <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3"><p className="text-xs text-muted-foreground">{text.caloriesModel}</p><p className="mt-1 text-xl font-semibold text-orange-500">≈ {format(preview.calories.kcal)} kcal</p></div>
            <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{text.range}</p><p className="mt-1 text-xl font-semibold">{format(preview.calories.lowKcal)}–{format(preview.calories.highKcal)} kcal</p></div>
          </div>
          <p className="text-xs text-muted-foreground">{text.caloriesHint}</p>
          <p className="text-xs text-muted-foreground">{run ? text.runningCalories : text.cyclingCalories}</p>
          <p className="text-xs text-muted-foreground">{text.caloriesSaved}</p>
          <a className="text-xs text-orange-500 underline" href={run ? 'https://doi.org/10.1152/japplphysiol.01177.2001' : 'https://pubmed.ncbi.nlm.nih.gov/15241718/'} target="_blank" rel="noreferrer">{run ? text.source : text.energySource}</a>
        </section>}
        <p className="text-sm text-muted-foreground">{preview.parameters.surface === 'auto' ? `${text.coverage}: ${preview.surfaceCoverage} %` : text.manual}</p>
        {run && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{text.runHint}</p>}
      </>}
      {saved?.stale && <p role="status" className="text-sm text-amber-600 dark:text-amber-400">{text.stale}</p>}
      {saved && !accepted && <p className="text-sm text-muted-foreground">{text.savedOther}: {format(saved.payload.watts)} W</p>}
      {context && !context.sufficient && <p className="text-sm text-muted-foreground">{text.missing}</p>}
      {form && <details open={!preview}><summary className="cursor-pointer text-sm font-medium">{text.edit}</summary><fieldset disabled={disabled} className="mt-3 space-y-3">
        <legend className="mb-2 text-sm font-medium">{text.assumptions}{context?.gearName ? ` · ${context.gearName}` : ''}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">{text.weight}<input className={input} inputMode="decimal" value={form.riderKg} onChange={e => change('riderKg', e.target.value)} /></label>
          <label className="text-sm">{run ? text.runEquipment : text.equipment}<input className={input} inputMode="decimal" value={form.equipmentKg} onChange={e => change('equipmentKg', e.target.value)} /></label>
        </div>
        <p className="text-xs text-muted-foreground">{text.weightHint}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!run && <label className="text-sm">{text.tyre}<select className={input} value={form.tyres} onChange={e => change('tyres', e.target.value as Parameters['tyres'])}>{(['road', 'gravel', 'mtb'] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>}
          <label className="text-sm">{text.condition}<select className={input} value={form.condition} onChange={e => change('condition', e.target.value as Parameters['condition'])}>{(['dry', 'wet', 'soft'] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>
          <label className="text-sm">{text.surface}<select className={input} value={form.surface} onChange={e => change('surface', e.target.value as Parameters['surface'])}>{(['auto', 'asphalt', 'compacted', 'gravel', 'ground'] as const).map(key => <option key={key} value={key}>{key === 'gravel' ? text.loose : text[key]}</option>)}</select></label>
          <label className="text-sm">{text.route}<select className={input} disabled={form.surface !== 'auto' || disabled} value={form.routeId} onChange={e => change('routeId', e.target.value)}><option value="auto">{text.autoRoute}</option><option value="none">{text.noRoute}</option>{context?.routes.map(route => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
        </div>
        <details><summary className="cursor-pointer text-sm font-medium">{text.advanced}</summary><div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {!run && <label className="text-sm">{text.posture}<select className={input} value={form.posture} onChange={e => change('posture', e.target.value as Parameters['posture'])}>{(['aero', 'hoods', 'upright'] as const).map(key => <option key={key} value={key}>{text[key]}</option>)}</select></label>}
          <label className="text-sm">{text.wind}<input className={input} inputMode="decimal" value={form.windKmh} onChange={e => change('windKmh', e.target.value)} /></label>
          <label className="text-sm">{text.windFrom}<select className={input} value={form.windFrom} onChange={e => change('windFrom', Number(e.target.value))}>{['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((label, i) => <option key={label} value={i * 45}>{language === 'de' ? label.replace('E', 'O') : label}</option>)}</select></label>
        </div><p className="mt-2 text-xs text-muted-foreground">{text.windHint}</p></details>
        <button className={button} disabled={disabled || !context?.sufficient || !valid(parametersFor(form))} onClick={() => void calculate()}><RotateCcw size={15} />{busy ? text.working : text.calculate}</button>
        {!valid(parametersFor(form)) && <p className="text-sm text-amber-600 dark:text-amber-400">{text.needWeight}</p>}
      </fieldset></details>}
      {preview && <details><summary className="cursor-pointer text-sm font-medium">{text.details}</summary>
        <div className="mt-3 space-y-2 text-sm">
          {preview.route && <p className="break-words text-muted-foreground">{text.routeUsed}: {preview.route.name}</p>}
          <ul className="space-y-1">{preview.surfaces.map(item => <li key={item.surface} className="flex justify-between gap-3"><span>{text.surfaces[item.surface] || item.surface}</span><span className="whitespace-nowrap text-muted-foreground">{item.distanceM < 100 ? `${item.distanceM} m` : `${format(item.distanceM / 1000, 1)} km`} · {item.percent === 0 && item.distanceM > 0 ? `<${format(.1, 1)}` : format(item.percent, 1)} %</span></li>)}</ul>
          <p className="text-muted-foreground">{text.evaluated}: {format(preview.distanceM / 1000, 1)} km · {text.time}: {minutes(preview.seconds)}</p>
          {preview.excludedSeconds > 0 && <p className="text-muted-foreground">{text.excluded}: {minutes(preview.excludedSeconds)}</p>}
          <p className="text-xs text-muted-foreground">{text.gaps}</p>
          {run && <><p>{text.metabolic}: {format(preview.metabolicWatts || 0)} W</p><a className="text-orange-500 underline" href="https://doi.org/10.1152/japplphysiol.01177.2001" target="_blank" rel="noreferrer">{text.source}</a></>}
        </div>
      </details>}
      <p className="text-xs text-muted-foreground">{text.uncalibrated}</p>
      {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{text.errors[error] || text.errors.POWER_FAILED}
        {!context && <button className={`${button} ml-2`} onClick={() => setReload(value => value + 1)}>{text.calculate}</button>}
      </div>}
      <div className="flex flex-wrap gap-2">
        <button className={`${button} border-green-500/40 bg-green-500/10 text-green-600 dark:text-green-400`} disabled={disabled || !preview || accepted} onClick={() => void accept()}><Check size={15} />{accepted ? text.accepted : text.accept}</button>
        {saved && <button className={button} disabled={disabled} onClick={() => void remove()}>{text.remove}</button>}
      </div>
      <p className="text-xs text-muted-foreground">{text.preserved}</p>
    </CardContent>
    </details>
  </Card>
}
