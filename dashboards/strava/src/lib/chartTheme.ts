/**
 * Centralized Chart Theme Configuration
 * Provides consistent colors for charts in both light and dark mode
 */

export type ChartTheme = 'light' | 'dark'

export interface ChartColors {
  // Grid and axes
  grid: string
  axis: string

  // Primary colors (Strava orange variations)
  primary: string
  primaryLight: string
  primaryDark: string

  // Secondary colors
  secondary: string
  secondaryLight: string

  // Accent colors for different data series
  accent1: string
  accent2: string
  accent3: string
  accent4: string
  accent5: string

  // Status colors
  success: string
  warning: string
  danger: string
  info: string

  // Neutral colors
  text: string
  textMuted: string
  background: string
  backgroundAlt: string

  // Gradient colors for area charts
  gradientStart: string
  gradientEnd: string
}

/**
 * Get chart colors based on theme
 */
export function getChartColors(theme: ChartTheme): ChartColors {
  if (theme === 'dark') {
    return {
      // Grid and axes - lighter in dark mode for visibility
      grid: '#374151',      // gray-700
      axis: '#9ca3af',      // gray-400

      // Primary colors - Strava orange with good contrast
      primary: '#fc4c02',        // Strava orange
      primaryLight: '#ff6b35',   // Lighter orange
      primaryDark: '#d63e01',    // Darker orange

      // Secondary colors - cyan/blue for contrast
      secondary: '#06b6d4',      // cyan-500
      secondaryLight: '#22d3ee', // cyan-400

      // Accent colors - vibrant but not overwhelming
      accent1: '#f59e0b',   // amber-500
      accent2: '#8b5cf6',   // violet-500
      accent3: '#10b981',   // emerald-500
      accent4: '#ec4899',   // pink-500
      accent5: '#14b8a6',   // teal-500

      // Status colors - adjusted for dark mode
      success: '#10b981',   // emerald-500
      warning: '#f59e0b',   // amber-500
      danger: '#ef4444',    // red-500
      info: '#3b82f6',      // blue-500

      // Neutral colors
      text: '#f3f4f6',          // gray-100
      textMuted: '#9ca3af',     // gray-400
      background: '#18181b',    // zinc-900
      backgroundAlt: '#27272a', // zinc-800

      // Gradient colors for area charts
      gradientStart: 'rgba(252, 76, 2, 0.4)',   // orange with opacity
      gradientEnd: 'rgba(252, 76, 2, 0.05)',    // orange very transparent
    }
  } else {
    // Light mode
    return {
      // Grid and axes - darker in light mode
      grid: '#e5e7eb',      // gray-200
      axis: '#6b7280',      // gray-500

      // Primary colors - Strava orange
      primary: '#fc4c02',        // Strava orange
      primaryLight: '#ff8855',   // Lighter for hover
      primaryDark: '#b83901',    // Darker variation

      // Secondary colors - blue for contrast
      secondary: '#0ea5e9',      // sky-500
      secondaryLight: '#38bdf8', // sky-400

      // Accent colors - saturated for light backgrounds
      accent1: '#f59e0b',   // amber-500
      accent2: '#8b5cf6',   // violet-500
      accent3: '#10b981',   // emerald-500
      accent4: '#ec4899',   // pink-500
      accent5: '#14b8a6',   // teal-500

      // Status colors
      success: '#22c55e',   // green-500
      warning: '#f59e0b',   // amber-500
      danger: '#ef4444',    // red-500
      info: '#3b82f6',      // blue-500

      // Neutral colors
      text: '#111827',          // gray-900
      textMuted: '#6b7280',     // gray-500
      background: '#ffffff',    // white
      backgroundAlt: '#f9fafb', // gray-50

      // Gradient colors for area charts
      gradientStart: 'rgba(252, 76, 2, 0.3)',   // orange with opacity
      gradientEnd: 'rgba(252, 76, 2, 0.02)',    // orange very transparent
    }
  }
}

/**
 * Get colors for yearly comparison charts
 * Returns distinct colors for each year
 */
export function getYearColors(theme: ChartTheme): Record<number, string> {
  const baseColors = theme === 'dark'
    ? {
        2025: '#fc4c02', // Strava orange (current year)
        2024: '#60a5fa', // blue-400
        2023: '#34d399', // emerald-400
        2022: '#c084fc', // purple-400
        2021: '#fbbf24', // amber-400
        2020: '#f472b6', // pink-400
        2019: '#2dd4bf', // teal-400
        2018: '#a78bfa', // violet-400
        2017: '#f87171', // red-400
        2016: '#22d3ee', // cyan-400
      }
    : {
        2025: '#fc4c02', // Strava orange (current year)
        2024: '#3b82f6', // blue-500
        2023: '#22c55e', // green-500
        2022: '#a855f7', // purple-500
        2021: '#f59e0b', // amber-500
        2020: '#ec4899', // pink-500
        2019: '#14b8a6', // teal-500
        2018: '#8b5cf6', // violet-500
        2017: '#ef4444', // red-500
        2016: '#06b6d4', // cyan-500
      }

  return baseColors
}

/**
 * Get colors for power zones (Coggan)
 */
export function getPowerZoneColors(): Array<{ zone: number; color: string; name: string }> {
  return [
    { zone: 1, color: '#9ca3af', name: 'Active Recovery' },    // gray
    { zone: 2, color: '#60a5fa', name: 'Endurance' },          // blue
    { zone: 3, color: '#34d399', name: 'Tempo' },              // green
    { zone: 4, color: '#fbbf24', name: 'Lactate Threshold' },  // yellow
    { zone: 5, color: '#fb923c', name: 'VO2 Max' },            // orange
    { zone: 6, color: '#f87171', name: 'Anaerobic' },          // red
    { zone: 7, color: '#dc2626', name: 'Neuromuscular' },      // dark red
  ]
}

/**
 * Get colors for heart rate zones
 */
export function getHeartRateZoneColors(): Array<{ zone: number; color: string; name: string }> {
  return [
    { zone: 1, color: '#9ca3af', name: 'Very Light' },   // gray
    { zone: 2, color: '#60a5fa', name: 'Light' },        // blue
    { zone: 3, color: '#34d399', name: 'Moderate' },     // green
    { zone: 4, color: '#fbbf24', name: 'Hard' },         // yellow/orange
    { zone: 5, color: '#f87171', name: 'Maximum' },      // red
  ]
}

/**
 * Get TSS intensity colors
 */
export function getTSSColors(theme: ChartTheme) {
  return theme === 'dark'
    ? {
        easy: '#10b981',      // emerald-500
        moderate: '#fbbf24',  // amber-400
        hard: '#fb923c',      // orange-400
        veryHard: '#ef4444',  // red-500
      }
    : {
        easy: '#22c55e',      // green-500
        moderate: '#f59e0b',  // amber-500
        hard: '#f97316',      // orange-500
        veryHard: '#dc2626',  // red-600
      }
}
