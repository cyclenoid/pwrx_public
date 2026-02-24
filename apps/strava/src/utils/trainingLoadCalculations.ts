/**
 * Training Load Calculations - CTL, ATL, TSB
 *
 * Based on the Performance Management Chart (PMC) model:
 * - CTL (Chronic Training Load): Long-term fitness - 42-day exponentially weighted average
 * - ATL (Acute Training Load): Short-term fatigue - 7-day exponentially weighted average
 * - TSB (Training Stress Balance): Form = CTL - ATL
 *
 * Exponential Moving Average (EMA) formula:
 * EMA_today = (TSS_today * k) + (EMA_yesterday * (1 - k))
 * where k = 2 / (timeConstant + 1)
 */

export interface DailyTrainingLoad {
  date: string
  tss: number
  ctl: number
  atl: number
  tsb: number
}

export interface TrainingLoadResult {
  dailyValues: DailyTrainingLoad[]
  current: {
    ctl: number
    atl: number
    tsb: number
  }
}

/**
 * Calculate exponential moving average constant
 */
function getEMAConstant(timeConstant: number): number {
  return 2 / (timeConstant + 1)
}

/**
 * Calculate CTL/ATL/TSB for a time series of TSS values
 *
 * @param tssData - Array of { date: string, tss: number } sorted by date ascending
 * @param initialCTL - Starting CTL value (default 0)
 * @param initialATL - Starting ATL value (default 0)
 * @returns Training load time series with daily CTL, ATL, TSB values
 */
export function calculateTrainingLoad(
  tssData: Array<{ date: string; tss: number }>,
  initialCTL = 0,
  initialATL = 0
): TrainingLoadResult {
  const CTL_TIME_CONSTANT = 42
  const ATL_TIME_CONSTANT = 7

  const ctlConstant = getEMAConstant(CTL_TIME_CONSTANT)
  const atlConstant = getEMAConstant(ATL_TIME_CONSTANT)

  let ctl = initialCTL
  let atl = initialATL

  const dailyValues: DailyTrainingLoad[] = []

  for (const day of tssData) {
    // Update CTL and ATL using exponential moving average
    ctl = (day.tss * ctlConstant) + (ctl * (1 - ctlConstant))
    atl = (day.tss * atlConstant) + (atl * (1 - atlConstant))

    // Calculate TSB
    const tsb = ctl - atl

    dailyValues.push({
      date: day.date,
      tss: day.tss,
      ctl: Math.round(ctl * 10) / 10, // Round to 1 decimal
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round(tsb * 10) / 10,
    })
  }

  // Get current values (last entry)
  const current = dailyValues.length > 0
    ? {
        ctl: dailyValues[dailyValues.length - 1].ctl,
        atl: dailyValues[dailyValues.length - 1].atl,
        tsb: dailyValues[dailyValues.length - 1].tsb,
      }
    : { ctl: 0, atl: 0, tsb: 0 }

  return {
    dailyValues,
    current,
  }
}

/**
 * Interpret TSB value for training recommendations
 */
export function interpretTSB(tsb: number): {
  status: 'fresh' | 'optimal' | 'neutral' | 'fatigued' | 'very_fatigued'
  description: string
  recommendation: string
} {
  if (tsb > 25) {
    return {
      status: 'fresh',
      description: 'Very Fresh - High form, low fatigue',
      recommendation: 'Good for race or hard workout. Consider increasing training load.',
    }
  } else if (tsb > 5) {
    return {
      status: 'optimal',
      description: 'Optimal - Well rested',
      recommendation: 'Excellent for high-intensity workouts or racing.',
    }
  } else if (tsb >= -10) {
    return {
      status: 'neutral',
      description: 'Neutral - Balanced training',
      recommendation: 'Continue normal training. Good for steady-state workouts.',
    }
  } else if (tsb >= -30) {
    return {
      status: 'fatigued',
      description: 'Fatigued - Building fitness',
      recommendation: 'Focus on base training. Avoid high-intensity efforts.',
    }
  } else {
    return {
      status: 'very_fatigued',
      description: 'Very Fatigued - Overreaching',
      recommendation: 'Consider rest or recovery week. Risk of overtraining.',
    }
  }
}

/**
 * Calculate ramp rate (CTL change per week)
 * A safe ramp rate is typically 5-8 TSS/week
 */
export function calculateRampRate(
  dailyValues: DailyTrainingLoad[]
): number | null {
  if (dailyValues.length < 7) {
    return null
  }

  // Get CTL from 7 days ago and today
  const weekAgo = dailyValues[dailyValues.length - 7].ctl
  const today = dailyValues[dailyValues.length - 1].ctl

  return Math.round((today - weekAgo) * 10) / 10
}
