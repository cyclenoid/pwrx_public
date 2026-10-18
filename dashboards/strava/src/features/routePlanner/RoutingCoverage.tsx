import { useEffect, useRef, useState } from 'react'
import { MapContainer, Rectangle, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { MapTileLayer } from '../../components/MapTileLayer'
import { API_ROOT } from './library'

type Tile = { name: string; bounds: [LatLngTuple, LatLngTuple]; bytes: number; updatedAt: string }
type Coverage = { status: 'known' | 'unknown' | 'unavailable'; tiles: Tile[] }
const words = {
  de: {
    title: 'Routinggebiete', loading: 'Gebiete werden geprüft …', loaded: 'geladen', missing: 'Nicht geladen', unknown: 'Lokale Routing-Abdeckung nicht verfügbar.',
    hint: 'Die Hintergrundkarte ist weltweit verfügbar. Routen lassen sich dort berechnen, wo lokale Routingdaten geladen sind.',
    mapHint: 'Grün: geladen. Klicke auf die Karte, um andere Gebiete zu prüfen.', close: 'Schließen', retry: 'Neu prüfen',
    empty: 'Es sind keine Routinggebiete geladen.', files: 'Verfügbare Gebietsdateien', fileHint: 'Jede Datei deckt 5 × 5 Grad ab. Auch Nachbargebiete können für Umwege nötig sein.',
    unknownHint: 'Der Routingdienst kann trotzdem verfügbar sein. Die Dateiliste lässt sich hier nicht lesen.',
  },
  en: {
    title: 'Routing regions', loading: 'Checking regions …', loaded: 'loaded', missing: 'Not loaded', unknown: 'Local routing coverage unavailable.',
    hint: 'The background map is available worldwide. Route calculations require locally installed routing data.',
    mapHint: 'Green: loaded. Click the map to check other regions.', close: 'Close', retry: 'Check again',
    empty: 'No routing regions are installed.', files: 'Available region files', fileHint: 'Each file covers 5 × 5 degrees. Detours may need adjacent regions too.',
    unknownHint: 'The routing service may still be available. Its file inventory cannot be read here.',
  },
}

function InspectRegion({ tiles, onSelect }: { tiles: Tile[]; onSelect: (tile: Pick<Tile, 'name' | 'bounds'>) => void }) {
  const map = useMapEvents({ click: e => {
    const lat = Math.max(-90, Math.min(85, Math.floor(e.latlng.lat / 5) * 5))
    const lng = Math.floor(((e.latlng.lng + 180) % 360 + 360) % 360 / 5) * 5 - 180
    onSelect({ name: `${lng < 0 ? 'W' : 'E'}${Math.abs(lng)}_${lat < 0 ? 'S' : 'N'}${Math.abs(lat)}.rd5`, bounds: [[lat, lng], [lat + 5, lng + 5]] })
  } })
  useEffect(() => {
    let fitted = false
    const resize = () => {
      const container = map.getContainer()
      if (!container.clientWidth || !container.clientHeight) return
      map.invalidateSize()
      if (!fitted && tiles.length) {
        map.fitBounds(tiles.flatMap(tile => tile.bounds), { padding: [18, 18], maxZoom: 7, animate: false })
        fitted = true
      }
    }
    const observer = new ResizeObserver(resize)
    observer.observe(map.getContainer())
    resize()
    return () => observer.disconnect()
  }, [map, tiles])
  return null
}

function FocusRegion({ tile }: { tile: Pick<Tile, 'name' | 'bounds'> | null }) {
  const map = useMap()
  useEffect(() => { if (tile) map.fitBounds(tile.bounds, { padding: [18, 18], maxZoom: 8 }) }, [map, tile])
  return null
}

export function RoutingCoverage({ language }: { language: 'de' | 'en' }) {
  const text = words[language]
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0)
  const [data, setData] = useState<Coverage | null>(null)
  const [selected, setSelected] = useState<Pick<Tile, 'name' | 'bounds'> | null>(null)
  useEffect(() => {
    const abort = new AbortController()
    setData(null)
    fetch(`${API_ROOT}/route-planner/coverage`, { signal: AbortSignal.any([abort.signal, AbortSignal.timeout(10000)]) })
      .then(r => { if (!r.ok) throw new Error(); return r.json() as Promise<Coverage> })
      .then(value => { if (!abort.signal.aborted) setData(value) })
      .catch(() => { if (!abort.signal.aborted) setData({ status: 'unavailable', tiles: [] }) })
    return () => abort.abort()
  }, [refresh])
  useEffect(() => { if (open) dialog.current?.showModal() }, [open])
  const known = data?.status === 'known'
  const selectedLoaded = selected && data?.tiles.some(tile => tile.name === selected.name)
  return <>
    <button type="button" className="w-full rounded-lg border bg-secondary/30 px-3 py-2 text-left text-sm hover:bg-secondary" onClick={() => setOpen(true)}>
      <span className="font-medium">{text.title}</span>
      <span className={`mt-1 block text-xs ${known ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
        {!data ? text.loading : known ? `${data.tiles.length} ${text.loaded} · ${(data.tiles.reduce((n, tile) => n + tile.bytes, 0) / 2 ** 20).toLocaleString(language, { maximumFractionDigits: 0 })} MiB` : text.unknown}
      </span>
    </button>
    {open && <dialog ref={dialog} onClose={() => setOpen(false)} style={{ backgroundColor: 'hsl(var(--background))', color: 'hsl(var(--foreground))' }} className="m-auto max-h-[92dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-xl border bg-background p-4 text-foreground backdrop:bg-black/70" aria-labelledby="routing-coverage-title">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 id="routing-coverage-title" className="text-lg font-bold">{text.title}</h2><button type="button" className="rounded-lg border px-3 py-2 text-sm hover:bg-secondary" onClick={() => dialog.current?.close()}>{text.close}</button></div>
      <p className="mb-3 text-sm text-muted-foreground">{text.hint}</p>
      {known && <>
        <p className="mb-2 text-sm">{text.mapHint}</p>
        <div className="relative isolate h-72 overflow-hidden rounded-lg border sm:h-96">
          <MapContainer center={[50, 10]} zoom={5} className="h-full w-full">
            <MapTileLayer /><InspectRegion tiles={data.tiles} onSelect={setSelected} /><FocusRegion tile={selected} />
            {data.tiles.map(tile => <Rectangle key={tile.name} bounds={tile.bounds} pathOptions={{ color: '#22c55e', fillOpacity: 0.16, weight: 2 }} interactive={false}><Tooltip>{tile.name} · {text.loaded}</Tooltip></Rectangle>)}
            {selected && <Rectangle bounds={selected.bounds} pathOptions={{ color: selectedLoaded ? '#22c55e' : '#f59e0b', fillOpacity: .12, weight: 3, dashArray: selectedLoaded ? undefined : '6 6' }} interactive={false} />}
          </MapContainer>
        </div>
        <p className="my-3 rounded-lg bg-secondary/50 p-3 text-sm" role="status">{selected ? `${selected.name}: ${selectedLoaded ? text.loaded : text.missing}` : text.fileHint}</p>
        {!data.tiles.length && <p>{text.empty}</p>}
        <ul className="my-3 grid gap-2 sm:grid-cols-2">{data.tiles.map(tile => <li key={tile.name}><button type="button" className="w-full rounded-lg border p-3 text-left text-sm hover:bg-secondary" onClick={() => setSelected(tile)}>
          <span className="font-medium text-green-600 dark:text-green-400">{tile.name}</span><span className="ml-2 text-muted-foreground">{(tile.bytes / 2 ** 20).toFixed(1)} MiB</span>
          <span className="mt-1 block text-xs text-muted-foreground">{tile.bounds[0][0]}° … {tile.bounds[1][0]}° / {tile.bounds[0][1]}° … {tile.bounds[1][1]}°</span>
        </button></li>)}</ul>
      </>}
      {!known && <p role="status" className="my-4 text-sm text-muted-foreground">{data ? `${text.unknown} ${text.unknownHint}` : text.loading}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"><a href="https://brouter.de/brouter/segments4/" target="_blank" rel="noreferrer" className="text-orange-500 underline">{text.files}</a><button type="button" disabled={!data} className="rounded-lg border px-3 py-2 hover:bg-secondary disabled:opacity-50" onClick={() => setRefresh(value => value + 1)}>{text.retry}</button></div>
    </dialog>}
  </>
}
