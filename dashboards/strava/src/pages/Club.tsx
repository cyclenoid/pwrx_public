import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { exportClubStats, getClubConfig, getClubStats, saveClubConfig } from '../lib/api'

export function Club() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [clubId, setClubId] = useState('')
  const [exportEnabled, setExportEnabled] = useState(false)
  const [exportUrl, setExportUrl] = useState('')
  const [exportToken, setExportToken] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  const statsQuery = useQuery({
    queryKey: ['club-stats'],
    queryFn: () => getClubStats(30),
    retry: 1,
  })

  const configQuery = useQuery({
    queryKey: ['club-config'],
    queryFn: getClubConfig,
    retry: 1,
  })

  useEffect(() => {
    if (!configQuery.data) return
    setClubId(configQuery.data.clubId || '')
    setExportEnabled(Boolean(configQuery.data.exportEnabled))
    setExportUrl(configQuery.data.exportUrl || '')
  }, [configQuery.data])

  const saveMutation = useMutation({
    mutationFn: saveClubConfig,
    onSuccess: (data) => {
      setStatusMessage(t('club.messages.saved'))
      setExportToken('')
      queryClient.setQueryData(['club-config'], data)
      queryClient.invalidateQueries({ queryKey: ['club-stats'] })
    },
    onError: (error: any) => {
      setStatusMessage(error?.response?.data?.error || t('club.messages.saveError'))
    },
  })

  const exportMutation = useMutation({
    mutationFn: () => exportClubStats(30),
    onSuccess: () => {
      setStatusMessage(t('club.messages.exported'))
      queryClient.invalidateQueries({ queryKey: ['club-config'] })
    },
    onError: (error: any) => {
      setStatusMessage(error?.response?.data?.error || t('club.messages.exportError'))
    },
  })

  const stats = statsQuery.data
  const config = configQuery.data

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatusMessage('')
    saveMutation.mutate({
      clubId,
      exportEnabled,
      exportUrl,
      exportToken: exportToken.trim() || undefined,
    })
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{t('club.kicker')}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('club.title')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('club.intro')}</p>
          </div>
          {stats && (
            <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-right">
              <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('club.window')}</div>
              <div className="mt-1 text-sm font-semibold">{t('club.windowValue', { days: stats.windowDays })}</div>
            </div>
          )}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('club.cards.members')}</p>
          <strong className="mt-2 block text-3xl font-bold">{stats ? stats.memberCount.toLocaleString() : '--'}</strong>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('club.cards.activities')}</p>
          <strong className="mt-2 block text-3xl font-bold">{stats ? stats.activityCount.toLocaleString() : '--'}</strong>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('club.cards.distance')}</p>
          <strong className="mt-2 block text-3xl font-bold">{stats ? t('club.distanceValue', { value: Math.round(stats.distanceKm) }) : '--'}</strong>
        </article>
        <article className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t('club.cards.elevation')}</p>
          <strong className="mt-2 block text-3xl font-bold">{stats ? t('club.elevationValue', { value: Math.round(stats.elevationM) }) : '--'}</strong>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t('club.statsTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('club.statsIntro')}</p>
          </div>

          {statsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">{t('club.messages.loading')}</p>
          ) : stats ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('club.fields.clubName')}</dt>
                <dd className="mt-2 text-base font-semibold">{stats.clubName}</dd>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('club.fields.activeAthletes')}</dt>
                <dd className="mt-2 text-base font-semibold">{stats.activeAthletes.toLocaleString()}</dd>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-4 sm:col-span-2">
                <dt className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{t('club.fields.updatedAt')}</dt>
                <dd className="mt-2 text-base font-semibold">{new Date(stats.updatedAt).toLocaleString()}</dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t('club.messages.noStats')}</p>
          )}
        </article>

        <article className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">{t('club.exportTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('club.exportIntro')}</p>
          </div>

          <form className="space-y-4" onSubmit={handleSave}>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">{t('club.fields.clubId')}</span>
              <input
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                type="text"
                value={clubId}
                onChange={(event) => setClubId(event.target.value)}
                placeholder="10325"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">{t('club.fields.exportUrl')}</span>
              <input
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                type="url"
                value={exportUrl}
                onChange={(event) => setExportUrl(event.target.value)}
                placeholder="https://www.loewenhain.com/api/club-stats"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-medium">{t('club.fields.exportToken')}</span>
              <input
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm"
                type="password"
                value={exportToken}
                onChange={(event) => setExportToken(event.target.value)}
                placeholder={config?.exportTokenConfigured ? t('club.fields.exportTokenConfigured') : t('club.fields.exportTokenPlaceholder')}
              />
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
              <input
                type="checkbox"
                checked={exportEnabled}
                onChange={(event) => setExportEnabled(event.target.checked)}
              />
              <span className="text-sm">{t('club.fields.exportEnabled')}</span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? t('club.actions.saving') : t('club.actions.save')}
              </button>
              <button
                type="button"
                className="rounded-xl border border-border px-4 py-3 text-sm font-semibold disabled:opacity-60"
                disabled={exportMutation.isPending || !config?.exportEnabled || !config?.exportUrl}
                onClick={() => {
                  setStatusMessage('')
                  exportMutation.mutate()
                }}
              >
                {exportMutation.isPending ? t('club.actions.exporting') : t('club.actions.export')}
              </button>
            </div>
          </form>

          <div className="mt-4 space-y-2 text-sm text-muted-foreground">
            {config?.lastExportedAt ? (
              <p>{t('club.fields.lastExportedAt', { value: new Date(config.lastExportedAt).toLocaleString() })}</p>
            ) : null}
            {config?.lastExportError ? (
              <p className="text-red-500">{t('club.fields.lastExportError', { value: config.lastExportError })}</p>
            ) : null}
            {statusMessage ? <p>{statusMessage}</p> : null}
          </div>
        </article>
      </section>
    </div>
  )
}

export default Club
