import { useEffect, useRef, useState } from 'react'
import { MapContainer, Polyline, useMap } from 'react-leaflet'
import type { LatLngTuple } from 'leaflet'
import { MapTileLayer } from '../../components/MapTileLayer'
import { libraryRequest, libraryText } from './library'

type Preview = { segments: LatLngTuple[][]; bounds: [LatLngTuple, LatLngTuple] | null }

function FitPreview({ bounds }: { bounds: [LatLngTuple, LatLngTuple] }) {
  const map = useMap()
  useEffect(() => {
    const fit = () => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [16, 16], maxZoom: 15, animate: false })
    }
    const observer = new ResizeObserver(fit)
    observer.observe(map.getContainer())
    fit()
    return () => observer.disconnect()
  }, [map, bounds])
  return null
}

export function RoutePreview({ id, language }: { id: string; language: 'de' | 'en' }) {
  const text = libraryText[language]
  const container = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [data, setData] = useState<Preview | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect() }
    }, { rootMargin: '200px' })
    if (container.current) observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    const abort = new AbortController()
    setFailed(false)
    libraryRequest<Preview>(`/${id}/preview`, { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted) setData(value) })
      .catch(() => { if (!abort.signal.aborted) setFailed(true) })
    return () => abort.abort()
  }, [id, visible, attempt])
  return <div ref={container} className="relative isolate h-48 overflow-hidden border-b bg-secondary/30" aria-label={text.preview}>
    {data?.bounds ? <MapContainer bounds={data.bounds} boundsOptions={{ padding: [16, 16], maxZoom: 15 }} className="h-full w-full"
      zoomControl={false} dragging={false} scrollWheelZoom={false} doubleClickZoom={false} touchZoom={false} boxZoom={false} keyboard={false}>
      <MapTileLayer />
      <FitPreview bounds={data.bounds} />
      {data.segments.map((segment, index) => <Polyline key={index} positions={segment} pathOptions={{ color: '#fc4c02', weight: 3, opacity: 0.95 }} interactive={false} />)}
    </MapContainer> : <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground" role="status">
      {failed || data ? text.previewFailed : text.previewLoading}
      {failed && <button className="rounded-lg border px-3 py-2 hover:bg-secondary" onClick={() => setAttempt(value => value + 1)}>{text.retry}</button>}
    </div>}
  </div>
}
