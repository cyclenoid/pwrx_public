export interface CyclingPerformanceSource {
  date: string
  durationSec: number
  distanceKm: number
  avgHr: number | null
  avgPower: number | null
  decouplingPct?: number | null
  durabilityPct?: number | null
}

export interface CyclingPerformanceSample {
  date: string
  durationSec: number
  distanceKm: number
  avgHr: number
  avgPower: number
  normalizedPower150: number
  efficiency: number
  decouplingPct: number | null
  durabilityPct: number | null
}

export interface CyclingPerformanceSummary {
  sampleCount: number
  totalDistanceKm: number
  medianNormalizedPower150: number | null
  medianEfficiency: number | null
  avgHr: number | null
  medianDecouplingPct: number | null
  medianDurabilityPct: number | null
  decouplingSampleCount: number
  durabilitySampleCount: number
}

const median = (values: number[]): number | null => {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(2))
    : Number(sorted[mid].toFixed(2))
}

export const buildCyclingPerformanceSamples = (activities: CyclingPerformanceSource[]): CyclingPerformanceSample[] => {
  return activities
    .map((activity) => {
      const avgHr = Number(activity.avgHr)
      const avgPower = Number(activity.avgPower)
      return {
        date: activity.date,
        durationSec: activity.durationSec,
        distanceKm: activity.distanceKm,
        avgHr,
        avgPower,
        normalizedPower150: Number((avgPower * (150 / avgHr)).toFixed(2)),
        efficiency: Number((avgPower / avgHr).toFixed(3)),
        decouplingPct: Number.isFinite(activity.decouplingPct) ? Number(activity.decouplingPct) : null,
        durabilityPct: Number.isFinite(activity.durabilityPct) ? Number(activity.durabilityPct) : null,
      }
    })
    .filter((activity) =>
      !!activity.date &&
      Number.isFinite(activity.durationSec) &&
      activity.durationSec >= 30 * 60 &&
      Number.isFinite(activity.avgHr) &&
      activity.avgHr >= 80 &&
      activity.avgHr <= 200 &&
      Number.isFinite(activity.avgPower) &&
      activity.avgPower >= 80 &&
      activity.avgPower <= 450,
    )
}

export const summarizeCyclingPerformance = (samples: CyclingPerformanceSample[]): CyclingPerformanceSummary => {
  if (!samples.length) {
    return {
      sampleCount: 0,
      totalDistanceKm: 0,
      medianNormalizedPower150: null,
      medianEfficiency: null,
      avgHr: null,
      medianDecouplingPct: null,
      medianDurabilityPct: null,
      decouplingSampleCount: 0,
      durabilitySampleCount: 0,
    }
  }

  const decouplingValues = samples
    .map((sample) => sample.decouplingPct)
    .filter((value): value is number => value !== null && Number.isFinite(value))
  const durabilityValues = samples
    .map((sample) => sample.durabilityPct)
    .filter((value): value is number => value !== null && Number.isFinite(value))

  return {
    sampleCount: samples.length,
    totalDistanceKm: Number(samples.reduce((sum, sample) => sum + sample.distanceKm, 0).toFixed(1)),
    medianNormalizedPower150: median(samples.map((sample) => sample.normalizedPower150)),
    medianEfficiency: median(samples.map((sample) => sample.efficiency)),
    avgHr: Math.round(samples.reduce((sum, sample) => sum + sample.avgHr, 0) / samples.length),
    medianDecouplingPct: median(decouplingValues),
    medianDurabilityPct: median(durabilityValues),
    decouplingSampleCount: decouplingValues.length,
    durabilitySampleCount: durabilityValues.length,
  }
}
