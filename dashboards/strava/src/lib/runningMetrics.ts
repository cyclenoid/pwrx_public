export interface RawRunningMetricInput {
  date: string
  distanceKm: number
  movingTimeSec: number
  avgHr: number | null | undefined
  avgPaceMinPerKm?: number | null | undefined
}

export interface RunningPerformanceSample {
  date: string
  distanceKm: number
  movingTimeSec: number
  avgHr: number
  avgPaceMinPerKm: number
  efficiency: number
  normalizedPace150: number
}

export interface RunningPerformanceSummary {
  sampleCount: number
  totalDistanceKm: number
  avgHr: number | null
  medianPaceMinPerKm: number | null
  medianEfficiency: number | null
  medianNormalizedPace150: number | null
}

export function buildRunningPerformanceSamples(
  items: RawRunningMetricInput[],
): RunningPerformanceSample[] {
  return items
    .map((item) => {
      const distanceKm = toPositiveNumber(item.distanceKm)
      const movingTimeSec = toPositiveNumber(item.movingTimeSec)
      const avgHr = toPositiveNumber(item.avgHr)
      const derivedPaceMinPerKm =
        distanceKm !== null && movingTimeSec !== null && distanceKm > 0
          ? (movingTimeSec / 60) / distanceKm
          : null
      const paceMinPerKm = toPositiveNumber(
        item.avgPaceMinPerKm ?? derivedPaceMinPerKm,
      )

      if (
        !distanceKm ||
        !movingTimeSec ||
        !avgHr ||
        !paceMinPerKm ||
        distanceKm < 3 ||
        movingTimeSec < 15 * 60 ||
        avgHr < 90 ||
        avgHr > 210 ||
        paceMinPerKm < 3 ||
        paceMinPerKm > 12
      ) {
        return null
      }

      const validDistanceKm = distanceKm
      const validMovingTimeSec = movingTimeSec
      const validAvgHr = avgHr
      const validPaceMinPerKm = paceMinPerKm
      const speedMetersPerMinute = (validDistanceKm * 1000) / (validMovingTimeSec / 60)

      return {
        date: item.date,
        distanceKm: validDistanceKm,
        movingTimeSec: validMovingTimeSec,
        avgHr: validAvgHr,
        avgPaceMinPerKm: validPaceMinPerKm,
        efficiency: speedMetersPerMinute / validAvgHr,
        normalizedPace150: validPaceMinPerKm * (validAvgHr / 150),
      }
    })
    .filter((sample): sample is RunningPerformanceSample => Boolean(sample))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

export function summarizeRunningPerformance(
  samples: RunningPerformanceSample[],
): RunningPerformanceSummary {
  if (samples.length === 0) {
    return {
      sampleCount: 0,
      totalDistanceKm: 0,
      avgHr: null,
      medianPaceMinPerKm: null,
      medianEfficiency: null,
      medianNormalizedPace150: null,
    }
  }

  return {
    sampleCount: samples.length,
    totalDistanceKm: samples.reduce((sum, sample) => sum + sample.distanceKm, 0),
    avgHr: Math.round(samples.reduce((sum, sample) => sum + sample.avgHr, 0) / samples.length),
    medianPaceMinPerKm: median(samples.map((sample) => sample.avgPaceMinPerKm)),
    medianEfficiency: median(samples.map((sample) => sample.efficiency)),
    medianNormalizedPace150: median(samples.map((sample) => sample.normalizedPace150)),
  }
}

export function getRecentVsPreviousRunningPerformance(
  samples: RunningPerformanceSample[],
  recentDays = 42,
): {
  recent: RunningPerformanceSummary
  previous: RunningPerformanceSummary
} {
  if (samples.length === 0) {
    return {
      recent: summarizeRunningPerformance([]),
      previous: summarizeRunningPerformance([]),
    }
  }

  const latestDate = samples.reduce((latest, sample) => {
    const sampleTime = new Date(sample.date).getTime()
    return sampleTime > latest ? sampleTime : latest
  }, 0)

  const msPerDay = 24 * 60 * 60 * 1000
  const recentStart = latestDate - recentDays * msPerDay
  const previousStart = recentStart - recentDays * msPerDay

  const recentSamples = samples.filter((sample) => {
    const time = new Date(sample.date).getTime()
    return time >= recentStart && time <= latestDate
  })
  const previousSamples = samples.filter((sample) => {
    const time = new Date(sample.date).getTime()
    return time >= previousStart && time < recentStart
  })

  return {
    recent: summarizeRunningPerformance(recentSamples),
    previous: summarizeRunningPerformance(previousSamples),
  }
}

function toPositiveNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : parseFloat(String(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}
