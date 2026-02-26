import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2) + ' km'
}

export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function formatElevation(meters: number): string {
  return Math.round(meters) + ' m'
}

export function formatPace(metersPerSecond: number): string {
  const minutesPerKm = 1000 / (metersPerSecond * 60)
  const minutes = Math.floor(minutesPerKm)
  const seconds = Math.round((minutesPerKm - minutes) * 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')} min/km`
}

export function formatSpeed(metersPerSecond: number): string {
  const kmh = metersPerSecond * 3.6
  return kmh.toFixed(1) + ' km/h'
}

export function formatClimbCategory(
  value: number | null | undefined,
  options?: { source?: string | null; isAutoClimb?: boolean | null }
): string | null {
  if (value === null || value === undefined) return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 0) return 'HC'
  if (numeric === 0) {
    const source = String(options?.source || '').toLowerCase()
    if (source === 'local' || options?.isAutoClimb) return 'HC'
    return null
  }
  return `Cat ${Math.max(1, Math.round(numeric))}`
}
