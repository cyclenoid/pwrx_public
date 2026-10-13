import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Route, Plus, Search, Trash2, Download } from 'lucide-react'
import { ThemeToggle } from '../components/ThemeToggle'
import { libraryRequest, libraryText, validSavedRoute } from '../features/routePlanner/library'
import type { SavedRoute } from '../features/routePlanner/library'
import { exportGpx } from '../features/routePlanner/gpx'

const button = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-secondary disabled:opacity-40'
export function RouteLibrary() {
  const { i18n } = useTranslation()
  const text = libraryText[i18n.language.startsWith('de') ? 'de' : 'en']
  const [search, setSearch] = useState(''), [query, setQuery] = useState('')
  const [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0)
  const [rows, setRows] = useState<SavedRoute[]>([]), [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const report = (e: unknown) => {
    const code = e instanceof Error ? e.message : ''
    setError(text.errors[code as keyof typeof text.errors] || text.errors.ROUTE_STORAGE_ERROR)
  }
  useEffect(() => {
    const abort = new AbortController()
    setLoading(true); setError('')
    libraryRequest<{ routes: SavedRoute[]; more: boolean }>(`?search=${encodeURIComponent(query)}&offset=${offset}`, { signal: abort.signal })
      .then(data => { if (!abort.signal.aborted) { setRows(data.routes); setMore(data.more) } })
      .catch(e => { if (!abort.signal.aborted) report(e) })
      .finally(() => { if (!abort.signal.aborted) setLoading(false) })
    return () => abort.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, offset, refresh, i18n.language])
  const remove = async (row: SavedRoute) => {
    if (!window.confirm(`${text.removeConfirm}\n${row.name}`)) return
    setBusy(true); setError('')
    try {
      await libraryRequest(`/${row.id}?revision=${row.revision}`, { method: 'DELETE' })
      if (rows.length === 1 && offset) setOffset(offset - 50)
      else setRefresh(v => v + 1)
    } catch (e) { report(e) } finally { setBusy(false) }
  }
  const download = async (row: SavedRoute) => {
    setBusy(true); setError('')
    try {
      const route = await libraryRequest(`/${row.id}`)
      if (!validSavedRoute(route)) throw new Error('ROUTE_STORAGE_ERROR')
      const url = URL.createObjectURL(new Blob([exportGpx(route.document.draft)], { type: 'application/gpx+xml' }))
      const a = document.createElement('a'); a.href = url
      a.download = `${row.name.replace(/[<>:"/\\|?*]/g, '-').slice(0, 100)}.gpx`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { report(e) } finally { setBusy(false) }
  }
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4 md:px-8">
      <div className="flex items-center gap-3"><Link className={button} to="/routes" aria-label={text.back}><ArrowLeft size={18} /></Link><h1 className="flex items-center gap-2 text-xl font-bold"><Route />{text.title}</h1></div>
      <div className="flex gap-3"><Link to="/routes" className={`${button} border-orange-500/40 bg-orange-500/15 text-orange-500`}><Plus size={18} />{text.new}</Link><ThemeToggle /></div>
    </header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <p className="text-sm text-muted-foreground">{text.saveHint}</p>
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); setQuery(search); setOffset(0); setRefresh(v => v + 1) }}>
        <input aria-label={text.search} placeholder={text.search} className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} />
        <button className={button}><Search size={16} />{text.searchButton}</button>
      </form>
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-500">{error}</p>}
      {loading ? <p role="status">{text.loading}</p> : !error && !rows.length ? <p className="rounded-xl border border-dashed p-10 text-center text-muted-foreground">{text.empty}</p> : <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {rows.map(row => <article key={row.id} className="rounded-xl border bg-card p-5">
          <h2 className="break-words text-lg font-semibold">{row.name}</h2>
          <p className="mt-2 text-2xl font-bold text-orange-500">{(row.distance_m / 1000).toLocaleString(i18n.language, { maximumFractionDigits: 1 })} km</p>
          <p className="mt-1 text-xs text-muted-foreground">{new Date(row.updated_at).toLocaleString(i18n.language)}</p>
          <div className="mt-5 flex flex-wrap gap-2"><Link className={`${button} flex-1`} to={`/routes?saved=${row.id}`}>{text.open}</Link><button className={button} disabled={busy} onClick={() => void download(row)}><Download size={16} />{text.download}</button><button className={button} disabled={busy} aria-label={`${text.remove}: ${row.name}`} onClick={() => void remove(row)}><Trash2 size={16} /></button></div>
        </article>)}
      </div>}
      <div className="flex justify-between"><button className={button} disabled={loading || offset === 0} onClick={() => setOffset(offset - 50)}>{text.previous}</button><button className={button} disabled={loading || !more} onClick={() => setOffset(offset + 50)}>{text.next}</button></div>
    </main>
  </div>
}
