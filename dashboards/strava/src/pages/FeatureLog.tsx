import { Link } from 'react-router-dom'
import { ArrowRight, ScrollText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { useTranslation } from 'react-i18next'
import { useCapabilities } from '../hooks/useCapabilities'
import { FEATURE_LOG_ENTRIES, FEATURE_LOG_LATEST_ENTRY, getFeatureLogText } from '../lib/featureLog'

export function FeatureLog() {
  const { t, i18n } = useTranslation()
  const { data: capabilitiesData } = useCapabilities()
  const versionLabel = capabilitiesData?.version?.label || capabilitiesData?.version?.backend || null
  const commit = capabilitiesData?.version?.commit || null
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'

  const formatDate = (value: string) => {
    try {
      return new Intl.DateTimeFormat(dateLocale, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(`${value}T00:00:00`))
    } catch {
      return value
    }
  }

  const latestEntryText = getFeatureLogText(FEATURE_LOG_LATEST_ENTRY, i18n.language)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ScrollText className="h-3.5 w-3.5" />
            {t('featureLog.badge')}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{t('featureLog.title')}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {t('featureLog.subtitle')}
          </p>
        </div>
        <Link
          to="/settings?tab=system"
          className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-card/80 px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary/60"
        >
          {t('featureLog.backToTech')}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('featureLog.latestTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 font-medium">
                {FEATURE_LOG_LATEST_ENTRY.tag || formatDate(FEATURE_LOG_LATEST_ENTRY.date)}
              </span>
              <span className="text-muted-foreground">{formatDate(FEATURE_LOG_LATEST_ENTRY.date)}</span>
            </div>
            <div>
              <div className="text-base font-semibold">{latestEntryText.title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{latestEntryText.summary}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('featureLog.runtimeTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t('featureLog.runtimeVersion')}</span>
              <span className="font-medium">{versionLabel || t('common.notAvailable')}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t('featureLog.runtimeCommit')}</span>
              <span className="font-mono text-xs">{commit ? String(commit).slice(0, 12) : t('common.notAvailable')}</span>
            </div>
            <p className="pt-2 text-xs leading-relaxed text-muted-foreground">
              {t('featureLog.runtimeHint')}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {FEATURE_LOG_ENTRIES.map((entry) => {
          const text = getFeatureLogText(entry, i18n.language)
          return (
            <Card key={entry.id} className="border-border/60 bg-card/95 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle className="text-lg">{text.title}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{text.summary}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {entry.tag ? (
                      <span className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 font-medium">
                        {entry.tag}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground">{formatDate(entry.date)}</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {text.images?.length ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {text.images.map((image) => (
                      <figure
                        key={`${entry.id}-${image.src}`}
                        className="overflow-hidden rounded-xl border border-border/60 bg-background/80"
                      >
                        <img
                          src={image.src}
                          alt={image.alt}
                          className="block h-auto w-full"
                          loading="lazy"
                        />
                        {image.caption ? (
                          <figcaption className="border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                            {image.caption}
                          </figcaption>
                        ) : null}
                      </figure>
                    ))}
                  </div>
                ) : null}
                <ul className="space-y-2 text-sm text-foreground/90">
                  {text.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
