import DatabaseService from './database.js'
import { calculateTrainingLoad, calculateRampRate, interpretTSB, type TrainingLoadResult } from '../utils/trainingLoadCalculations.js'

const db = new DatabaseService()

export interface TrainingLoadParams {
  startDate: string
  endDate: string
  activityType?: string
}

type TrainingStressSource = 'power' | 'heart_rate' | 'missing'

type TrainingStressSummary = {
  totalTss: number
  powerTss: number
  heartRateTss: number
  activityCount: number
  powerActivityCount: number
  heartRateActivityCount: number
  missingActivityCount: number
  powerTssPercentage: number
  heartRateTssPercentage: number
  heartRateBasis: 'lthr' | 'hrr_estimate' | 'max_hr_estimate' | null
  thresholdHrUsed: number | null
  maxHrUsed: number | null
  restingHrUsed: number | null
}

type ActivityRow = {
  strava_activity_id: string
  date: Date
  moving_time: number | null
  type: string | null
  average_heartrate: string | number | null
  average_watts: string | number | null
}

const toFiniteNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const roundOne = (value: number): number => Math.round(value * 10) / 10

const buildHeartRateStressConfig = (settings: Record<string, string | undefined>) => {
  const configuredMaxHr = toFiniteNumber(settings.max_heartrate)
  const configuredRestingHr = toFiniteNumber(settings.resting_heartrate)
  const configuredLthr = toFiniteNumber(settings.lactate_threshold_heartrate)

  const maxHr = configuredMaxHr && configuredMaxHr >= 120 && configuredMaxHr <= 230
    ? configuredMaxHr
    : 190
  const restingHr = configuredRestingHr && configuredRestingHr >= 35 && configuredRestingHr <= 100
    ? configuredRestingHr
    : null

  if (configuredLthr && configuredLthr >= 120 && configuredLthr <= 210) {
    return {
      basis: 'lthr' as const,
      thresholdHr: configuredLthr,
      maxHr,
      restingHr,
    }
  }

  if (restingHr && maxHr > restingHr) {
    return {
      basis: 'hrr_estimate' as const,
      thresholdHr: Math.round(restingHr + ((maxHr - restingHr) * 0.85)),
      maxHr,
      restingHr,
    }
  }

  return {
    basis: 'max_hr_estimate' as const,
    thresholdHr: Math.round(maxHr * 0.9),
    maxHr,
    restingHr,
  }
}

const calculateHeartRateTss = (
  movingTimeSeconds: number | null,
  averageHeartRate: number | null,
  config: ReturnType<typeof buildHeartRateStressConfig>
): number | null => {
  if (!movingTimeSeconds || movingTimeSeconds < 10 * 60) return null
  if (!averageHeartRate || averageHeartRate < 80 || averageHeartRate > 220) return null

  const denominator = config.restingHr
    ? config.thresholdHr - config.restingHr
    : config.thresholdHr
  const numerator = config.restingHr
    ? averageHeartRate - config.restingHr
    : averageHeartRate

  if (denominator <= 0 || numerator <= 0) return null

  const intensity = Math.max(0.4, Math.min(1.35, numerator / denominator))
  const tss = (movingTimeSeconds / 3600) * 100 * intensity * intensity
  return Number.isFinite(tss) ? roundOne(tss) : null
}

/**
 * Get training load (CTL/ATL/TSB) for a date range
 * Calculates TSS from power data first, with heart-rate TSS as fallback for
 * outdoor rides without power and runs without running power.
 */
