import { useEffect, useRef, useState } from 'react'
import { ChevronDown, MapPin, RefreshCw } from 'lucide-react'
import type { Point, Profile } from './model'
import { API_ROOT } from './library'
import { plannerText } from './text'
import { parseStart, tripText, validSuggestions } from './roundTrips'
import type { Suggestions, TripChoice } from './roundTrips'
import { TripPreview } from './TripPreview'

const button = 'rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40'
const input = 'mt-1 w-full min-w-0 rounded-lg border bg-background px-3 py-2 text-sm'
type Props = { language: 'de' | 'en'; start: Point | null; routeStart?: Point; picking: boolean; disabled: boolean; configured: boolean;
  onStart: (p: Point) => void; onPick: () => void; onBusy: (value: boolean) => void; onClearPreview: () => void; onPreview: (choice: TripChoice) => void; onAdopt: (choice: TripChoice) => void }
export function RoundTripPanel(props: Props) {
  const text = tripText[props.language], profiles = plannerText[props.language]
  const [length, setLength] = useState('60'), [profile, setProfile] = useState<Profile>('gravel')
  const [terrain, setTerrain] = useState('flat'), [coordinates, setCoordinates] = useState('')
  const [working, setWorking] = useState(false), [error, setError] = useState('')
  const [results, setResults] = useState<{ data: Suggestions; key: string } | null>(null), [selected, setSelected] = useState('')
  const pending = useRef<AbortController | null>(null), variation = useRef(0)
  const locationToken = useRef(0)
  const queryKey = JSON.stringify([props.start?.lat, props.start?.lng, length, profile, terrain])
  const visible = results?.key === queryKey ? results.data : null
  const disabled = props.disabled || working
  useEffect(() => () => { pending.current?.abort(); locationToken.current++ }, [])
  const generate = async () => {
    const lengthKm = length.trim() ? Number(length.replace(',', '.')) : NaN
    if (!props.start || !Number.isFinite(lengthKm) || lengthKm < 10 || lengthKm > 200) { setError(text.invalid); return }
    if (pending.current) return
    const abort = new AbortController(); pending.current = abort
    setWorking(true); props.onBusy(true); props.onClearPreview(); setError(''); locationToken.current++
    try {
      const response = await fetch(`${API_ROOT}/route-planner/round-trips`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: props.start, lengthKm, profile, terrain, variation: variation.current++ % 1000 }),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(75000)]),
      })
      const data = await response.json()
      if (!response.ok) {
        if (data.code === 'ROUTING_REGION_MISSING' && /^[EW]\d{1,3}_[NS]\d{1,2}\.rd5$/.test(data.tile)) throw new Error(`${text.missing} ${data.tile}`)
        throw new Error(data.code === 'NO_ROUND_TRIP' ? text.noRoute : profiles.errors[data.code as keyof typeof profiles.errors] || text.failed)
      }
      if (!validSuggestions(data)) throw new Error(text.failed)
      if (!abort.signal.aborted) { setResults({ data, key: queryKey }); setSelected('') }
    } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : text.failed) }
    finally { if (pending.current === abort) { pending.current = null; setWorking(false); props.onBusy(false) } }
  }
  const locate = () => {
    const token = ++locationToken.current
    if (!navigator.geolocation || !window.isSecureContext) { setError(text.geoFailed); return }
    navigator.geolocation.getCurrentPosition(p => {
      if (token === locationToken.current) { props.onStart({ lat: p.coords.latitude, lng: p.coords.longitude }); setError('') }
    }, () => { if (token === locationToken.current) setError(text.geoFailed) }, { timeout: 10000, maximumAge: 60000 })
  }
  const number = (v: number, digits = 0) => v.toLocaleString(props.language, { maximumFractionDigits: digits })
  return <details className="group rounded-xl border border-orange-500/30 bg-orange-500/5">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span className="flex items-center gap-2"><RefreshCw size={16} className="text-orange-500" />{text.title}</span><ChevronDown size={15} className="group-open:rotate-180" /></summary>
    <div className="space-y-4 border-t p-3">
      <fieldset disabled={disabled} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">{text.start}</legend>
        <div className="grid grid-cols-2 gap-2"><button type="button" className={`${button} ${props.picking ? 'bg-orange-500/20' : ''}`} aria-pressed={props.picking} onClick={() => { locationToken.current++; props.onPick() }}><MapPin size={14} className="mr-1 inline" />{text.map}</button><button type="button" className={button} onClick={locate}>{text.current}</button></div>
        {props.picking && <p role="status" className="text-sm text-orange-500">{text.picking}</p>}
        {props.routeStart && <button type="button" className={`${button} w-full`} onClick={() => { locationToken.current++; props.onStart(props.routeStart!) }}>{text.routeStart}</button>}
        <label className="block text-xs">{text.coordinates}<input className={input} placeholder="49.8728, 8.6512" value={coordinates} onChange={e => setCoordinates(e.target.value)} /></label>
        <button type="button" className={`${button} w-full`} onClick={() => { const p = parseStart(coordinates); locationToken.current++; if (p) { props.onStart(p); setError('') } else setError(text.invalid) }}>{text.useCoordinates}</button>
        {props.start && <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs">{text.start}: {props.start.lat.toFixed(5)}, {props.start.lng.toFixed(5)}</p>}
        <label className="block text-sm">{text.length}<input className={input} inputMode="decimal" value={length} onChange={e => { setLength(e.target.value); props.onClearPreview() }} /></label>
        <label className="block text-sm">{profiles.profile}<select aria-label={profiles.profile} className={input} value={profile} onChange={e => { setProfile(e.target.value as Profile); props.onClearPreview() }}>{(['road', 'gravel', 'touring', 'mtb'] as const).map(key => <option value={key} key={key}>{profiles[key]}</option>)}</select></label>
        <label className="block text-sm">{text.terrain}<select aria-label={text.terrain} className={input} value={terrain} onChange={e => { setTerrain(e.target.value); props.onClearPreview() }}>{(['flat', 'hilly', 'mountain'] as const).map(key => <option value={key} key={key}>{text[key]}</option>)}</select></label>
      </fieldset>
      <p className="text-xs text-muted-foreground">{text.hint}</p>
      <p className="text-xs text-muted-foreground">{text.privacy}</p>
      <button type="button" className={`${button} w-full border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400`} disabled={disabled || !props.configured || !props.start || props.picking} onClick={() => void generate()}>{visible ? text.more : text.generate}</button>
      {working && <div role="status" className="space-y-2 text-sm"><p>{text.working}</p><button type="button" className={button} onClick={() => pending.current?.abort()}>{text.cancel}</button></div>}
      {error && <p role="alert" className="break-words text-sm text-red-600 dark:text-red-400">{error}</p>}
      {visible && <div className="space-y-3" aria-label={text.title}>
        <p className="text-xs text-muted-foreground">{text.kept}</p>
        {visible.partial && <p role="status" className="text-xs text-amber-600 dark:text-amber-400">{text.partial}</p>}
        {visible.missingTiles.length > 0 && <p className="text-xs text-amber-600 dark:text-amber-400">{text.missing} {visible.missingTiles.join(', ')}</p>}
        {visible.routes.map((r, i) => <article key={r.id} className={`space-y-3 rounded-xl border bg-card p-3 ${selected === r.id ? 'border-orange-500 bg-orange-500/10' : ''}`}>
          <h3 className="text-sm font-semibold">{text.proposal} {i + 1}</h3>
          <TripPreview points={r.points} label={`${text.proposal} ${i + 1} · ${text.chart}`} />
          <p className="text-lg font-semibold text-orange-500">{number(r.meters / 1000, 1)} km <span className="text-sm text-foreground">· {r.ascent === null ? '–' : number(r.ascent)} m ↗</span></p>
          <p className="text-xs text-muted-foreground">{text.duration}: {Math.floor(r.durationMinutes / 60)}:{String(r.durationMinutes % 60).padStart(2, '0')} h · {text.ascent}: {r.ascent === null ? '–' : `${number(r.ascent)} m`}</p>
          <ul className="space-y-1 text-xs">{(['asphalt', 'paved', 'gravel', 'natural', 'unknown'] as const).filter(key => r.surfaces[key] > 0).map(key => <li className="flex justify-between gap-2" key={key}><span>{text[key]}</span><span>{r.surfaces[key]} %</span></li>)}</ul>
          {r.warnings.map(w => <p className="text-xs text-amber-600 dark:text-amber-400" key={w}>{text.warnings[w] || w}</p>)}
          <button type="button" className={`${button} w-full`} disabled={disabled} onClick={() => { setSelected(r.id); props.onPreview({ route: r, profile }) }}>{text.preview}</button>
          <button type="button" className={`${button} w-full border-orange-500/40 bg-orange-500/15 text-orange-600 dark:text-orange-400`} disabled={disabled} onClick={() => props.onAdopt({ route: r, profile })}>{text.adopt}</button>
        </article>)}
      </div>}
      <p className="text-xs text-muted-foreground">{text.safety}</p>
      {profile === 'mtb' && <p className="text-xs text-amber-600 dark:text-amber-400">{text.mtb}</p>}
    </div>
  </details>
}
