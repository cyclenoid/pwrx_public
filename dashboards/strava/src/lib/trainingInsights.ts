import i18n from '../i18n'

type ZoneKey = 'z1' | 'z2' | 'z3' | 'z4' | 'z5' | 'z6'

export interface TrainingInsightsInput {
  tss: number | null | undefined
  intensityFactor: number | null | undefined
  durationSeconds?: number | null | undefined
  ctl?: number | null | undefined
  ctlDelta?: number | null | undefined
  atlDelta?: number | null | undefined
  tsbDelta?: number | null | undefined
}

export interface TrainingBadge {
  label: string
  shortLabel: string
  className: string
}

export interface TrainingInsightsResult {
  state: 'ok' | 'insufficient'
  zone: TrainingBadge | null
  impact: TrainingBadge | null
  relativeImpact: TrainingBadge | null
  summary: string | null
  pmcDeltaSummary: string | null
}

const ZONE_BADGE_STYLES: Record<ZoneKey, string> = {
  z1: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  z2: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  z3: 'bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20',
  z4: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  z5: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  z6: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
}

const IMPACT_BADGE_STYLES: Record<string, string> = {
  recovery: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  light: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  moderate: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  build: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  high: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  very_high: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
  extreme: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/20',
}

const RELATIVE_IMPACT_STYLES: Record<string, string> = {
  low: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
  normal: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  strong: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  big: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20',
  massive: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
}

const t = i18n.t.bind(i18n)

const zoneFromIntensityFactor = (intensityFactor: number): TrainingBadge => {
  // Coggan-style power zones based on Intensity Factor (IF)
  if (intensityFactor < 0.55) {
    return {
      label: t('training.zones.z1'),
      shortLabel: t('training.zones.z1Short'),
      className: ZONE_BADGE_STYLES.z1,
    }
  }
  if (intensityFactor < 0.76) {
    return {
      label: t('training.zones.z2'),
      shortLabel: t('training.zones.z2Short'),
      className: ZONE_BADGE_STYLES.z2,
    }
  }
  if (intensityFactor < 0.91) {
    return {
      label: t('training.zones.z3'),
      shortLabel: t('training.zones.z3Short'),
      className: ZONE_BADGE_STYLES.z3,
    }
  }
  if (intensityFactor < 1.06) {
    return {
      label: t('training.zones.z4'),
      shortLabel: t('training.zones.z4Short'),
      className: ZONE_BADGE_STYLES.z4,
    }
  }
  if (intensityFactor < 1.21) {
    return {
      label: t('training.zones.z5'),
      shortLabel: t('training.zones.z5Short'),
      className: ZONE_BADGE_STYLES.z5,
    }
  }
  return {
    label: t('training.zones.z6'),
    shortLabel: t('training.zones.z6Short'),
    className: ZONE_BADGE_STYLES.z6,
  }
}

const impactFromTss = (tss: number): TrainingBadge => {
  // TSS bands tuned for clearer "session impact" communication
  if (tss < 25) {
    return { label: t('training.impact.recovery'), shortLabel: t('training.impact.recoveryShort'), className: IMPACT_BADGE_STYLES.recovery }
  }
  if (tss < 50) {
    return { label: t('training.impact.light'), shortLabel: t('training.impact.lightShort'), className: IMPACT_BADGE_STYLES.light }
  }
  if (tss < 80) {
    return { label: t('training.impact.moderate'), shortLabel: t('training.impact.moderateShort'), className: IMPACT_BADGE_STYLES.moderate }
  }
  if (tss < 110) {
    return { label: t('training.impact.build'), shortLabel: t('training.impact.buildShort'), className: IMPACT_BADGE_STYLES.build }
  }
  if (tss < 140) {
    return { label: t('training.impact.high'), shortLabel: t('training.impact.highShort'), className: IMPACT_BADGE_STYLES.high }
  }
  if (tss < 170) {
    return { label: t('training.impact.veryHigh'), shortLabel: t('training.impact.veryHighShort'), className: IMPACT_BADGE_STYLES.very_high }
  }
  return { label: t('training.impact.extreme'), shortLabel: t('training.impact.extremeShort'), className: IMPACT_BADGE_STYLES.extreme }
}

const relativeImpactFromCtl = (tss: number, ctl: number): TrainingBadge => {
  const ratio = ctl > 0 ? tss / ctl : 0

  if (ratio < 0.5) {
    return {
      label: t('training.relative.low', { value: Math.round(ratio * 100) }),
      shortLabel: t('training.relative.lowShort'),
      className: RELATIVE_IMPACT_STYLES.low,
    }
  }
  if (ratio < 0.9) {
    return {
      label: t('training.relative.normal', { value: Math.round(ratio * 100) }),
      shortLabel: t('training.relative.normalShort'),
      className: RELATIVE_IMPACT_STYLES.normal,
    }
  }
  if (ratio < 1.2) {
    return {
      label: t('training.relative.strong', { value: Math.round(ratio * 100) }),
      shortLabel: t('training.relative.strongShort'),
      className: RELATIVE_IMPACT_STYLES.strong,
    }
  }
  if (ratio < 1.5) {
    return {
      label: t('training.relative.veryStrong', { value: Math.round(ratio * 100) }),
      shortLabel: t('training.relative.veryStrongShort'),
      className: RELATIVE_IMPACT_STYLES.big,
    }
  }
  return {
    label: t('training.relative.massive', { value: Math.round(ratio * 100) }),
    shortLabel: t('training.relative.massiveShort'),
    className: RELATIVE_IMPACT_STYLES.massive,
  }
}

const formatSigned = (value: number | null | undefined): string | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  const rounded = Math.round(value * 10) / 10
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`
}

const buildPmcDeltaSummary = (input: TrainingInsightsInput): string | null => {
  const ctlDelta = formatSigned(input.ctlDelta)
  const atlDelta = formatSigned(input.atlDelta)
  const tsbDelta = formatSigned(input.tsbDelta)

  if (!ctlDelta && !atlDelta && !tsbDelta) return null

  const parts: string[] = []
  if (ctlDelta) parts.push(t('training.pmc.ctl', { value: ctlDelta }))
  if (atlDelta) parts.push(t('training.pmc.atl', { value: atlDelta }))
  if (tsbDelta) parts.push(t('training.pmc.tsb', { value: tsbDelta }))

  return parts.join(' · ')
}

export function getTrainingInsights(input: TrainingInsightsInput): TrainingInsightsResult {
  const tss = input.tss ?? null
  const intensityFactor = input.intensityFactor ?? null

  if (
    tss === null ||
    intensityFactor === null ||
    !Number.isFinite(tss) ||
    !Number.isFinite(intensityFactor) ||
    tss <= 0 ||
    intensityFactor <= 0
  ) {
    return {
      state: 'insufficient',
      zone: null,
      impact: null,
      relativeImpact: null,
      summary: null,
      pmcDeltaSummary: null,
    }
  }

  const zone = zoneFromIntensityFactor(intensityFactor)
  const impact = impactFromTss(tss)
  const relativeImpact = input.ctl && input.ctl > 0 ? relativeImpactFromCtl(tss, input.ctl) : null
  const pmcDeltaSummary = buildPmcDeltaSummary(input)

  const summaryParts = [zone.label, impact.label]
  if (relativeImpact) summaryParts.push(relativeImpact.shortLabel)

  return {
    state: 'ok',
    zone,
    impact,
    relativeImpact,
    summary: summaryParts.join(' · '),
    pmcDeltaSummary,
  }
}
