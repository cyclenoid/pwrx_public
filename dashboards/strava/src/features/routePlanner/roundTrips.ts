import { draftFromSegments, isPoint } from './model'
import type { Point, Profile, RouteDraft } from './model'

export type Suggestion = { id: string; points: Point[]; meters: number; ascent: number | null; durationMinutes: number; surfaces: Record<string, number>; warnings: string[] }
export type Suggestions = { routes: Suggestion[]; missingTiles: string[]; partial: boolean }
export function validSuggestions(value: unknown): value is Suggestions {
  const d = value as Suggestions
  return !!d && Array.isArray(d.routes) && d.routes.length > 0 && d.routes.length <= 3
    && Array.isArray(d.missingTiles) && d.missingTiles.every(t => typeof t === 'string' && /^[EW]\d{1,3}_[NS]\d{1,2}\.rd5$/.test(t))
    && typeof d.partial === 'boolean' && d.routes.every(r => r && typeof r.id === 'string'
      && Array.isArray(r.points) && r.points.length >= 3 && r.points.length <= 50000 && r.points.every(isPoint)
      && Number.isFinite(r.meters) && r.meters > 0 && (r.ascent === null || (Number.isFinite(r.ascent) && r.ascent >= 0))
      && Number.isFinite(r.durationMinutes) && r.durationMinutes >= 0 && Array.isArray(r.warnings) && r.warnings.every(w => typeof w === 'string')
      && !!r.surfaces && Object.values(r.surfaces).every(v => Number.isFinite(v) && v >= 0 && v <= 100))
}
export function suggestionDraft(route: Suggestion, name: string): RouteDraft {
  const draft = draftFromSegments(name, [route.points])
  return { ...draft, legs: draft.legs.map(leg => leg ? { ...leg, source: 'routed' } : null) }
}
export function parseStart(value: string): Point | null {
  const parts = value.includes(';') ? value.split(';').map(s => s.trim().replace(',', '.')) : value.split(',').map(s => s.trim())
  if (parts.length !== 2 || parts.some(p => !/^-?\d+(\.\d+)?$/.test(p))) return null
  const [lat, lng] = parts.map(Number)
  return Number.isFinite(lat) && Math.abs(lat) <= 80 && Number.isFinite(lng) && Math.abs(lng) <= 180 ? { lat, lng } : null
}
export const tripText = {
  de: {
    title: 'Rundtour vorschlagen', start: 'Startpunkt', map: 'Auf Karte wählen', picking: 'Jetzt Startpunkt auf der Karte anklicken.',
    coordinates: 'Koordinaten (Breite, Länge)', useCoordinates: 'Koordinaten verwenden', current: 'Geräteposition', routeStart: 'Start des Entwurfs',
    length: 'Wunschlänge (km)', terrain: 'Höhencharakter', flat: 'Möglichst flach', hilly: 'Hügelig', mountain: 'Bergig',
    generate: 'Vorschläge berechnen', more: 'Andere Vorschläge', working: 'Suche nach unterschiedlichen Rundtouren …', cancel: 'Abbrechen',
    hint: '10–200 km. Länge und Höhencharakter sind Wünsche. Bis zu drei unterschiedliche Vorschläge; die Suche dauert höchstens etwa eine Minute.',
    privacy: 'Kartenklick und Koordinaten benötigen keine externe Ortssuche. Geräteposition benötigt Browserfreigabe; im lokalen HTTP-Netz ist sie eventuell nicht verfügbar.',
    proposal: 'Vorschlag', preview: 'Auf Karte ansehen', adopt: 'Im Editor übernehmen', chart: 'Höhenprofil', ascent: 'Anstieg ca.', duration: 'Fahrzeit ca.',
    kept: 'Vorschläge verändern deinen aktuellen Entwurf nicht. Erst „Im Editor übernehmen“ öffnet eine ungespeicherte, bearbeitbare Route.',
    partial: 'Weniger passende Varianten gefunden oder einzelne Berechnungen fehlgeschlagen. Angezeigt werden nur gültige Rundtouren.',
    missing: 'Für weitere Richtungen fehlen Routinggebiete:', unknown: 'Unbekannt', asphalt: 'Asphalt', paved: 'Sonstig befestigt', gravel: 'Schotter / verdichtet', natural: 'Naturboden',
    safety: 'OSM-Daten sind keine Garantie für Befahrbarkeit, Freigabe oder aktuellen Zustand. Untergrundanteile können unbekannt sein.',
    mtb: 'MTB kann technisch anspruchsvolle Wege enthalten. Eine zuverlässige Schwierigkeitsbewertung ist noch nicht verfügbar; prüfe die Strecke vor der Fahrt.',
    geoFailed: 'Geräteposition nicht verfügbar oder nicht freigegeben. Bitte Karte oder Koordinaten verwenden.',
    invalid: 'Bitte gültige Koordinaten und eine Länge zwischen 10 und 200 km angeben.',
    noRoute: 'Keine geeignete Rundtour gefunden. Bitte Startpunkt, Länge oder Profil ändern und die Routinggebiete prüfen.',
    failed: 'Die Vorschläge konnten nicht geladen werden. Dein Entwurf bleibt erhalten.',
    previewHint: 'Vorschau: Dein Entwurf bleibt erhalten.', closePreview: 'Vorschau schließen',
    warnings: { LENGTH: 'Wunschlänge um mehr als 15 % verfehlt', ELEVATION: 'Höhenwunsch nur näherungsweise getroffen', SURFACE: 'Mehr als 20 % Untergrund unbekannt', REPEATED: 'Enthält längere gemeinsame Hin- und Rückwege' } as Record<string, string>,
  },
  en: {
    title: 'Suggest a round trip', start: 'Starting point', map: 'Choose on map', picking: 'Click the starting point on the map.',
    coordinates: 'Coordinates (latitude, longitude)', useCoordinates: 'Use coordinates', current: 'Device location', routeStart: 'Draft starting point',
    length: 'Target distance (km)', terrain: 'Elevation preference', flat: 'As flat as possible', hilly: 'Hilly', mountain: 'Mountainous',
    generate: 'Generate suggestions', more: 'Different suggestions', working: 'Looking for different round trips …', cancel: 'Cancel',
    hint: '10–200 km. Distance and elevation are preferences. Up to three different suggestions; search takes up to about one minute.',
    privacy: 'Map clicks and coordinates need no external place search. Device location needs browser permission and may be unavailable over local HTTP.',
    proposal: 'Suggestion', preview: 'Preview on map', adopt: 'Open in editor', chart: 'Elevation profile', ascent: 'Ascent approx.', duration: 'Ride time approx.',
    kept: 'Suggestions do not change your current draft. Only “Open in editor” creates an unsaved, editable route.',
    partial: 'Fewer suitable variants found or some calculations failed. Only valid round trips are shown.',
    missing: 'Routing regions missing in other directions:', unknown: 'Unknown', asphalt: 'Asphalt', paved: 'Other paved', gravel: 'Gravel / compacted', natural: 'Natural ground',
    safety: 'OSM data does not guarantee rideability, access or current conditions. Surface may be unknown.',
    mtb: 'MTB may include technically difficult trails. Reliable difficulty grading is not available yet; check the route before riding.',
    geoFailed: 'Device location is unavailable or permission was denied. Use the map or coordinates.',
    invalid: 'Enter valid coordinates and a distance between 10 and 200 km.',
    noRoute: 'No suitable round trip found. Change the start, distance or profile and check routing coverage.',
    failed: 'Unable to load suggestions. Your draft is preserved.',
    previewHint: 'Preview: your draft is preserved.', closePreview: 'Close preview',
    warnings: { LENGTH: 'More than 15% from target distance', ELEVATION: 'Elevation preference only approximately matched', SURFACE: 'More than 20% unknown surface', REPEATED: 'Includes longer shared outward/return sections' } as Record<string, string>,
  },
}
export type TripChoice = { route: Suggestion; profile: Profile }
