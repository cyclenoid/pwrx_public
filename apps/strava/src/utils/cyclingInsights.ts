interface CyclingInsightInput {
  watts?: number[] | null
  heartrate?: number[] | null
  time?: number[] | null
}

export interface CyclingEnduranceMetrics {
  decouplingPct: number | null
  durabilityPct: number | null
}

interface SamplePoint {
  time: number
  watts: number
  hr: number
}

const average = (values: number[]): number | null => {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const roundMetric = (value: number): number => Number(value.toFixed(2))

export const calculateCyclingEnduranceMetrics = (input: CyclingInsightInput): CyclingEnduranceMetrics => {
  const watts = Array.isArray(input.watts) ? input.watts : []
  const heartrate = Array.isArray(input.heartrate) ? input.heartrate : []
  const time = Array.isArray(input.time) ? input.time : []

  const length = time.length
    ? Math.min(watts.length, heartrate.length, time.length)
    : Math.min(watts.length, heartrate.length)

  if (length < 120) {
    return { decouplingPct: null, durabilityPct: null }
  }

  const points: SamplePoint[] = []

  for (let index = 0; index < length; index += 1) {
    const wattsValue = Number(watts[index])
    const hrValue = Number(heartrate[index])
    const timeValue = time.length ? Number(time[index]) : index

    if (!Number.isFinite(wattsValue) || !Number.isFinite(hrValue) || !Number.isFinite(timeValue)) continue
    if (wattsValue <= 0 || hrValue < 60 || hrValue > 220) continue

    points.push({
      time: timeValue,
      watts: wattsValue,
      hr: hrValue,
    })
  }

  if (points.length < 120) {
    return { decouplingPct: null, durabilityPct: null }
  }

  const startTime = points[0].time
  const endTime = points[points.length - 1].time
  const durationSec = endTime - startTime

  if (!Number.isFinite(durationSec) || durationSec < 30 * 60) {
    return { decouplingPct: null, durabilityPct: null }
  }

  let decouplingPct: number | null = null
  let durabilityPct: number | null = null

  if (durationSec >= 45 * 60) {
    const splitTime = startTime + durationSec / 2
    const firstHalf = points.filter((point) => point.time <= splitTime)
    const secondHalf = points.filter((point) => point.time > splitTime)

    const firstHalfPower = average(firstHalf.map((point) => point.watts))
    const firstHalfHr = average(firstHalf.map((point) => point.hr))
    const secondHalfPower = average(secondHalf.map((point) => point.watts))
    const secondHalfHr = average(secondHalf.map((point) => point.hr))

    if (
      firstHalfPower && firstHalfHr && secondHalfPower && secondHalfHr &&
      firstHalfHr > 0 && secondHalfHr > 0
    ) {
      const firstHalfEfficiency = firstHalfPower / firstHalfHr
      const secondHalfEfficiency = secondHalfPower / secondHalfHr

      if (firstHalfEfficiency > 0) {
        decouplingPct = roundMetric(((firstHalfEfficiency - secondHalfEfficiency) / firstHalfEfficiency) * 100)
      }
    }
  }

  if (durationSec >= 60 * 60) {
    const firstThirdEnd = startTime + durationSec / 3
    const lastThirdStart = endTime - durationSec / 3

    const firstThird = points.filter((point) => point.time <= firstThirdEnd)
    const lastThird = points.filter((point) => point.time >= lastThirdStart)

    const firstThirdPower = average(firstThird.map((point) => point.watts))
    const lastThirdPower = average(lastThird.map((point) => point.watts))

    if (firstThirdPower && lastThirdPower && firstThirdPower > 0) {
      durabilityPct = roundMetric((lastThirdPower / firstThirdPower) * 100)
    }
  }

  return {
    decouplingPct,
    durabilityPct,
  }
}
