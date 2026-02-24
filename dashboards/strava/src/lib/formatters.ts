import i18n from '../i18n'

const getLocale = () => (i18n.language?.startsWith('de') ? 'de-DE' : 'en-US')

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString(getLocale(), {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatCompactNumber(value: number): string {
  if (value >= 1000000) {
    return formatNumber(value / 1000000, 1) + 'M'
  }
  if (value >= 1000) {
    return formatNumber(value / 1000, 1) + 'k'
  }
  return formatNumber(value)
}

export function formatKm(value: number, decimals = 1): string {
  return formatNumber(value, decimals) + ' km'
}

export function formatMeters(value: number): string {
  return formatNumber(Math.round(value)) + ' m'
}

export function formatHours(value: number, decimals = 0): string {
  return formatNumber(value, decimals) + ' h'
}

export function formatDurationFromSeconds(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function formatDurationLong(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export function formatSpeed(kmh: number): string {
  return formatNumber(kmh, 1) + ' km/h'
}

export function formatPace(kmh: number): string {
  if (kmh <= 0) return '-'
  const minPerKm = 60 / kmh
  const minutes = Math.floor(minPerKm)
  const seconds = Math.round((minPerKm - minutes) * 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`
}

export function formatWatts(watts: number): string {
  return Math.round(watts) + ' W'
}

export function formatHeartrate(bpm: number): string {
  return Math.round(bpm) + ' bpm'
}

export function formatCalories(kcal: number): string {
  return formatNumber(Math.round(kcal)) + ' kcal'
}

// Chart axis formatters
export function axisKm(value: number): string {
  if (value >= 1000) {
    return formatNumber(value / 1000, 0) + 'k'
  }
  return formatNumber(value) + ''
}

export function axisMeters(value: number): string {
  if (value >= 1000) {
    return formatNumber(value / 1000, 1) + 'k'
  }
  return formatNumber(value) + ''
}

export function axisHours(value: number): string {
  return formatNumber(value) + 'h'
}

// Percentage change formatter
export function formatChange(current: number, previous: number): { value: string; positive: boolean } {
  if (previous === 0) {
    return { value: '+100%', positive: true }
  }
  const change = ((current - previous) / previous) * 100
  const positive = change >= 0
  return {
    value: `${positive ? '+' : ''}${formatNumber(change, 1)}%`,
    positive,
  }
}
