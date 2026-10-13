import { isDraft } from './model'
import type { Profile, RouteDraft } from './model'
export const API_ROOT = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
export type RouteDocument = { draft: RouteDraft; profile: Profile; mode: 'routed' | 'direct' }
export type SavedRoute = { id: string; name: string; revision: number; distance_m: number; updated_at: string }
export async function libraryRequest<T>(path = '', init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}/route-library${path}`, { ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (response.status === 204) return undefined as T
  const data = await response.json().catch(() => { throw new Error('ROUTE_STORAGE_ERROR') })
  if (!response.ok) throw new Error(data.code || 'ROUTE_STORAGE_ERROR')
  return data as T
}
export function validSavedRoute(value: unknown): value is SavedRoute & { document: RouteDocument } {
  const r = value as SavedRoute & { document: RouteDocument }
  return !!r && typeof r.id === 'string' && Number.isSafeInteger(r.revision) && r.revision > 0 && !!r.document
    && isDraft(r.document.draft) && ['road', 'gravel', 'touring'].includes(r.document.profile)
    && ['routed', 'direct'].includes(r.document.mode)
}
export const libraryText = {
  de: {
    preview: 'Kartenvorschau', previewLoading: 'Kartenvorschau wird geladen …', previewFailed: 'Kartenvorschau nicht verfügbar.', retry: 'Erneut versuchen',
    title: 'Gespeicherte Routen', new: 'Neue Route', save: 'Route speichern', copy: 'Als neue Route speichern', saved: 'Gespeichert',
    saveHint: 'Auf deinem PWRX-Server gespeichert und auf allen Geräten verfügbar.', nameRequired: 'Bitte einen Namen für die Route eingeben.',
    loading: 'Routen werden geladen …', search: 'Routen suchen', searchButton: 'Suchen', empty: 'Keine gespeicherten Routen gefunden.',
    open: 'Öffnen', download: 'GPX', remove: 'Löschen', removeConfirm: 'Diese gespeicherte Route wirklich löschen?',
    next: 'Weitere', previous: 'Zurück', back: 'Routenplaner', fromActivity: 'Als Route planen',
    color: 'Kartenfarben', origin: 'Original / berechnet', surface: 'Untergrund', highway: 'Wegeart',
    dataHint: 'OSM-Daten, keine Befahrbarkeitsgarantie. Radweg beschreibt die Wegeart, nicht den Belag. Fehlende Angaben bleiben unbekannt.',
    importHint: 'Importierte und ältere Abschnitte haben keine Wege-Tags. „Alle Abschnitte neu berechnen“ ergänzt Daten, kann aber den Verlauf ändern.',
    gravelHint: 'Gravel gewichtet OSM-Angaben zu Belag, Wegeart, Beschaffenheit und Zugang. Es prüft weder aktuellen Zustand noch Sperrungen vor Ort.',
    errors: {
      ROUTE_CONFLICT: 'Die Route wurde inzwischen geändert oder gelöscht. Bitte neu öffnen oder als neue Route speichern.',
      ROUTE_NOT_FOUND: 'Diese gespeicherte Route wurde nicht gefunden.',
      ROUTE_STORAGE_ERROR: 'Speichern oder Laden fehlgeschlagen. Dein aktueller Entwurf bleibt erhalten.',
      ROUTE_TOO_LARGE: 'Die Route ist zu groß zum Speichern (maximal 20 MB).',
      INVALID_ROUTE: 'Bitte einen Namen und eine gültige Route mit mindestens zwei Punkten angeben.',
      ACTIVITY_NO_GPS: 'Diese Aktivität enthält keinen nutzbaren GPS-Track.',
    },
  },
  en: {
    preview: 'Map preview', previewLoading: 'Loading map preview …', previewFailed: 'Map preview unavailable.', retry: 'Try again',
    title: 'Saved routes', new: 'New route', save: 'Save route', copy: 'Save as new route', saved: 'Saved',
    saveHint: 'Saved on your PWRX server and available on all devices.', nameRequired: 'Please enter a route name.',
    loading: 'Loading routes …', search: 'Search routes', searchButton: 'Search', empty: 'No saved routes found.',
    open: 'Open', download: 'GPX', remove: 'Delete', removeConfirm: 'Really delete this saved route?',
    next: 'More', previous: 'Previous', back: 'Route planner', fromActivity: 'Plan as route',
    color: 'Map colors', origin: 'Original / calculated', surface: 'Surface', highway: 'Way type',
    dataHint: 'OSM data, not a rideability guarantee. Cycleway describes the way type, not its surface. Missing data remains unknown.',
    importHint: 'Imported and older sections have no way tags. Recalculating all sections adds data but can change the route.',
    gravelHint: 'Gravel weighs OSM surface, way type, condition and access tags. It does not verify current conditions or closures on site.',
    errors: {
      ROUTE_CONFLICT: 'The route has changed or was deleted. Reopen it or save as a new route.',
      ROUTE_NOT_FOUND: 'Saved route not found.',
      ROUTE_STORAGE_ERROR: 'Saving or loading failed. Your current draft is preserved.',
      ROUTE_TOO_LARGE: 'This route is too large to save (maximum 20 MB).',
      INVALID_ROUTE: 'Enter a name and a valid route with at least two points.',
      ACTIVITY_NO_GPS: 'This activity has no usable GPS track.',
    },
  },
}