export async function getTrainingLoad(params: TrainingLoadParams): Promise<(TrainingLoadResult & { stressSummary: TrainingStressSummary }) | null> {
  const { startDate, endDate, activityType } = params

  const settingsResult = await db.query(`
    SELECT key, value FROM strava.user_settings
    WHERE key IN ('ftp', 'max_heartrate', 'resting_heartrate', 'lactate_threshold_heartrate')
  `)
  const settings = Object.fromEntries(settingsResult.rows.map((row: any) => [row.key, row.value])) as Record<string, string | undefined>
  const ftp = toFiniteNumber(settings.ftp)
  const hrStressConfig = buildHeartRateStressConfig(settings)

  // Get supported endurance activities. Power TSS is preferred where possible,
  // HR-TSS covers outdoor rides without a meter and runs.
  let query = `
    SELECT
      strava_activity_id,
      DATE(start_date AT TIME ZONE 'UTC') as date,
      moving_time,
      type,
      average_heartrate,
      average_watts
    FROM strava.activities
    WHERE DATE(start_date AT TIME ZONE 'UTC') >= $1
      AND DATE(start_date AT TIME ZONE 'UTC') <= $2
  `

  const queryParams: (string | number)[] = [startDate, endDate]

  if (activityType) {
    // Include both real and virtual versions of the activity type
    if (activityType === 'Ride') {
      query += ` AND type IN ('Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide')`
    } else if (activityType === 'Run') {
      query += ` AND type IN ('Run', 'VirtualRun', 'TrailRun')`
    } else {
      query += ` AND type = $3`
      queryParams.push(activityType)
    }
  } else {
    query += ` AND type IN ('Ride', 'VirtualRide', 'GravelRide', 'EBikeRide', 'MountainBikeRide', 'Run', 'VirtualRun', 'TrailRun')`
  }

  query += ` ORDER BY start_date ASC`

  try {
    const result = await db.query(query, queryParams)
    const summary: TrainingStressSummary = {
      totalTss: 0,
      powerTss: 0,
      heartRateTss: 0,
      activityCount: result.rows.length,
      powerActivityCount: 0,
      heartRateActivityCount: 0,
      missingActivityCount: 0,
      powerTssPercentage: 0,
      heartRateTssPercentage: 0,
      heartRateBasis: hrStressConfig.basis,
      thresholdHrUsed: hrStressConfig.thresholdHr,
      maxHrUsed: hrStressConfig.maxHr,
      restingHrUsed: hrStressConfig.restingHr,
    }

    if (result.rows.length === 0) {
      return {
        dailyValues: [],
        current: { ctl: 0, atl: 0, tsb: 0 },
        stressSummary: summary,
      }
    }

    // Import power calculation function
    const { calculatePowerMetrics } = await import('../utils/powerCalculations.js')

    // Calculate TSS for each activity and group by date
    const dailyTSS = new Map<string, number>()
    const dailyPowerTSS = new Map<string, number>()
    const dailyHeartRateTSS = new Map<string, number>()

    for (const row of result.rows as ActivityRow[]) {
      const activityId = Number(row.strava_activity_id)
      const dateStr = row.date.toISOString().split('T')[0]
      const movingTime = toFiniteNumber(row.moving_time)
      const averageHeartRate = toFiniteNumber(row.average_heartrate)
      const averageWatts = toFiniteNumber(row.average_watts)
      let source: TrainingStressSource = 'missing'
      let tss: number | null = null

      // Get power stream
      if (Number.isFinite(activityId) && ftp && averageWatts && averageWatts > 0 && movingTime) {
        const streams = await db.getActivityStreams(activityId)
        const wattsStream = streams.find((s: any) => s.stream_type === 'watts')

        if (wattsStream && wattsStream.data) {
          const metrics = calculatePowerMetrics(
            wattsStream.data,
            movingTime,
            ftp
          )

          if (metrics.training_stress_score !== null) {
            source = 'power'
            tss = metrics.training_stress_score
          }
        }
      }

      if (tss === null) {
        const hrTss = calculateHeartRateTss(movingTime, averageHeartRate, hrStressConfig)
        if (hrTss !== null) {
          source = 'heart_rate'
          tss = hrTss
        }
      }

      if (tss === null) {
        summary.missingActivityCount += 1
        continue
      }

      const currentTSS = dailyTSS.get(dateStr) || 0
      dailyTSS.set(dateStr, currentTSS + tss)
      summary.totalTss += tss

      if (source === 'power') {
        summary.powerTss += tss
        summary.powerActivityCount += 1
        dailyPowerTSS.set(dateStr, (dailyPowerTSS.get(dateStr) || 0) + tss)
      } else {
        summary.heartRateTss += tss
        summary.heartRateActivityCount += 1
        dailyHeartRateTSS.set(dateStr, (dailyHeartRateTSS.get(dateStr) || 0) + tss)
      }
    }

    summary.totalTss = roundOne(summary.totalTss)
    summary.powerTss = roundOne(summary.powerTss)
    summary.heartRateTss = roundOne(summary.heartRateTss)
    summary.powerTssPercentage = summary.totalTss > 0 ? Math.round((summary.powerTss / summary.totalTss) * 100) : 0
    summary.heartRateTssPercentage = summary.totalTss > 0 ? Math.round((summary.heartRateTss / summary.totalTss) * 100) : 0

    // Convert map to array
    const tssData = Array.from(dailyTSS.entries()).map(([date, tss]) => ({
      date,
      tss,
      powerTss: dailyPowerTSS.get(date) || 0,
      heartRateTss: dailyHeartRateTSS.get(date) || 0,
    }))

    // Fill in missing days with TSS = 0
    const filledData = fillMissingDays(tssData, startDate, endDate)

    // Calculate CTL/ATL/TSB
    const trainingLoad = calculateTrainingLoad(filledData)

    return {
      ...trainingLoad,
      dailyValues: trainingLoad.dailyValues.map((day) => {
        const sourceDay = filledData.find((item) => item.date === day.date)
        return {
          ...day,
          powerTss: sourceDay?.powerTss || 0,
          heartRateTss: sourceDay?.heartRateTss || 0,
        }
      }),
      stressSummary: summary,
    }
  } catch (error) {
    console.error('Error fetching training load:', error)
    throw error
  }
}

/**
 * Get training load with additional insights
 */
export async function getTrainingLoadWithInsights(params: TrainingLoadParams) {
  const trainingLoad = await getTrainingLoad(params)

  if (!trainingLoad || trainingLoad.dailyValues.length === 0) {
    return null
  }

  const rampRate = calculateRampRate(trainingLoad.dailyValues)
  const tsbInterpretation = interpretTSB(trainingLoad.current.tsb)

  return {
    ...trainingLoad,
    insights: {
      rampRate,
      tsbInterpretation,
      safeRampRate: rampRate !== null ? rampRate >= -8 && rampRate <= 8 : null,
    },
  }
}

/**
 * Fill in missing days with TSS = 0
 * Important for accurate EMA calculations
 */
function fillMissingDays(
  data: Array<{ date: string; tss: number; powerTss?: number; heartRateTss?: number }>,
  startDate: string,
  endDate: string
): Array<{ date: string; tss: number; powerTss: number; heartRateTss: number }> {
  const result: Array<{ date: string; tss: number; powerTss: number; heartRateTss: number }> = []
  const dataMap = new Map(data.map(d => [d.date, d.tss]))
  const powerMap = new Map(data.map(d => [d.date, d.powerTss || 0]))
  const heartRateMap = new Map(data.map(d => [d.date, d.heartRateTss || 0]))

  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0]
    result.push({
      date: dateStr,
      tss: dataMap.get(dateStr) || 0,
      powerTss: powerMap.get(dateStr) || 0,
      heartRateTss: heartRateMap.get(dateStr) || 0,
    })
  }

  return result
}
