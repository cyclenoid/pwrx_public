import DatabaseService from './database.js'
import { calculateTrainingLoad, calculateRampRate, interpretTSB, type TrainingLoadResult } from '../utils/trainingLoadCalculations.js'

const db = new DatabaseService()

export interface TrainingLoadParams {
  startDate: string
  endDate: string
  activityType?: string
}

/**
 * Get training load (CTL/ATL/TSB) for a date range
 * Calculates TSS from activities with power data on-the-fly
 */
export async function getTrainingLoad(params: TrainingLoadParams): Promise<TrainingLoadResult | null> {
  const { startDate, endDate, activityType } = params

  // First, get FTP setting
  const ftpResult = await db.query("SELECT value FROM strava.user_settings WHERE key = 'ftp'")
  const ftp = ftpResult.rows.length > 0 && ftpResult.rows[0].value
    ? parseFloat(ftpResult.rows[0].value)
    : null

  if (!ftp) {
    // Can't calculate TSS without FTP
    return {
      dailyValues: [],
      current: { ctl: 0, atl: 0, tsb: 0 },
    }
  }

  // Get activities with power data
  let query = `
    SELECT
      strava_activity_id,
      DATE(start_date AT TIME ZONE 'UTC') as date,
      moving_time
    FROM strava.activities
    WHERE DATE(start_date AT TIME ZONE 'UTC') >= $1
      AND DATE(start_date AT TIME ZONE 'UTC') <= $2
      AND average_watts IS NOT NULL
      AND average_watts > 0
  `

  const queryParams: (string | number)[] = [startDate, endDate]

  if (activityType) {
    // Include both real and virtual versions of the activity type
    if (activityType === 'Ride') {
      query += ` AND (type = $3 OR type = 'VirtualRide')`
      queryParams.push(activityType)
    } else if (activityType === 'Run') {
      query += ` AND (type = $3 OR type = 'VirtualRun')`
      queryParams.push(activityType)
    } else {
      query += ` AND type = $3`
      queryParams.push(activityType)
    }
  }

  query += ` ORDER BY start_date ASC`

  try {
    const result = await db.query(query, queryParams)

    if (result.rows.length === 0) {
      return {
        dailyValues: [],
        current: { ctl: 0, atl: 0, tsb: 0 },
      }
    }

    // Import power calculation function
    const { calculatePowerMetrics } = await import('../utils/powerCalculations.js')

    // Calculate TSS for each activity and group by date
    const dailyTSS = new Map<string, number>()

    for (const row of result.rows) {
      const activityId = row.strava_activity_id
      const dateStr = row.date.toISOString().split('T')[0]

      // Get power stream
      const streams = await db.getActivityStreams(activityId)
      const wattsStream = streams.find((s: any) => s.stream_type === 'watts')

      if (wattsStream && wattsStream.data) {
        const metrics = calculatePowerMetrics(
          wattsStream.data,
          row.moving_time,
          ftp
        )

        if (metrics.training_stress_score !== null) {
          const currentTSS = dailyTSS.get(dateStr) || 0
          dailyTSS.set(dateStr, currentTSS + metrics.training_stress_score)
        }
      }
    }

    // Convert map to array
    const tssData = Array.from(dailyTSS.entries()).map(([date, tss]) => ({
      date,
      tss,
    }))

    // Fill in missing days with TSS = 0
    const filledData = fillMissingDays(tssData, startDate, endDate)

    // Calculate CTL/ATL/TSB
    const trainingLoad = calculateTrainingLoad(filledData)

    return trainingLoad
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
  data: Array<{ date: string; tss: number }>,
  startDate: string,
  endDate: string
): Array<{ date: string; tss: number }> {
  const result: Array<{ date: string; tss: number }> = []
  const dataMap = new Map(data.map(d => [d.date, d.tss]))

  const start = new Date(startDate)
  const end = new Date(endDate)

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const dateStr = date.toISOString().split('T')[0]
    result.push({
      date: dateStr,
      tss: dataMap.get(dateStr) || 0,
    })
  }

  return result
}
