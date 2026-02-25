import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  getSyncLogs,
  getTechStats,
  repairLegacySportTypes,
  renameLocalSegmentsBulk,
  rebuildActivityLocalSegments,
  triggerLocalSegmentsBackfill,
  triggerFullSync,
  type LocalSegmentBackfillResponse,
  type RepairLegacySportTypesResponse,
  type LocalSegmentRebuildResponse,
  type SyncLog,
  updateUserProfile,
  updateUserSetting,
} from '../lib/api'
import ImportPage from './Import'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { useUserProfile } from '../hooks/useUserProfile'
import type { UserProfile } from '../types/user'
import { useTranslation } from 'react-i18next'
import { useToast } from '../hooks/useToast'
import { Toaster } from '../components/ui/toast'
import { useCapabilities } from '../hooks/useCapabilities'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bike,
  Calendar,
  Check,
  Clock,
  Database,
  Flag,
  Image,
  Layers,
  Link2,
  Map,
  Monitor,
  FileUp,
  Settings as SettingsIcon,
  Target,
  User
} from 'lucide-react'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { capabilities } = useCapabilities()
  const supportsFiles = capabilities.supportsFiles
  const supportsSync = capabilities.supportsSync
  const supportsOAuth = capabilities.supportsOAuth
  const queryClient = useQueryClient()
  const { toast, toasts, dismiss } = useToast()
  const { data: profile, isLoading } = useUserProfile()
  const { data: tech } = useQuery({
    queryKey: ['tech'],
    queryFn: getTechStats,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60000,
  })
  const { data: syncLogsData } = useQuery({
    queryKey: ['sync-logs'],
    queryFn: () => getSyncLogs(10),
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    enabled: supportsSync,
  })
  const syncLogs = syncLogsData?.logs || []
  const lastSyncLog = syncLogs[0]
  const isSyncRunning = syncLogs.some((log: SyncLog) => log.status === 'running')
  const dateLocale = i18n.language?.startsWith('de') ? 'de-DE' : 'en-US'
  const formatDate = (value: string | number) => new Intl.DateTimeFormat(dateLocale).format(new Date(value))
  const formatDateTime = (value: string | number) => new Intl.DateTimeFormat(dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))

  const scheduleDefaults = {
    sync_activity_cron: '0 3 * * *',
    sync_backfill_cron: '30 3 * * *'
  } as const

  const extractDailyTime = (cron?: string | null) => {
    if (!cron) return null
    const match = cron.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/)
    if (!match) return null
    const minute = match[1].padStart(2, '0')
    const hour = match[2].padStart(2, '0')
    return `${hour}:${minute}`
  }

  const cronFromTime = (time: string) => {
    const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    if (!match) return null
    const hour = match[1]
    const minute = match[2]
    return `${Number(minute)} ${Number(hour)} * * *`
  }

  const [editing, setEditing] = useState<Record<string, boolean>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [recentlySavedFields, setRecentlySavedFields] = useState<Record<string, boolean>>({})
  const [renameIncludeManual, setRenameIncludeManual] = useState(false)
  const [renameManualNames, setRenameManualNames] = useState(false)
  const [renameBatchSize, setRenameBatchSize] = useState('200')
  const [segmentBackfillLimit, setSegmentBackfillLimit] = useState('200')
  const [segmentBackfillResult, setSegmentBackfillResult] = useState<LocalSegmentBackfillResponse | null>(null)
  const [segmentRebuildActivityId, setSegmentRebuildActivityId] = useState('')
  const [segmentRebuildResult, setSegmentRebuildResult] = useState<LocalSegmentRebuildResponse | null>(null)
  const [repairLegacySportTypesResult, setRepairLegacySportTypesResult] = useState<RepairLegacySportTypesResponse | null>(null)
  const [segmentAdvancedOpen, setSegmentAdvancedOpen] = useState(false)
  type TabKey = 'personal' | 'segments' | 'import' | 'sync' | 'logs' | 'system'
  const [searchParams, setSearchParams] = useSearchParams()
  const getTabFromParams = (value: string | null): TabKey => {
    if (value === 'sync' || value === 'logs' || value === 'system' || value === 'personal' || value === 'import' || value === 'segments') {
      return value
    }
    return 'personal'
  }
  const activeTab = getTabFromParams(searchParams.get('tab'))
  const tabButtonClass = (tab: TabKey) =>
    activeTab === tab
      ? 'shadow-sm ring-2 ring-primary/30'
      : 'text-muted-foreground hover:text-foreground'
  const markProfileBasicsConfirmed = async () => {
    await updateUserSetting('onboarding_profile_basics_confirmed', 'true')
  }

  const markFieldSaved = (field?: string) => {
    if (!field) return
    setEditing((prev) => ({ ...prev, [field]: false }))
    setRecentlySavedFields((prev) => ({ ...prev, [field]: true }))
    window.setTimeout(() => {
      setRecentlySavedFields((prev) => {
        if (!prev[field]) return prev
        const next = { ...prev }
        delete next[field]
        return next
      })
    }, 1400)
  }

  const profileMutation = useMutation({
    mutationFn: (updates: Partial<UserProfile>) => updateUserProfile(updates),
    onSuccess: async (_data, variables) => {
      const savedField = Object.keys(variables || {})[0]
      await markProfileBasicsConfirmed()
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      await queryClient.refetchQueries({ queryKey: ['user-profile'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      markFieldSaved(savedField)
    },
  })

  const settingMutation = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => updateUserSetting(key, value),
    onSuccess: async (_data, variables) => {
      if (variables.key === 'athlete_weight' || variables.key === 'ftp') {
        await markProfileBasicsConfirmed()
      }
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      await queryClient.refetchQueries({ queryKey: ['user-profile'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['ftp'] })
      markFieldSaved(variables.key)
    },
  })

  const bulkSettingMutation = useMutation({
    mutationFn: async (updates: Array<{ key: string; value: string }>) => {
      for (const update of updates) {
        await updateUserSetting(update.key, update.value)
      }
    },
    onSuccess: async (_data, updates) => {
      if (updates.some((update) => update.key === 'athlete_weight' || update.key === 'ftp')) {
        await markProfileBasicsConfirmed()
      }
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] })
      await queryClient.refetchQueries({ queryKey: ['user-profile'] })
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['ftp'] })
      setEditing({})
    },
  })

  const manualSyncMutation = useMutation({
    mutationFn: async () => {
      await triggerFullSync()
    },
    onSuccess: async () => {
      toast({
        title: t('settings.sync.toast.activityStartedTitle'),
        description: t('settings.sync.toast.successBody'),
        variant: 'success',
      })
      await queryClient.invalidateQueries({ queryKey: ['sync-logs'] })
      await queryClient.invalidateQueries({ queryKey: ['tech'] })
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        toast({
          title: t('settings.sync.toast.alreadyRunningTitle'),
          description: t('settings.sync.toast.alreadyRunningBody'),
          variant: 'error',
        })
        return
      }
      toast({
        title: t('settings.sync.toast.errorTitle'),
        description: t('settings.sync.toast.errorBody'),
        variant: 'error',
      })
    }
  })

  const renameLocalSegmentsMutation = useMutation({
    mutationFn: async () => {
      const parsePositive = (value: string | undefined, fallback: number) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
      }
      const batchSize = parsePositive(renameBatchSize, 200)
      const reverseGeocodeEnabled = getBooleanSetting(
        'local_segments_reverse_geocode_enabled',
        false,
        'local_climbs_reverse_geocode_enabled'
      )
      const reverseGeocodeUrl = String(
        getSettingValue('local_segments_reverse_geocode_url', 'local_climbs_reverse_geocode_url') || ''
      ).trim() || undefined
      const reverseGeocodeLanguage = String(
        getSettingValue('local_segments_reverse_geocode_language', 'local_climbs_reverse_geocode_language') || ''
      ).trim() || undefined
      const reverseGeocodeUserAgent = String(
        getSettingValue('local_segments_reverse_geocode_user_agent', 'local_climbs_reverse_geocode_user_agent') || ''
      ).trim() || undefined
      const reverseGeocodeTimeoutMs = parsePositive(
        getSettingValue('local_segments_reverse_geocode_timeout_ms', 'local_climbs_reverse_geocode_timeout_ms'),
        2200
      )
      const preferVirtualActivityName = getBooleanSetting(
        'local_segments_virtual_name_preferred',
        true,
        'local_climbs_virtual_name_preferred'
      )

      return renameLocalSegmentsBulk({
        full: true,
        batchSize,
        includeManual: renameIncludeManual,
        renameManualNames,
        reverseGeocodeEnabled,
        reverseGeocodeUrl,
        reverseGeocodeLanguage,
        reverseGeocodeUserAgent,
        reverseGeocodeTimeoutMs,
        preferVirtualActivityName,
      })
    },
    onSuccess: (result) => {
      toast({
        title: t('settings.localClimbs.rename.toast.successTitle'),
        description: t('settings.localClimbs.rename.toast.successBody', {
          renamed: result.renamedSegments,
          matched: result.matchedSegments,
        }),
        variant: 'success',
      })
      queryClient.invalidateQueries({ queryKey: ['segments-list'] })
      queryClient.invalidateQueries({ queryKey: ['segments-summary'] })
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.error
      toast({
        title: t('settings.localClimbs.rename.toast.errorTitle'),
        description: detail || t('settings.localClimbs.rename.toast.errorBody'),
        variant: 'error',
      })
    },
  })

  type SegmentBackfillMode = 'single' | 'full'
  const segmentBackfillMutation = useMutation({
    mutationFn: async (input: { limit: number; mode: SegmentBackfillMode }) => (
      triggerLocalSegmentsBackfill({
        limit: input.limit,
        full: input.mode === 'full',
        batchSize: input.mode === 'full' ? input.limit : undefined,
      })
    ),
    onSuccess: async (result) => {
      setSegmentBackfillResult(result)
      toast({
        title: t('settings.localClimbs.jobs.backfill.toast.successTitle'),
        description: t('settings.localClimbs.jobs.backfill.toast.successBody', {
          processed: result.processedActivities,
          persisted: result.persistedClimbs,
        }),
        variant: 'success',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['segments-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['segments-list'] }),
        queryClient.invalidateQueries({ queryKey: ['tech'] }),
      ])
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.error
      toast({
        title: t('settings.localClimbs.jobs.backfill.toast.errorTitle'),
        description: detail || t('settings.localClimbs.jobs.backfill.toast.errorBody'),
        variant: 'error',
      })
    },
  })

  const segmentRebuildMutation = useMutation({
    mutationFn: async (activityId: number) => rebuildActivityLocalSegments(activityId),
    onSuccess: async (result, activityId) => {
      setSegmentRebuildResult(result)
      toast({
        title: t('settings.localClimbs.jobs.rebuild.toast.successTitle'),
        description: t('settings.localClimbs.jobs.rebuild.toast.successBody', {
          detected: result.detected,
          persisted: result.persisted,
        }),
        variant: 'success',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activity-segments', String(activityId)] }),
        queryClient.invalidateQueries({ queryKey: ['segments-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['segments-list'] }),
        queryClient.invalidateQueries({ queryKey: ['tech'] }),
      ])
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.error
      toast({
        title: t('settings.localClimbs.jobs.rebuild.toast.errorTitle'),
        description: detail || t('settings.localClimbs.jobs.rebuild.toast.errorBody'),
        variant: 'error',
      })
    },
  })

  const repairLegacySportTypesMutation = useMutation({
    mutationFn: async () => repairLegacySportTypes(),
    onSuccess: async (result) => {
      setRepairLegacySportTypesResult(result)
      toast({
        title: t('settings.localClimbs.jobs.repairSportTypes.toast.successTitle'),
        description: t('settings.localClimbs.jobs.repairSportTypes.toast.successBody', {
          scanned: result.scanned,
          updated: result.updated,
        }),
        variant: 'success',
      })
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['activities'] }),
        queryClient.invalidateQueries({ queryKey: ['activity'] }),
        queryClient.invalidateQueries({ queryKey: ['segments-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['segments-list'] }),
        queryClient.invalidateQueries({ queryKey: ['tech'] }),
      ])
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.error
      toast({
        title: t('settings.localClimbs.jobs.repairSportTypes.toast.errorTitle'),
        description: detail || t('settings.localClimbs.jobs.repairSportTypes.toast.errorBody'),
        variant: 'error',
      })
    },
  })

  const triggerSegmentBackfill = (mode: SegmentBackfillMode) => {
    const parsed = Number(segmentBackfillLimit)
    const limit = Number.isFinite(parsed) ? Math.max(1, Math.min(Math.floor(parsed), 2000)) : 200
    setSegmentBackfillLimit(String(limit))
    segmentBackfillMutation.mutate({ limit, mode })
  }

  const triggerSegmentRebuild = () => {
    const parsed = Number(segmentRebuildActivityId)
    const activityId = Number.isFinite(parsed) ? Math.floor(parsed) : NaN
    if (!Number.isFinite(activityId) || activityId === 0) {
      toast({
        title: t('settings.localClimbs.jobs.rebuild.toast.errorTitle'),
        description: t('settings.localClimbs.jobs.rebuild.invalidActivityId'),
        variant: 'error',
      })
      return
    }
    segmentRebuildMutation.mutate(activityId)
  }

  const handleProfileUpdate = (field: string) => {
    profileMutation.mutate({ [field]: values[field] })
  }

  const handleSettingUpdate = (key: string, explicitValue?: string) => {
    const value = explicitValue ?? values[key]
    settingMutation.mutate({ key, value })
  }

  const addMinutesToTime = (time: string, minutes: number) => {
    const match = time.match(/^([01]\d|2[0-3]):([0-5]\d)$/)
    if (!match) return time
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
    date.setMinutes(date.getMinutes() + minutes)
    const hours = String(date.getHours()).padStart(2, '0')
    const mins = String(date.getMinutes()).padStart(2, '0')
    return `${hours}:${mins}`
  }

  const setAutoSyncEnabled = (nextEnabled: boolean) => {
    const updates: Array<{ key: string; value: string }> = [
      { key: 'sync_activity_enabled', value: nextEnabled ? 'true' : 'false' },
      { key: 'sync_backfill_enabled', value: nextEnabled ? 'true' : 'false' },
    ]
    if (nextEnabled) {
      updates.push(
        { key: 'sync_activity_include_streams', value: 'true' },
        { key: 'sync_activity_include_segments', value: 'true' }
      )
    }
    bulkSettingMutation.mutate(updates)
  }

  const saveDailySyncTime = (time: string) => {
    const activityCron = cronFromTime(time)
    const backfillTime = addMinutesToTime(time, 30)
    const backfillCron = cronFromTime(backfillTime)
    const updates: Array<{ key: string; value: string }> = []
    updates.push({ key: 'sync_activity_cron', value: activityCron || scheduleDefaults.sync_activity_cron })
    updates.push({ key: 'sync_backfill_cron', value: backfillCron || scheduleDefaults.sync_backfill_cron })
    bulkSettingMutation.mutate(updates, {
      onSuccess: () => {
        markFieldSaved('sync_daily_time')
      },
    })
  }

  const startEdit = (field: string, currentValue: string | null | undefined) => {
    setValues({ ...values, [field]: currentValue || '' })
    setEditing({ ...editing, [field]: true })
  }

  const cancelEdit = (field: string) => {
    setEditing({ ...editing, [field]: false })
  }

  const getSettingValue = (primaryKey: string, legacyKey?: string) => {
    const primary = profile?.settings?.[primaryKey]
    if (primary !== undefined && primary !== null && String(primary).trim() !== '') {
      return String(primary)
    }
    if (legacyKey) {
      const legacy = profile?.settings?.[legacyKey]
      if (legacy !== undefined && legacy !== null && String(legacy).trim() !== '') {
        return String(legacy)
      }
    }
    return undefined
  }

  const getBooleanSetting = (key: string, fallback: boolean = false, legacyKey?: string) => {
    const raw = getSettingValue(key, legacyKey)
    if (raw === undefined || raw === null) return fallback
    return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase())
  }

  useEffect(() => {
    if (!searchParams.get('tab')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('tab', 'personal')
      setSearchParams(nextParams, { replace: true })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!supportsSync && (activeTab === 'sync' || activeTab === 'logs')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('tab', 'personal')
      setSearchParams(nextParams, { replace: true })
    }
  }, [activeTab, searchParams, setSearchParams, supportsSync])

  useEffect(() => {
    if (!supportsFiles && activeTab === 'import') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('tab', 'personal')
      setSearchParams(nextParams, { replace: true })
    }
    if (!capabilities.supportsSegments && activeTab === 'segments') {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('tab', 'personal')
      setSearchParams(nextParams, { replace: true })
    }
  }, [activeTab, capabilities.supportsSegments, searchParams, setSearchParams, supportsFiles])

  const setTab = (tab: TabKey) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', tab)
    setSearchParams(nextParams, { replace: true })
  }

  const renderToggleField = (
    label: string,
    key: string,
    fallback: boolean = false,
    description?: string,
    legacyKey?: string
  ) => {
    const enabled = getBooleanSetting(key, fallback, legacyKey)
    return (
      <div className="flex items-center justify-between py-2.5 border-b last:border-0">
        <div className="flex-1 pr-4">
          <label className="text-sm font-medium">{label}</label>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        <Button
          size="sm"
          variant={enabled ? 'default' : 'outline'}
          disabled={settingMutation.isPending}
          onClick={() => handleSettingUpdate(key, enabled ? 'false' : 'true')}
        >
          {enabled ? t('settings.sync.enabled') : t('settings.sync.disabled')}
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-96">{t('common.loading')}</div>
  }

  if (!profile) {
    return <div className="flex items-center justify-center h-96">{t('settings.profileNotFound')}</div>
  }

  const athleteIdDisplay = (() => {
    if (profile.strava_athlete_id && profile.strava_athlete_id > 0) {
      return String(profile.strava_athlete_id)
    }
    if (profile.strava_token_set || profile.strava_refresh_token) {
      return t('settings.connection.athleteIdSet')
    }
    return t('settings.connection.athleteIdMissing')
  })()

  const syncDailyTime = extractDailyTime(profile.settings?.sync_activity_cron || scheduleDefaults.sync_activity_cron) || '03:00'
  const syncEnabled = getBooleanSetting('sync_activity_enabled', true)
    && getBooleanSetting('sync_backfill_enabled', true)
  const hasStravaConnection = supportsOAuth && Boolean(profile.strava_token_set || profile.strava_refresh_token)

  const isSyncBusy = isSyncRunning
    || manualSyncMutation.isPending
    || bulkSettingMutation.isPending

  const renderField = (
    label: string,
    field: string,
    currentValue: string | null | undefined,
    isProfileField: boolean,
    unit?: string,
    placeholder?: string,
    description?: string
  ) => (
    <div className="flex items-center justify-between py-2.5 border-b last:border-0">
      <div className="flex-1">
        <label className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        {!editing[field] ? (
          <p className="text-sm text-muted-foreground mt-0.5">
            {currentValue || <span className="italic">{t('settings.notSet')}</span>} {unit}
          </p>
        ) : (
          <div className="flex items-center gap-2 mt-1.5">
            <input
              type="text"
              value={values[field] || ''}
              onChange={(e) => setValues({ ...values, [field]: e.target.value })}
              className="px-3 py-1.5 border rounded-lg bg-background text-sm flex-1"
              placeholder={placeholder}
              autoFocus
            />
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
          </div>
        )}
      </div>
      <div className="flex gap-2 ml-4">
        {!editing[field] ? (
          recentlySavedFields[field] ? (
            <Button
              size="sm"
              variant="outline"
              disabled
              className="border-emerald-500/50 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 transition-colors duration-500"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              {t('common.saved')}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => startEdit(field, currentValue)}
            >
              {t('common.edit')}
            </Button>
          )
        ) : (
          <>
            <Button
              size="sm"
              onClick={() => isProfileField ? handleProfileUpdate(field) : handleSettingUpdate(field)}
              disabled={profileMutation.isPending || settingMutation.isPending}
            >
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => cancelEdit(field)}
            >
              {t('common.cancel')}
            </Button>
          </>
        )}
      </div>
    </div>
  )

  const renderTimeField = (
    label: string,
    field: string,
    currentValue: string,
    placeholder: string
  ) => {
    const displayValue = currentValue || placeholder
    return (
      <div className="flex items-center justify-between py-2.5 border-b last:border-0">
        <div className="flex-1 pr-4">
          <label className="text-sm font-medium">{label}</label>
          {!editing[field] ? (
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.sync.display.dailyAt', { time: displayValue })}
            </p>
          ) : (
            <div className="mt-1.5">
              <input
                type="time"
                value={values[field] || ''}
                onChange={(e) => setValues({ ...values, [field]: e.target.value })}
                className="px-3 py-1.5 border rounded-lg bg-background text-sm w-36"
                placeholder={placeholder}
              />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {!editing[field] ? (
            recentlySavedFields[field] ? (
              <Button
                size="sm"
                variant="outline"
                disabled
                className="border-emerald-500/50 bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 transition-colors duration-500"
              >
                <Check className="h-3.5 w-3.5 mr-1" />
                {t('common.saved')}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => startEdit(field, displayValue)}
              >
                {t('common.edit')}
              </Button>
            )
          ) : (
            <>
              <Button
                size="sm"
                onClick={() => saveDailySyncTime(values[field] || displayValue)}
                disabled={bulkSettingMutation.isPending}
              >
                {t('common.save')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => cancelEdit(field)}
              >
                {t('common.cancel')}
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const renderProgressBar = (
    label: string,
    total: number,
    segments: Array<{ label: string; value: number; color: string }>
  ) => {
    const safeTotal = Math.max(total, segments.reduce((sum, seg) => sum + seg.value, 0), 1)
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">{t('settings.syncStatus.total', { value: total.toLocaleString() })}</span>
        </div>
        <div className="h-5 rounded-full overflow-hidden bg-muted/40 flex">
          {segments.map((segment) => {
            if (segment.value <= 0) return null
            const width = (segment.value / safeTotal) * 100
            return (
              <div
                key={segment.label}
                className={`h-full flex items-center justify-center text-[10px] font-semibold ${segment.color}`}
                style={{ width: `${width}%` }}
                title={`${segment.label}: ${segment.value.toLocaleString()}`}
              >
                {segment.value.toLocaleString()}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {segments.map((segment) => (
            <div key={segment.label} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-sm ${segment.color}`} />
              <span>{segment.label}: {segment.value.toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  const renderSystemLine = (label: string, value: string, valueClass: string = 'text-foreground') => (
    <div className="flex items-center justify-between text-xs py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  )

  const parseSyncMessage = (message?: string | null) => {
    if (!message) {
      return { summary: t('common.notAvailable'), warnings: [] as string[] }
    }

    const errorMatch = message.match(/^(API_LIMIT_REACHED|AUTH_ERROR|FORBIDDEN|STRAVA_ERROR|NETWORK_ERROR):/i)
    if (errorMatch) {
      const code = errorMatch[1].toUpperCase()
      return {
        summary: t(`settings.syncStatus.errors.${code}`),
        warnings: [],
      }
    }

    const parts = message.split(' | ').map((part) => part.trim()).filter(Boolean)
    if (parts.length === 0) {
      return { summary: t('common.notAvailable'), warnings: [] as string[] }
    }

    const typeLabel = (() => {
      const first = parts[0].toLowerCase()
      if (first.includes('scheduled activity sync')) return t('settings.syncStatus.syncTypes.scheduledActivity')
      if (first.includes('scheduled backfill sync')) return t('settings.syncStatus.syncTypes.scheduledBackfill')
      if (first.includes('manual full sync')) return t('settings.syncStatus.syncTypes.manualFull')
      if (first.includes('manual activity sync')) return t('settings.syncStatus.syncTypes.manualActivity')
      if (first.includes('manual backfill sync')) return t('settings.syncStatus.syncTypes.manualBackfill')
      if (first.includes('startup activity sync')) return t('settings.syncStatus.syncTypes.startupActivity')
      if (first.includes('startup backfill sync')) return t('settings.syncStatus.syncTypes.startupBackfill')
      if (first.includes('initial sync')) return t('settings.syncStatus.syncTypes.initial')
      return parts[0]
    })()

    let streams: number | null = null
    let segmentsActivities: number | null = null
    let segmentsEfforts: number | null = null
    let photos: number | null = null
    let downloads: number | null = null
    let powerCurveOk = false
    let segmentErrors = 0
    const warnings: string[] = []

    parts.slice(1).forEach((part) => {
      const [rawKey, rawValue] = part.split('=').map((value) => value?.trim())
      if (!rawKey || rawValue === undefined) return

      const key = rawKey.toLowerCase()
      const value = rawValue.toLowerCase()

      if (key === 'warning' && value.includes('rate_limit')) {
        warnings.push(t('settings.syncStatus.warnings.rateLimit'))
        return
      }

      if (key === 'segment_errors') {
        const count = Number(rawValue || 0)
        if (Number.isFinite(count) && count > 0) {
          segmentErrors = count
        }
        return
      }

      const parsedNumber = Number(rawValue)
      if (key === 'streams' || key === 'backfill_streams') {
        if (Number.isFinite(parsedNumber)) streams = parsedNumber
        return
      }
      if (key === 'segments_activities' || key === 'backfill_segments_activities') {
        if (Number.isFinite(parsedNumber)) segmentsActivities = parsedNumber
        return
      }
      if (key === 'segments_efforts' || key === 'backfill_segments_efforts') {
        if (Number.isFinite(parsedNumber)) segmentsEfforts = parsedNumber
        return
      }
      if (key === 'photos' || key === 'backfill_photos') {
        if (Number.isFinite(parsedNumber)) photos = parsedNumber
        return
      }
      if (key === 'downloads' || key === 'backfill_downloads') {
        if (Number.isFinite(parsedNumber)) downloads = parsedNumber
        return
      }
      if (key === 'power_curve' && value === 'ok') {
        powerCurveOk = true
      }
    })

    if (segmentErrors > 0) {
      warnings.push(t('settings.syncStatus.warnings.segmentErrors', { count: segmentErrors }))
    }

    const metrics: string[] = []
    if (streams !== null) {
      metrics.push(t('settings.syncStatus.metrics.streams', { count: streams }))
    }
    if (segmentsActivities !== null || segmentsEfforts !== null) {
      if (segmentsActivities !== null && segmentsEfforts !== null) {
        metrics.push(t('settings.syncStatus.metrics.segmentsCombined', { activities: segmentsActivities, efforts: segmentsEfforts }))
      } else if (segmentsActivities !== null) {
        metrics.push(t('settings.syncStatus.metrics.segmentsActivities', { count: segmentsActivities }))
      } else if (segmentsEfforts !== null) {
        metrics.push(t('settings.syncStatus.metrics.segmentsEfforts', { count: segmentsEfforts }))
      }
    }
    if (photos !== null) {
      metrics.push(t('settings.syncStatus.metrics.photos', { count: photos }))
    }
    if (downloads !== null) {
      metrics.push(t('settings.syncStatus.metrics.downloads', { count: downloads }))
    }
    if (powerCurveOk) {
      metrics.push(t('settings.syncStatus.metrics.powerCurve'))
    }

    const summaryParts = [typeLabel, ...metrics].filter(Boolean)
    return {
      summary: summaryParts.join(' · '),
      warnings,
    }
  }

  const renderSyncSummary = (message?: string | null) => {
    const parsed = parseSyncMessage(message)
    return parsed.summary
  }

  const renderSyncDetails = (message?: string | null) => {
    const parsed = parseSyncMessage(message)
    return (
      <div className="space-y-1">
        <div className="text-foreground" title={message || ''}>{parsed.summary}</div>
        {parsed.warnings.length > 0 && (
          <div className="text-[11px] text-amber-400">{parsed.warnings.join(' • ')}</div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h2>
        <p className="text-muted-foreground mt-1">
          {t('settings.subtitle')}
        </p>
      </div>

      {/* Avatar & Name Card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-2xl font-bold overflow-hidden">
              {profile.profile_photo ? (
                <img
                  src={profile.profile_photo}
                  alt={t('settings.profilePhotoAlt')}
                  className="w-full h-full object-cover"
                />
              ) : (
                (profile.firstname?.[0] || profile.lastname?.[0] || 'U').toUpperCase()
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold">
                {profile.firstname || t('settings.defaults.athlete')} {profile.lastname || ''}
              </h3>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  profile.is_active
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                    : 'bg-gray-500/20 text-gray-600'
                }`}>
                  {profile.is_active ? t('settings.status.active') : t('settings.status.inactive')}
                </span>
              </div>
              {supportsSync && profile.last_sync_at && (
                <p className="text-xs text-muted-foreground">
                  {t('settings.lastSync', { value: formatDateTime(profile.last_sync_at) })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={activeTab === 'personal' ? 'default' : 'outline'}
          className={`justify-start gap-2 ${tabButtonClass('personal')}`}
          onClick={() => setTab('personal')}
        >
          <User className="h-4 w-4" />
          {t('settings.tabs.personal')}
        </Button>
        {supportsFiles && (
          <Button
            variant={activeTab === 'import' ? 'default' : 'outline'}
            className={`justify-start gap-2 ${tabButtonClass('import')}`}
            onClick={() => setTab('import')}
          >
            <FileUp className="h-4 w-4" />
            {t('settings.tabs.import')}
          </Button>
        )}
        {supportsSync && (
          <Button
            variant={activeTab === 'sync' ? 'default' : 'outline'}
            className={`justify-start gap-2 ${tabButtonClass('sync')}`}
            onClick={() => setTab('sync')}
          >
            <Clock className="h-4 w-4" />
            {t('settings.tabs.sync')}
          </Button>
        )}
        {supportsSync && (
          <Button
            variant={activeTab === 'logs' ? 'default' : 'outline'}
            className={`justify-start gap-2 ${tabButtonClass('logs')}`}
            onClick={() => setTab('logs')}
          >
            <BarChart3 className="h-4 w-4" />
            {t('settings.tabs.logs')}
          </Button>
        )}
        {capabilities.supportsSegments && (
          <Button
            variant={activeTab === 'segments' ? 'default' : 'outline'}
            className={`justify-start gap-2 ${tabButtonClass('segments')}`}
            onClick={() => setTab('segments')}
          >
            <Flag className="h-4 w-4" />
            {t('settings.tabs.segments')}
          </Button>
        )}
        <Button
          variant={activeTab === 'system' ? 'default' : 'outline'}
          className={`justify-start gap-2 ${tabButtonClass('system')}`}
          onClick={() => setTab('system')}
        >
          <Monitor className="h-4 w-4" />
          {t('settings.tabs.system')}
        </Button>
      </div>

      {activeTab === 'personal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Profile */}
            <Card>
              <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <User className="h-4 w-4" /> {t('settings.sections.profile')}
              </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {renderField(t('settings.fields.firstname'), 'firstname', profile.firstname, true, undefined, t('settings.placeholders.firstname'))}
                {renderField(t('settings.fields.lastname'), 'lastname', profile.lastname, true, undefined, t('settings.placeholders.lastname'))}
              </CardContent>
            </Card>

            {/* Body Data & Power */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <SettingsIcon className="h-4 w-4" /> {t('settings.sections.body')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                {renderField(t('settings.fields.weight'), 'athlete_weight', profile.settings?.athlete_weight, false, t('settings.units.kg'), '70.0')}
                {renderField(t('settings.fields.ftp'), 'ftp', profile.settings?.ftp, false, t('settings.units.watt'), '250')}
                {renderField(t('settings.fields.maxHr'), 'max_heartrate', profile.settings?.max_heartrate, false, t('settings.units.bpm'), '190')}
                {renderField(t('settings.fields.restingHr'), 'resting_heartrate', profile.settings?.resting_heartrate, false, t('settings.units.bpm'), '60')}
              </CardContent>
            </Card>

            {/* Training Goals */}
            <Card>
              <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" /> {t('settings.sections.goals')}
              </CardTitle>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Bike className="h-3.5 w-3.5" /> {t('settings.goals.cycling')}
                </div>
                {renderField(t('settings.goals.weekly'), 'weekly_distance_goal_ride', profile.settings?.weekly_distance_goal_ride, false, t('activities.units.kmShort'), '170')}
                {renderField(t('settings.goals.yearly'), 'yearly_distance_goal_ride', profile.settings?.yearly_distance_goal_ride, false, t('activities.units.kmShort'), '8500')}

                <div className="text-xs font-semibold text-muted-foreground mb-2 mt-4 pt-3 border-t flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5" /> {t('settings.goals.running')}
                </div>
                {renderField(t('settings.goals.weekly'), 'weekly_distance_goal_run', profile.settings?.weekly_distance_goal_run, false, t('activities.units.kmShort'), '30')}
                {renderField(t('settings.goals.yearly'), 'yearly_distance_goal_run', profile.settings?.yearly_distance_goal_run, false, t('activities.units.kmShort'), '1000')}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Account Details */}
            {supportsOAuth && (
              <Card>
                <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Link2 className="h-4 w-4" /> {t('settings.sections.connection')}
                </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    {t('settings.connection.sourceHint')}
                  </p>
                  <div className="space-y-0 text-sm">
                    <div className="flex justify-between py-2.5 border-b">
                      <span className="text-muted-foreground">{t('settings.connection.athleteId')}</span>
                      <span className={profile.strava_athlete_id && profile.strava_athlete_id > 0 ? 'font-mono text-xs' : 'text-xs text-muted-foreground'}>
                        {athleteIdDisplay}
                      </span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b">
                      <span className="text-muted-foreground">{t('settings.connection.status')}</span>
                    <span className={`font-semibold text-xs ${(profile.strava_token_set || profile.strava_refresh_token) ? 'text-green-600 dark:text-green-400' : 'text-gray-500'}`}>
                      {(profile.strava_token_set || profile.strava_refresh_token) ? t('settings.connection.connected') : t('settings.connection.disconnected')}
                    </span>
                    </div>
                    <div className="flex justify-between py-2.5 border-b">
                      <span className="text-muted-foreground">{t('settings.connection.scope')}</span>
                      <span className="font-mono text-xs">{profile.strava_scope || 'N/A'}</span>
                    </div>
                    {profile.strava_token_expires_at && (
                      <div className="flex justify-between py-2.5 border-b">
                        <span className="text-muted-foreground">{t('settings.connection.tokenExpires')}</span>
                        <span className="text-xs">{formatDate(profile.strava_token_expires_at * 1000)}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-2.5 border-b">
                      <span className="text-muted-foreground">{t('settings.connection.createdAt')}</span>
                      <span className="text-xs">{formatDate(profile.created_at)}</span>
                    </div>
                    <div className="flex justify-between py-2.5">
                      <span className="text-muted-foreground">{t('settings.connection.updatedAt')}</span>
                      <span className="text-xs">{formatDate(profile.updated_at)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            {!supportsOAuth && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4" /> {t('settings.sections.connection')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                    {t('settings.connection.hiddenHint')}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {capabilities.supportsSegments && activeTab === 'segments' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-4 w-4" /> {t('settings.localClimbs.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                {t('settings.localClimbs.hint')}
              </p>
              <div className="space-y-0">
                {renderToggleField(
                  t('settings.localClimbs.includeImported'),
                  'local_segments_include_imported',
                  true,
                  t('settings.localClimbs.descriptions.includeImported'),
                  'local_climbs_include_imported'
                )}
                {hasStravaConnection && renderToggleField(
                  t('settings.localClimbs.includeStrava'),
                  'local_segments_include_strava',
                  false,
                  t('settings.localClimbs.descriptions.includeStrava'),
                  'local_climbs_include_strava'
                )}
                {renderToggleField(
                  t('settings.localClimbs.includeRide'),
                  'local_segments_include_ride',
                  true,
                  t('settings.localClimbs.descriptions.includeRide'),
                  'local_climbs_include_ride'
                )}
                {renderToggleField(
                  t('settings.localClimbs.includeRun'),
                  'local_segments_include_run',
                  true,
                  t('settings.localClimbs.descriptions.includeRun'),
                  'local_climbs_include_run'
                )}
              </div>
              <div className="pt-2">
                <p className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  {t('settings.localClimbs.namingHint')}
                </p>
                <div className="space-y-0 mt-2">
                  {renderToggleField(
                    t('settings.localClimbs.reverseGeocodeEnabled'),
                    'local_segments_reverse_geocode_enabled',
                    false,
                    t('settings.localClimbs.descriptions.reverseGeocodeEnabled'),
                    'local_climbs_reverse_geocode_enabled'
                  )}
                  {renderToggleField(
                    t('settings.localClimbs.virtualNamePreferred'),
                    'local_segments_virtual_name_preferred',
                    true,
                    t('settings.localClimbs.descriptions.virtualNamePreferred'),
                    'local_climbs_virtual_name_preferred'
                  )}
                  <div className="mt-2 rounded-lg border border-border/60 bg-muted/20">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-3 py-2 text-left"
                      onClick={() => setSegmentAdvancedOpen((prev) => !prev)}
                    >
                      <span className="text-sm font-semibold">{t('settings.localClimbs.advanced.title')}</span>
                      <span className="text-xs text-muted-foreground">
                        {segmentAdvancedOpen
                          ? t('settings.localClimbs.advanced.hide')
                          : t('settings.localClimbs.advanced.show')}
                      </span>
                    </button>
                    <p className="px-3 pb-2 text-xs text-muted-foreground">
                      {t('settings.localClimbs.advanced.hint')}
                    </p>
                    {segmentAdvancedOpen && (
                      <div className="space-y-0 border-t border-border/60 px-3 pb-1">
                        {renderField(
                          t('settings.localClimbs.reverseGeocodeUrl'),
                          'local_segments_reverse_geocode_url',
                          getSettingValue('local_segments_reverse_geocode_url', 'local_climbs_reverse_geocode_url'),
                          false,
                          undefined,
                          'https://nominatim.openstreetmap.org/reverse',
                          t('settings.localClimbs.descriptions.reverseGeocodeUrl')
                        )}
                        {renderField(
                          t('settings.localClimbs.reverseGeocodeLanguage'),
                          'local_segments_reverse_geocode_language',
                          getSettingValue('local_segments_reverse_geocode_language', 'local_climbs_reverse_geocode_language'),
                          false,
                          undefined,
                          'de,en',
                          t('settings.localClimbs.descriptions.reverseGeocodeLanguage')
                        )}
                        {renderField(
                          t('settings.localClimbs.reverseGeocodeUserAgent'),
                          'local_segments_reverse_geocode_user_agent',
                          getSettingValue('local_segments_reverse_geocode_user_agent', 'local_climbs_reverse_geocode_user_agent'),
                          false,
                          undefined,
                          'PWRX/1.0 (local-segments)',
                          t('settings.localClimbs.descriptions.reverseGeocodeUserAgent')
                        )}
                        {renderField(
                          t('settings.localClimbs.reverseGeocodeTimeoutMs'),
                          'local_segments_reverse_geocode_timeout_ms',
                          getSettingValue('local_segments_reverse_geocode_timeout_ms', 'local_climbs_reverse_geocode_timeout_ms'),
                          false,
                          'ms',
                          '2200',
                          t('settings.localClimbs.descriptions.reverseGeocodeTimeoutMs')
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="pt-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3 space-y-3">
                <div>
                  <div className="text-sm font-semibold">{t('settings.localClimbs.rename.title')}</div>
                  <p className="text-xs text-muted-foreground mt-1">{t('settings.localClimbs.rename.hint')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs text-muted-foreground" htmlFor="local-segments-rename-batch">
                    {t('settings.localClimbs.rename.batchSize')}
                  </label>
                  <input
                    id="local-segments-rename-batch"
                    type="number"
                    min={1}
                    max={2000}
                    step={1}
                    value={renameBatchSize}
                    onChange={(event) => setRenameBatchSize(event.target.value)}
                    className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
                  />
                  <Button
                    size="sm"
                    variant={renameIncludeManual ? 'default' : 'outline'}
                    disabled={renameLocalSegmentsMutation.isPending}
                    onClick={() => setRenameIncludeManual((prev) => !prev)}
                  >
                    {renameIncludeManual
                      ? t('settings.localClimbs.rename.includeManualOn')
                      : t('settings.localClimbs.rename.includeManualOff')}
                  </Button>
                  <Button
                    size="sm"
                    variant={renameManualNames ? 'default' : 'outline'}
                    disabled={renameLocalSegmentsMutation.isPending || !renameIncludeManual}
                    onClick={() => setRenameManualNames((prev) => !prev)}
                  >
                    {renameManualNames
                      ? t('settings.localClimbs.rename.renameManualNamesOn')
                      : t('settings.localClimbs.rename.renameManualNamesOff')}
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={renameLocalSegmentsMutation.isPending}
                  onClick={() => renameLocalSegmentsMutation.mutate()}
                >
                  {renameLocalSegmentsMutation.isPending
                    ? t('settings.localClimbs.rename.running')
                    : t('settings.localClimbs.rename.button')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flag className="h-4 w-4" /> {t('settings.localClimbs.jobs.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">
                {t('settings.localClimbs.jobs.subtitle')}
              </p>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="text-sm font-semibold">{t('settings.localClimbs.jobs.backfill.title')}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor="settings-segment-backfill-limit">
                    {t('settings.localClimbs.jobs.backfill.limit')}
                  </label>
                  <input
                    id="settings-segment-backfill-limit"
                    type="number"
                    min={1}
                    max={2000}
                    step={1}
                    value={segmentBackfillLimit}
                    onChange={(event) => setSegmentBackfillLimit(event.target.value)}
                    className="h-8 w-24 rounded-md border border-border bg-background px-2 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={segmentBackfillMutation.isPending}
                    onClick={() => triggerSegmentBackfill('single')}
                  >
                    {segmentBackfillMutation.isPending
                      ? t('settings.localClimbs.jobs.backfill.running')
                      : t('settings.localClimbs.jobs.backfill.button')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={segmentBackfillMutation.isPending}
                    onClick={() => triggerSegmentBackfill('full')}
                  >
                    {segmentBackfillMutation.isPending
                      ? t('settings.localClimbs.jobs.backfill.runningAll')
                      : t('settings.localClimbs.jobs.backfill.buttonAll')}
                  </Button>
                </div>
                {segmentBackfillResult && (
                  <div className="text-xs text-muted-foreground rounded border border-border/60 bg-background/50 p-2 space-y-1">
                    {segmentBackfillResult.matchedActivities !== undefined && (
                      <div>{t('settings.localClimbs.jobs.backfill.result.matched', { value: segmentBackfillResult.matchedActivities })}</div>
                    )}
                    <div>{t('settings.localClimbs.jobs.backfill.result.processed', { value: segmentBackfillResult.processedActivities })}</div>
                    <div>{t('settings.localClimbs.jobs.backfill.result.persisted', { value: segmentBackfillResult.persistedClimbs })}</div>
                    {segmentBackfillResult.warning && <div>{segmentBackfillResult.warning}</div>}
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="text-sm font-semibold">{t('settings.localClimbs.jobs.rebuild.title')}</div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-xs text-muted-foreground" htmlFor="settings-segment-rebuild-activity-id">
                    {t('settings.localClimbs.jobs.rebuild.activityId')}
                  </label>
                  <input
                    id="settings-segment-rebuild-activity-id"
                    type="number"
                    value={segmentRebuildActivityId}
                    onChange={(event) => setSegmentRebuildActivityId(event.target.value)}
                    className="h-8 w-32 rounded-md border border-border bg-background px-2 text-sm"
                    placeholder="12345"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={segmentRebuildMutation.isPending}
                    onClick={triggerSegmentRebuild}
                  >
                    {segmentRebuildMutation.isPending
                      ? t('settings.localClimbs.jobs.rebuild.running')
                      : t('settings.localClimbs.jobs.rebuild.button')}
                  </Button>
                </div>
                {segmentRebuildResult && (
                  <div className="text-xs text-muted-foreground rounded border border-border/60 bg-background/50 p-2 space-y-1">
                    <div>{t('settings.localClimbs.jobs.rebuild.result.activityId', { value: segmentRebuildResult.activityId })}</div>
                    <div>{t('settings.localClimbs.jobs.rebuild.result.detected', { value: segmentRebuildResult.detected })}</div>
                    <div>{t('settings.localClimbs.jobs.rebuild.result.persisted', { value: segmentRebuildResult.persisted })}</div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-3">
                <div className="text-sm font-semibold">{t('settings.localClimbs.jobs.repairSportTypes.title')}</div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.localClimbs.jobs.repairSportTypes.hint')}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={repairLegacySportTypesMutation.isPending}
                    onClick={() => repairLegacySportTypesMutation.mutate()}
                  >
                    {repairLegacySportTypesMutation.isPending
                      ? t('settings.localClimbs.jobs.repairSportTypes.running')
                      : t('settings.localClimbs.jobs.repairSportTypes.button')}
                  </Button>
                </div>
                {repairLegacySportTypesResult && (
                  <div className="text-xs text-muted-foreground rounded border border-border/60 bg-background/50 p-2 space-y-1">
                    <div>{t('settings.localClimbs.jobs.repairSportTypes.result.scanned', { value: repairLegacySportTypesResult.scanned })}</div>
                    <div>{t('settings.localClimbs.jobs.repairSportTypes.result.updated', { value: repairLegacySportTypesResult.updated })}</div>
                    {repairLegacySportTypesResult.items.length > 0 && (
                      <div>{t('settings.localClimbs.jobs.repairSportTypes.result.sample', { value: repairLegacySportTypesResult.items.length })}</div>
                    )}
                    {repairLegacySportTypesResult.truncated && (
                      <div>{t('settings.localClimbs.jobs.repairSportTypes.result.truncated')}</div>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {supportsFiles && activeTab === 'import' && (
        <ImportPage mode="full" />
      )}

      {supportsSync && activeTab === 'sync' && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4" /> {t('settings.sync.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-xs text-muted-foreground rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                {t('settings.sync.scheduleHint')}
              </div>
              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5 border-b last:border-0">
                  <div className="flex-1 pr-4">
                    <label className="text-sm font-medium">{t('settings.sync.activityEnabled')}</label>
                  </div>
                  <Button
                    size="sm"
                    variant={syncEnabled ? 'default' : 'outline'}
                    disabled={bulkSettingMutation.isPending}
                    onClick={() => setAutoSyncEnabled(!syncEnabled)}
                  >
                    {syncEnabled ? t('settings.sync.enabled') : t('settings.sync.disabled')}
                  </Button>
                </div>
                {renderTimeField(t('settings.sync.activityCron'), 'sync_daily_time', syncDailyTime, '03:00')}
                {renderToggleField(t('settings.sync.onStartup'), 'sync_on_startup', true, t('settings.sync.onStartupHint'))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4" /> {t('settings.sync.manual.title')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-xs text-muted-foreground">{t('settings.sync.manual.subtitle')}</p>
              {isSyncRunning && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-200">
                  {t('settings.sync.manual.alreadyRunning')}
                </div>
              )}
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-2">
                <div className="text-sm font-semibold">{t('settings.sync.manual.activityTitle')}</div>
                <p className="text-xs text-muted-foreground">{t('settings.sync.manual.activityDesc')}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => manualSyncMutation.mutate()}
                  disabled={isSyncBusy}
                >
                  {manualSyncMutation.isPending
                    ? t('settings.sync.manual.activityRunning')
                    : isSyncRunning
                      ? t('settings.sync.manual.running')
                      : t('settings.sync.manual.activityButton')}
                </Button>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                <span className="text-foreground font-medium">{t('settings.syncStatus.lastRun')}</span>{' '}
                {lastSyncLog
                  ? `${formatDateTime(lastSyncLog.started_at)} · ${t(`settings.syncStatus.status.${lastSyncLog.status}`)} · ${lastSyncLog.items_processed || 0}`
                  : t('settings.syncStatus.never')}
                {lastSyncLog?.error_message && (
                  <div className="mt-1 text-muted-foreground">{renderSyncSummary(lastSyncLog.error_message)}</div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {supportsSync && activeTab === 'logs' && (
        <div className="space-y-6">
          {/* Sync Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Check className="h-4 w-4" /> {t('settings.syncStatus.title')}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t('settings.syncStatus.subtitle')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {(() => {
                if (!tech) {
                  return <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
                }

                const totalActivities = tech.activities.total || 0
                const activitiesWithoutGps = tech.activities.without_gps || 0
                const activitiesWithPhotos = tech.activities.with_photos || 0

                const streamsPending = tech.data_gaps.activities_needing_streams || 0
                const streamsNotEligible = Math.max(activitiesWithoutGps, 0)
                const streamsSynced = Math.max(totalActivities - streamsPending - streamsNotEligible, 0)

                const segmentsPending = tech.data_gaps.activities_needing_segments || 0
                const segmentsSynced = Math.max(tech.segments.activities_with_segments || 0, 0)
                const segmentsNotEligible = Math.max(totalActivities - segmentsSynced - segmentsPending, 0)

                const photosPending = tech.data_gaps.activities_needing_photo_sync || 0
                const photosSynced = Math.max(activitiesWithPhotos - photosPending, 0)
                const photosNotEligible = Math.max(totalActivities - activitiesWithPhotos, 0)

                const downloadTotal = tech.photos.total || 0
                const downloadsPending = tech.photos.pending || 0
                const downloadsSynced = Math.max(downloadTotal - downloadsPending, 0)
                const downloadsUnknown = Math.max(downloadTotal - downloadsSynced - downloadsPending, 0)

                const lastSync = lastSyncLog

                return (
                  <div className="space-y-5">
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground font-medium">{t('settings.syncStatus.lastRun')}</span>{' '}
                      {lastSync
                        ? `${formatDateTime(lastSync.started_at)} · ${t(`settings.syncStatus.status.${lastSync.status}`)} · ${lastSync.items_processed || 0}`
                        : t('settings.syncStatus.never')}
                    </div>
                    <div className="space-y-6">
                      {renderProgressBar(t('settings.syncStatus.bars.activities'), totalActivities, [
                        { label: t('settings.syncStatus.legend.synced'), value: totalActivities, color: 'bg-green-500 text-white' }
                      ])}
                      {renderProgressBar(t('settings.syncStatus.bars.streams'), totalActivities, [
                        { label: t('settings.syncStatus.legend.synced'), value: streamsSynced, color: 'bg-green-500 text-white' },
                        { label: t('settings.syncStatus.legend.pending'), value: streamsPending, color: 'bg-yellow-400 text-yellow-950' },
                        { label: t('settings.syncStatus.legend.notEligible'), value: streamsNotEligible, color: 'bg-muted text-muted-foreground' }
                      ])}
                      {renderProgressBar(t('settings.syncStatus.bars.segments'), totalActivities, [
                        { label: t('settings.syncStatus.legend.synced'), value: segmentsSynced, color: 'bg-green-500 text-white' },
                        { label: t('settings.syncStatus.legend.pending'), value: segmentsPending, color: 'bg-yellow-400 text-yellow-950' },
                        { label: t('settings.syncStatus.legend.notEligible'), value: segmentsNotEligible, color: 'bg-muted text-muted-foreground' }
                      ])}
                      {renderProgressBar(t('settings.syncStatus.bars.photos'), totalActivities, [
                        { label: t('settings.syncStatus.legend.synced'), value: photosSynced, color: 'bg-green-500 text-white' },
                        { label: t('settings.syncStatus.legend.pending'), value: photosPending, color: 'bg-yellow-400 text-yellow-950' },
                        { label: t('settings.syncStatus.legend.notEligible'), value: photosNotEligible, color: 'bg-muted text-muted-foreground' }
                      ])}
                      {renderProgressBar(t('settings.syncStatus.bars.downloads'), downloadTotal, [
                        { label: t('settings.syncStatus.legend.synced'), value: downloadsSynced, color: 'bg-green-500 text-white' },
                        { label: t('settings.syncStatus.legend.pending'), value: downloadsPending, color: 'bg-yellow-400 text-yellow-950' },
                        { label: t('settings.syncStatus.legend.unknown'), value: downloadsUnknown, color: 'bg-muted text-muted-foreground' }
                      ])}
                    </div>
                    {syncLogs.length === 0 ? (
                      <div className="text-xs text-muted-foreground">{t('settings.syncStatus.empty')}</div>
                    ) : (
                      <div className="space-y-1 text-xs">
                        <div className="text-[11px] text-muted-foreground">
                          {t('settings.syncStatus.tableHint')}
                        </div>
                        <div className="flex gap-2 text-muted-foreground border-b border-border pb-1 mb-2">
                          <span className="w-36">{t('settings.syncStatus.table.started')}</span>
                          <span className="w-16">{t('settings.syncStatus.table.status')}</span>
                          <span className="w-16 text-right">{t('settings.syncStatus.table.items')}</span>
                          <span className="flex-1">{t('settings.syncStatus.table.details')}</span>
                        </div>
                        {syncLogs.map((log: SyncLog) => (
                          <div key={log.id} className="flex gap-2 items-start">
                            <span className="text-muted-foreground w-36">{formatDateTime(log.started_at)}</span>
                            <span className={`w-16 ${log.status === 'completed' ? 'text-green-500' : log.status === 'failed' ? 'text-red-400' : 'text-blue-400'}`}>
                              {t(`settings.syncStatus.status.${log.status}`)}
                            </span>
                            <span className="w-16 text-right text-foreground">
                              {log.items_processed || 0}
                            </span>
                            <span className="flex-1 text-muted-foreground break-words">
                              {renderSyncDetails(log.error_message)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'system' && (
        <div className="space-y-6">
          {!tech ? (
            <div className="text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : (
            (() => {
              const totalActivities = tech.activities.total || 0
              const withGps = tech.activities.with_gps || 0
              const withoutGps = tech.activities.without_gps || 0
              const gpsPct = totalActivities > 0 ? Math.round((withGps / totalActivities) * 100) : 0
              const noGpsPct = totalActivities > 0 ? Math.round((withoutGps / totalActivities) * 100) : 0
              const pendingMigrations = tech.migrations?.pending_count || 0
              const migrationLabel = pendingMigrations > 0
                ? t('tech.migrations.pending', { count: pendingMigrations })
                : t('tech.migrations.ok')
              const migrationTone = pendingMigrations > 0 ? 'text-yellow-400' : 'text-green-400'

              return (
                <>
                  <div className="text-xs text-muted-foreground">
                    {t('tech.lastUpdated', { value: formatDateTime(tech.timestamp) })}
                  </div>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Monitor className="h-4 w-4" /> {t('tech.sections.system')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.node'), tech.system.node_version)}
                        {renderSystemLine(t('tech.labels.platform'), `${tech.system.platform} (${tech.system.arch})`)}
                        {renderSystemLine(t('tech.labels.uptime'), tech.system.uptime_formatted)}
                        {renderSystemLine(t('tech.labels.pid'), String(tech.system.pid))}
                        {renderSystemLine(t('tech.labels.heap'), `${tech.system.memory.heap_used_mb}MB / ${tech.system.memory.heap_total_mb}MB`)}
                        {renderSystemLine(t('tech.labels.rss'), `${tech.system.memory.rss_mb}MB`)}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="h-4 w-4" /> {t('tech.sections.database')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.dbEngine'), tech.database.version.split(',')[0])}
                        {renderSystemLine(t('tech.labels.dbSize'), tech.database.size)}
                        {renderSystemLine(t('tech.labels.migrations'), migrationLabel, migrationTone)}
                        <div className="mt-2 text-xs text-muted-foreground">{t('tech.labels.tables')}:</div>
                        <div className="mt-2 space-y-1">
                          {tech.database.tables.map((table: any) => (
                            <div key={table.table_name} className="flex items-center justify-between text-xs">
                              <span className="text-foreground">{table.table_name}</span>
                              <span className="text-muted-foreground">{table.total_size}</span>
                            </div>
                          ))}
                        </div>
                        {pendingMigrations > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            {t('tech.migrations.runHint')}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="h-4 w-4" /> {t('tech.sections.activities')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.total'), totalActivities.toLocaleString(), 'text-cyan-400 font-semibold')}
                        {renderSystemLine(t('tech.labels.withGps'), `${withGps.toLocaleString()} (${gpsPct}%)`, 'text-green-400')}
                        {renderSystemLine(t('tech.labels.withoutGps'), `${withoutGps.toLocaleString()} (${noGpsPct}%)`, withoutGps > 0 ? 'text-yellow-400' : 'text-muted-foreground')}
                        {renderSystemLine(t('tech.labels.withPhotos'), tech.activities.with_photos.toLocaleString())}
                        <div className="mt-2 border-t border-border pt-2">
                          {renderSystemLine(t('tech.labels.firstActivity'), tech.activities.first_activity ? formatDateTime(tech.activities.first_activity) : t('common.notAvailable'))}
                          {renderSystemLine(t('tech.labels.lastActivity'), tech.activities.last_activity ? formatDateTime(tech.activities.last_activity) : t('common.notAvailable'))}
                          {renderSystemLine(t('tech.labels.lastSync'), tech.activities.last_sync ? formatDateTime(tech.activities.last_sync) : t('common.notAvailable'))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Flag className="h-4 w-4" /> {t('tech.sections.segments')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.totalSegments'), tech.segments.total_segments.toLocaleString(), 'text-cyan-400 font-semibold')}
                        {renderSystemLine(t('tech.labels.totalEfforts'), tech.segments.total_efforts.toLocaleString())}
                        {renderSystemLine(t('tech.labels.activitiesWithSegments'), tech.segments.activities_with_segments.toLocaleString(), tech.segments.activities_with_segments > 0 ? 'text-green-400' : 'text-muted-foreground')}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Map className="h-4 w-4" /> {t('tech.sections.gps')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.totalRecords'), tech.streams.total_records.toLocaleString())}
                        {renderSystemLine(t('tech.labels.dataPoints'), tech.streams.total_data_points?.toLocaleString() || t('common.notAvailable'), 'text-cyan-400')}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Image className="h-4 w-4" /> {t('tech.sections.photos')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.labels.activitiesWithPhotos'), t('tech.photos.activitiesWithPhotos', { count: tech.activities.with_photos }))}
                        {renderSystemLine(t('tech.labels.photosSynced'), t('tech.photos.photosSynced', { count: tech.photos.activities_with_photos_synced }), tech.photos.activities_with_photos_synced > 0 ? 'text-green-400' : 'text-muted-foreground')}
                        {renderSystemLine(t('tech.labels.photosTotal'), tech.photos.total.toLocaleString())}
                        {renderSystemLine(t('tech.labels.photosDownloaded'), tech.photos.downloaded.toLocaleString(), 'text-green-400')}
                        {renderSystemLine(t('tech.labels.photosPending'), tech.photos.pending.toLocaleString(), tech.photos.pending > 0 ? 'text-yellow-400' : 'text-muted-foreground')}
                        {renderSystemLine(t('tech.labels.photosLocal'), tech.photos.local_files.toLocaleString())}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4" /> {t('tech.sections.activityTypes')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          {tech.activity_types.map((type: any) => (
                            <div key={type.type} className="flex gap-2">
                              <span className="text-cyan-400">{type.type}:</span>
                              <span className="text-foreground">{Number(type.count).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Layers className="h-4 w-4" /> {t('tech.sections.stack')}
                      </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {renderSystemLine(t('tech.stack.backend'), tech.tech_stack.backend)}
                        {renderSystemLine(t('tech.stack.frontend'), tech.tech_stack.frontend)}
                        {renderSystemLine(t('tech.stack.database'), tech.tech_stack.database)}
                        {renderSystemLine(t('tech.stack.charts'), tech.tech_stack.charts)}
                        {renderSystemLine(t('tech.stack.maps'), tech.tech_stack.maps)}
                        {renderSystemLine(t('tech.stack.api'), tech.tech_stack.api_client)}
                        {renderSystemLine(t('tech.stack.container'), tech.tech_stack.container)}
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="h-4 w-4" /> {t('tech.sections.yearly')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-xs space-y-1">
                        <div className="flex gap-2 text-muted-foreground border-b border-border pb-1">
                          <span className="w-12">{t('tech.yearly.year')}</span>
                          <span className="w-16 text-right">{t('tech.yearly.acts')}</span>
                          <span className="w-20 text-right">{t('tech.yearly.distance')}</span>
                          <span className="w-20 text-right">{t('tech.yearly.streams')}</span>
                          <span className="w-16 text-right">{t('tech.yearly.power')}</span>
                          <span className="flex-1">{t('tech.yearly.coverage')}</span>
                        </div>
                        {tech.yearly_stats.map((year: any) => {
                          const activities = Number(year.activities) || 0
                          const withStreams = Number(year.with_streams) || 0
                          const withPower = Number(year.with_power_streams) || 0
                          const streamPct = activities > 0 ? Math.round((withStreams / activities) * 100) : 0
                          const powerPct = activities > 0 ? Math.round((withPower / activities) * 100) : 0
                          return (
                            <div key={year.year} className="flex gap-2 items-center">
                              <span className="text-yellow-400 w-12">{year.year}</span>
                              <span className="text-foreground w-16 text-right">{activities.toLocaleString()}</span>
                              <span className="text-cyan-400 w-20 text-right">{Number(year.total_km).toLocaleString()} {t('records.units.km')}</span>
                              <span className={`w-20 text-right ${streamPct === 100 ? 'text-green-400' : streamPct > 0 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                {withStreams}/{activities}
                              </span>
                              <span className={`w-16 text-right ${powerPct > 80 ? 'text-green-400' : powerPct > 0 ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                                {withPower > 0 ? withPower : '-'}
                              </span>
                              <div className="flex-1 h-3 bg-muted-foreground/20 rounded overflow-hidden flex">
                                <div
                                  className="h-full bg-green-500 transition-all duration-500"
                                  style={{ width: `${streamPct}%` }}
                                  title={t('tech.yearly.streamCoverage', { value: streamPct })}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="mt-2 text-[10px] text-muted-foreground">
                        {t('tech.yearly.legend')}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4" /> {t('tech.sections.gaps')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1 text-xs">
                      {tech.data_gaps.activities_needing_photo_sync > 0 ? (
                        <div className="text-yellow-400">
                          <span className="text-red-400">!</span> {t('tech.gaps.photosSync', { count: tech.data_gaps.activities_needing_photo_sync })}
                          <span className="text-muted-foreground ml-2">({t('tech.gaps.photosSyncHint')})</span>
                        </div>
                      ) : (
                        <div className="text-green-400">
                          <span className="text-green-500">✓</span> {t('tech.gaps.photosSyncOk')}
                        </div>
                      )}
                      {tech.data_gaps.photos_needing_download > 0 ? (
                        <div className="text-yellow-400">
                          <span className="text-red-400">!</span> {t('tech.gaps.photosDownload', { count: tech.data_gaps.photos_needing_download })}
                          <span className="text-muted-foreground ml-2">({t('tech.gaps.photosDownloadHint')})</span>
                        </div>
                      ) : (
                        <div className="text-green-400">
                          <span className="text-green-500">✓</span> {t('tech.gaps.photosDownloadOk')}
                        </div>
                      )}
                      {tech.data_gaps.activities_needing_streams > 0 ? (
                        <div className="text-yellow-400">
                          <span className="text-red-400">!</span> {t('tech.gaps.streamsSync', { count: tech.data_gaps.activities_needing_streams })}
                          <span className="text-muted-foreground ml-2">({t('tech.gaps.streamsSyncHint')})</span>
                        </div>
                      ) : (
                        <div className="text-green-400">
                          <span className="text-green-500">✓</span> {t('tech.gaps.streamsSyncOk')}
                        </div>
                      )}
                      {tech.data_gaps.activities_needing_segments > 0 ? (
                        <div className="text-yellow-400">
                          <span className="text-red-400">!</span> {t('tech.gaps.segmentsSync', { count: tech.data_gaps.activities_needing_segments })}
                          <span className="text-muted-foreground ml-2">({t('tech.gaps.segmentsSyncHint')})</span>
                        </div>
                      ) : (
                        <div className="text-green-400">
                          <span className="text-green-500">✓</span> {t('tech.gaps.segmentsSyncOk')}
                        </div>
                      )}
                      {tech.data_gaps.activities_with_estimated_power > 0 && (
                        <div className="text-muted-foreground">
                          <span className="opacity-50">i</span> {t('tech.gaps.estimatedPower', { count: tech.data_gaps.activities_with_estimated_power })}
                          <span className="text-muted-foreground ml-2">({t('tech.gaps.estimatedPowerHint')})</span>
                        </div>
                      )}
                      {tech.activities.without_gps > 0 && (
                        <div className="text-muted-foreground mt-2">
                          <span className="opacity-50">i</span> {t('tech.gaps.noGps', { count: tech.activities.without_gps })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </>
              )
            })()
          )}
        </div>
      )}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </div>
  )
}
