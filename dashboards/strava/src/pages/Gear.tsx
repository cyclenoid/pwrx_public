import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createManualGear, getGear, getGearById, getGearMaintenance, updateGearMaintenance } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { formatNumber } from '../lib/formatters'
import type { Gear as GearType, GearMaintenanceItem } from '../types/activity'
import { useTranslation } from 'react-i18next'

// Icon for gear types
function GearIcon({ type, className = '' }: { type?: string; className?: string }) {
  const normalized = (type || '').toLowerCase()
  if (normalized.includes('bike')) {
    return (
      <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="15" cy="5" r="1"/>
        <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
      </svg>
    )
  }
  // Default shoes icon
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z"/>
      <path d="M21 12v2a2 2 0 0 1-2 2H7.5"/>
      <path d="M3 8V6a2 2 0 0 1 2-2h3a2 2 0 0 0 2-2"/>
      <path d="M7.5 16h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8"/>
    </svg>
  )
}

// Stat card component
function StatCard({ label, value, unit, icon }: { label: string; value: string | number; unit?: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-4 text-center">
      {icon && <div className="flex justify-center mb-2 text-muted-foreground">{icon}</div>}
      <p className="text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </p>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
    </div>
  )
}

const getGearDistanceKm = (gear: GearType) => {
  if (gear.gear_total_distance_km !== undefined && gear.gear_total_distance_km !== null) {
    return Number(gear.gear_total_distance_km) || 0
  }
  if (gear.total_distance_km !== undefined && gear.total_distance_km !== null) {
    return Number(gear.total_distance_km) || 0
  }
  if (gear.distance) {
    return Number(gear.distance) / 1000
  }
  return 0
}

const getUsedKm = (currentKm: number, lastResetKm?: number | null) => {
  const resetKm = Number(lastResetKm || 0)
  return Math.max(currentKm - resetKm, 0)
}

const getStatusColor = (usedKm: number, targetKm: number) => {
  if (!targetKm || targetKm <= 0) return 'bg-muted'
  if (usedKm >= targetKm) return 'bg-red-500'
  if (usedKm >= targetKm * 0.9) return 'bg-amber-400'
  return 'bg-emerald-500'
}

const resolveGearSource = (gear: GearType): 'manual' | 'synced' => {
  const raw = String(gear.source || '').toLowerCase()
  if (raw === 'manual' || raw === 'synced') return raw
  const id = String(gear.id || '').toLowerCase()
  if (id.startsWith('mb_') || id.startsWith('mg_')) return 'manual'
  return 'synced'
}

const primaryActionButtonClass =
  'px-4 py-2 rounded-md border border-primary/40 bg-background text-primary text-sm font-medium transition-colors hover:bg-primary/10 disabled:opacity-60'

function MaintenanceBar({ usedKm, targetKm }: { usedKm: number; targetKm: number }) {
  const percent = targetKm > 0 ? Math.min((usedKm / targetKm) * 100, 100) : 0
  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div
        className={`h-full ${getStatusColor(usedKm, targetKm)}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}

// Gear card component
function GearCard({
  gear,
  maintenanceItems,
  onClick
}: {
  gear: GearType
  maintenanceItems: GearMaintenanceItem[]
  onClick: () => void
}) {
  const { t } = useTranslation()
  const distanceKm = Number(gear.total_distance_km || gear.gear_total_distance_km || 0)
  const activityCount = Number(gear.activity_count || 0)
  const hours = Number(gear.total_hours || 0)
  const gearType = resolveGearType(gear.type, gear.id)
  const gearSource = resolveGearSource(gear)
  const currentKm = getGearDistanceKm(gear)

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/30 ${gear.retired ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${gearType === 'bike' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
            <GearIcon type={gear.type} className="w-8 h-8" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg truncate">{gear.name}</h3>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full border border-border text-muted-foreground">
                {gearSource === 'manual' ? t('gear.source.manual') : t('gear.source.synced')}
              </span>
              {gear.retired && (
                <span className="px-2 py-0.5 text-xs bg-secondary rounded-full text-muted-foreground">
                  {t('gear.status.retired')}
                </span>
              )}
            </div>
            {(gear.brand_name || gear.model_name) && (
              <p className="text-sm text-muted-foreground">
                {[gear.brand_name, gear.model_name].filter(Boolean).join(' ')}
              </p>
            )}
            {gear.description && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{gear.description}</p>
            )}

            <div className="flex flex-wrap gap-4 mt-4 text-sm">
              <div>
                <span className="font-semibold">{formatNumber(distanceKm, 0)}</span>
                <span className="text-muted-foreground ml-1">{t('records.units.km')}</span>
              </div>
              <div>
                <span className="font-semibold">{activityCount}</span>
                <span className="text-muted-foreground ml-1">{t('gear.stats.activities')}</span>
              </div>
              {hours > 0 && (
                <div>
                  <span className="font-semibold">{formatNumber(hours, 1)}</span>
                  <span className="text-muted-foreground ml-1">{t('gear.stats.hours')}</span>
                </div>
              )}
            </div>

            <div className="mt-5 space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {t('gear.maintenance.title')}
              </div>
              {maintenanceItems.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('gear.maintenance.empty')}
                </div>
              ) : (
                <div className="space-y-3">
                  {maintenanceItems.slice(0, 3).map((item) => {
                    const targetKm = Number(item.target_km || 0)
                    const usedKm = getUsedKm(currentKm, item.last_reset_km)
                    const remainingKm = targetKm > 0 ? targetKm - usedKm : 0
                    const statusLabel = targetKm > 0
                      ? (remainingKm <= 0
                        ? t('gear.maintenance.status.over', { km: formatNumber(Math.abs(remainingKm), 0) })
                        : t('gear.maintenance.status.left', { km: formatNumber(remainingKm, 0) }))
                      : t('gear.maintenance.status.unset')
                    return (
                      <div key={item.component_key} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-muted-foreground">
                            {formatNumber(usedKm, 0)} / {formatNumber(targetKm, 0)} {t('records.units.km')}
                          </span>
                        </div>
                        <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                        <div className="text-[11px] text-muted-foreground">{statusLabel}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const resolveGearType = (type?: string, id?: string) => {
  const normalized = (type || '').toLowerCase()
  if (normalized.includes('bike')) return 'bike'
  if (normalized.includes('shoe')) return 'shoes'

  const idValue = (id || '').toLowerCase()
  if (idValue.startsWith('b')) return 'bike'
  if (idValue.startsWith('g')) return 'shoes'

  return normalized || 'shoes'
}

// Detail modal/panel for gear
function GearDetail({ gearId, onClose }: { gearId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [maintenanceItems, setMaintenanceItems] = useState<GearMaintenanceItem[]>([])
  const [newComponentLabel, setNewComponentLabel] = useState('')
  const [newComponentTarget, setNewComponentTarget] = useState('')
  const { data, isLoading } = useQuery({
    queryKey: ['gear', gearId],
    queryFn: () => getGearById(gearId),
  })

  useEffect(() => {
    const maintenance = (data as any)?.maintenance || []
    setMaintenanceItems(maintenance)
  }, [data])

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
        <Card className="w-full max-w-2xl mx-4">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{t('common.loading')}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const gear = (data as any).gear
  const gearType = resolveGearType(gear?.type, gear?.id)
  const gearSource = resolveGearSource(gear)
  const currentKm = getGearDistanceKm(gear)
  const activityCount = Number(gear?.activity_count || 0)

  const saveMaintenance = async (items: GearMaintenanceItem[]) => {
    const response = await updateGearMaintenance(gearId, items.map((item) => ({
      ...item,
      gear_id: gearId,
      component_key: item.component_key || '',
      target_km: Number(item.target_km || 0),
      last_reset_km: Number(item.last_reset_km || 0),
      last_reset_at: item.last_reset_at || null,
    })))
    setMaintenanceItems(response.items || [])
    queryClient.invalidateQueries({ queryKey: ['gear-maintenance'] })
  }

  const updateItem = (index: number, patch: Partial<GearMaintenanceItem>) => {
    setMaintenanceItems((prev) => prev.map((item, idx) => idx === index ? { ...item, ...patch } : item))
  }

  const removeItem = async (index: number) => {
    const next = maintenanceItems.filter((_, idx) => idx !== index)
    await saveMaintenance(next)
  }

  const resetItem = async (index: number) => {
    const next = maintenanceItems.map((item, idx) => {
      if (idx !== index) return item
      return {
        ...item,
        last_reset_km: currentKm,
        last_reset_at: new Date().toISOString(),
      }
    })
    await saveMaintenance(next)
  }

  const addComponent = async (label: string, targetKm: number) => {
    const next: GearMaintenanceItem[] = [
      ...maintenanceItems,
      {
        gear_id: gearId,
        component_key: '',
        label: label.trim(),
        target_km: targetKm,
        last_reset_km: 0,
        last_reset_at: null,
      }
    ]
    await saveMaintenance(next)
  }

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-3xl max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${gearType === 'bike' ? 'bg-blue-500/10 text-blue-500' : 'bg-green-500/10 text-green-500'}`}>
              <GearIcon type={gear.type} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{gear.name}</CardTitle>
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full border border-border text-muted-foreground">
                  {gearSource === 'manual' ? t('gear.source.manual') : t('gear.source.synced')}
                </span>
              </div>
              {(gear.brand_name || gear.model_name) && (
                <p className="text-sm text-muted-foreground">
                  {[gear.brand_name, gear.model_name].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-full transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </CardHeader>

        <CardContent className="space-y-6 overflow-y-auto max-h-[calc(90vh-100px)]">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <StatCard
              label={t('gear.stats.totalDistance')}
              value={formatNumber(currentKm, 0)}
              unit={t('records.units.km')}
            />
            <StatCard
              label={t('gear.stats.activities')}
              value={activityCount}
            />
            <StatCard
              label={t('gear.stats.status')}
              value={gear.retired ? t('gear.status.retired') : t('gear.status.active')}
            />
          </div>

          {gear.description && (
            <div className="p-4 bg-secondary/30 rounded-lg">
              <p className="text-sm">{gear.description}</p>
            </div>
          )}

          {/* Wear tracker */}
          <div className="space-y-3">
            <div>
              <h4 className="font-medium">{t('gear.maintenance.title')}</h4>
              <p className="text-sm text-muted-foreground">{t('gear.maintenance.subtitle')}</p>
            </div>

            {gearType === 'shoes' ? (
              <div className="space-y-3">
                {maintenanceItems.length === 0 ? (
                  <div className="flex flex-col gap-3 border border-dashed border-border/60 rounded-lg p-4">
                    <div className="text-sm text-muted-foreground">
                      {t('gear.maintenance.shoeSetup')}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="number"
                        min="0"
                        placeholder={t('gear.maintenance.limitPlaceholder')}
                        value={newComponentTarget}
                        onChange={(event) => setNewComponentTarget(event.target.value)}
                        className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                      />
                      <button
                        onClick={() => {
                          addComponent(t('gear.maintenance.shoeLabel'), Number(newComponentTarget || 0))
                          setNewComponentTarget('')
                        }}
                        className={primaryActionButtonClass}
                      >
                        {t('gear.maintenance.enable')}
                      </button>
                    </div>
                  </div>
                ) : (
                  maintenanceItems.map((item, index) => {
                    const targetKm = Number(item.target_km || 0)
                    const usedKm = getUsedKm(currentKm, item.last_reset_km)
                    const remainingKm = targetKm > 0 ? targetKm - usedKm : 0
                    const statusLabel = targetKm > 0
                      ? (remainingKm <= 0
                        ? t('gear.maintenance.status.over', { km: formatNumber(Math.abs(remainingKm), 0) })
                        : t('gear.maintenance.status.left', { km: formatNumber(remainingKm, 0) }))
                      : t('gear.maintenance.status.unset')
                    return (
                      <div key={item.component_key} className="border border-border/60 rounded-lg p-4 space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="font-medium">{item.label}</div>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <span>{formatNumber(usedKm, 0)} {t('records.units.km')}</span>
                            <span>/</span>
                            <span>{formatNumber(targetKm, 0)} {t('records.units.km')}</span>
                          </div>
                        </div>
                        <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            value={targetKm}
                            onChange={(event) => updateItem(index, { target_km: Number(event.target.value || 0) })}
                            className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                          />
                          <button
                            onClick={() => saveMaintenance(maintenanceItems)}
                            className="px-3 py-2 rounded-md bg-secondary text-sm hover:bg-secondary/80"
                          >
                            {t('gear.maintenance.save')}
                          </button>
                          <button
                            onClick={() => resetItem(index)}
                            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-secondary/60"
                          >
                            {t('gear.maintenance.reset')}
                          </button>
                          <span className="text-xs text-muted-foreground">{statusLabel}</span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {maintenanceItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    {t('gear.maintenance.bikeEmpty')}
                  </div>
                ) : (
                  maintenanceItems.map((item, index) => {
                    const targetKm = Number(item.target_km || 0)
                    const usedKm = getUsedKm(currentKm, item.last_reset_km)
                    const remainingKm = targetKm > 0 ? targetKm - usedKm : 0
                    const statusLabel = targetKm > 0
                      ? (remainingKm <= 0
                        ? t('gear.maintenance.status.over', { km: formatNumber(Math.abs(remainingKm), 0) })
                        : t('gear.maintenance.status.left', { km: formatNumber(remainingKm, 0) }))
                      : t('gear.maintenance.status.unset')
                    return (
                      <div key={item.component_key} className="border border-border/60 rounded-lg p-4 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto_auto] gap-2 items-center">
                          <input
                            type="text"
                            value={item.label}
                            onChange={(event) => updateItem(index, { label: event.target.value })}
                            className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                          />
                          <input
                            type="number"
                            min="0"
                            value={targetKm}
                            onChange={(event) => updateItem(index, { target_km: Number(event.target.value || 0) })}
                            className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                          />
                          <button
                            onClick={() => resetItem(index)}
                            className="px-3 py-2 rounded-md border border-border text-sm hover:bg-secondary/60"
                          >
                            {t('gear.maintenance.reset')}
                          </button>
                          <button
                            onClick={() => removeItem(index)}
                            className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
                          >
                            {t('gear.maintenance.delete')}
                          </button>
                        </div>
                        <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatNumber(usedKm, 0)} {t('records.units.km')}</span>
                          <span>{statusLabel}</span>
                        </div>
                      </div>
                    )
                  })
                )}

                <div className="border border-dashed border-border/60 rounded-lg p-4 space-y-2">
                  <div className="text-sm font-medium">{t('gear.maintenance.addTitle')}</div>
                  <div className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      placeholder={t('gear.maintenance.componentPlaceholder')}
                      value={newComponentLabel}
                      onChange={(event) => setNewComponentLabel(event.target.value)}
                      className="px-3 py-2 rounded-md bg-background border border-border text-sm min-w-[180px]"
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder={t('gear.maintenance.limitPlaceholder')}
                      value={newComponentTarget}
                      onChange={(event) => setNewComponentTarget(event.target.value)}
                      className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                    />
                    <button
                      onClick={() => {
                        if (!newComponentLabel.trim()) return
                        addComponent(newComponentLabel, Number(newComponentTarget || 0))
                        setNewComponentLabel('')
                        setNewComponentTarget('')
                      }}
                      className={primaryActionButtonClass}
                    >
                      {t('gear.maintenance.add')}
                    </button>
                  </div>
                  <button
                    onClick={() => saveMaintenance(maintenanceItems)}
                    className="px-3 py-2 rounded-md bg-secondary text-sm hover:bg-secondary/80"
                  >
                    {t('gear.maintenance.save')}
                  </button>
                </div>
              </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

export function Gear() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedGearId, setSelectedGearId] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [manualGearForm, setManualGearForm] = useState({
    name: '',
    type: 'bike' as 'bike' | 'shoes',
    brandName: '',
    modelName: '',
    distanceKm: '',
    description: '',
    retired: false,
  })

  const { data: gearList, isLoading, isError, refetch } = useQuery({
    queryKey: ['gear'],
    queryFn: getGear,
  })

  const { data: maintenanceList = [] } = useQuery({
    queryKey: ['gear-maintenance'],
    queryFn: getGearMaintenance,
  })

  const createManualGearMutation = useMutation({
    mutationFn: async () => {
      const name = manualGearForm.name.trim()
      if (!name) {
        throw new Error('NAME_REQUIRED')
      }

      const parsedDistance = Number(manualGearForm.distanceKm || 0)
      const distanceKm = Number.isFinite(parsedDistance) ? parsedDistance : 0
      if (distanceKm < 0) {
        throw new Error('DISTANCE_NEGATIVE')
      }

      return createManualGear({
        name,
        type: manualGearForm.type,
        brandName: manualGearForm.brandName.trim() || undefined,
        modelName: manualGearForm.modelName.trim() || undefined,
        description: manualGearForm.description.trim() || undefined,
        distanceKm,
        retired: manualGearForm.retired,
      })
    },
    onSuccess: async () => {
      setFormError(null)
      setManualGearForm({
        name: '',
        type: 'bike',
        brandName: '',
        modelName: '',
        distanceKm: '',
        description: '',
        retired: false,
      })
      await queryClient.invalidateQueries({ queryKey: ['gear'] })
    },
    onError: (error: any) => {
      const message = error?.message || ''
      if (message === 'NAME_REQUIRED') {
        setFormError(t('gear.manualCreate.validation.nameRequired'))
        return
      }
      if (message === 'DISTANCE_NEGATIVE') {
        setFormError(t('gear.manualCreate.validation.distanceNonNegative'))
        return
      }
      setFormError(error?.response?.data?.error || t('gear.manualCreate.error'))
    },
  })

  const maintenanceByGearId = useMemo(() => {
    const map = new Map<string, GearMaintenanceItem[]>()
    maintenanceList.forEach((item) => {
      const items = map.get(item.gear_id) || []
      items.push(item)
      map.set(item.gear_id, items)
    })
    return map
  }, [maintenanceList])

  const activeGear = (gearList || []).filter(g => !g.retired)
  const retiredGear = (gearList || []).filter(g => g.retired)

  // Stats
  const totalBikes = (gearList || []).filter(g => resolveGearType(g.type, g.id) === 'bike').length
  const totalShoes = (gearList || []).filter(g => resolveGearType(g.type, g.id) === 'shoes').length
  const totalDistance = (gearList || []).reduce((sum, g) => sum + getGearDistanceKm(g), 0)
  const totalActivities = (gearList || []).reduce((sum, g) => sum + Number(g.activity_count || 0), 0)

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">{t('gear.error')}</p>
        <button
          onClick={() => refetch()}
          className={primaryActionButtonClass}
        >
          {t('error.retry')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('gear.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('gear.subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('gear.manualCreate.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={manualGearForm.name}
              onChange={(event) => setManualGearForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t('gear.manualCreate.fields.name')}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
            />
            <select
              value={manualGearForm.type}
              onChange={(event) => {
                const nextType = event.target.value === 'shoes' ? 'shoes' : 'bike'
                setManualGearForm((prev) => ({ ...prev, type: nextType }))
              }}
              className="px-3 py-2 rounded-md bg-background border border-border text-foreground text-sm"
              style={{ color: 'hsl(var(--foreground))', backgroundColor: 'hsl(var(--popover))' }}
            >
              <option value="bike" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>
                {t('gear.manualCreate.types.bike')}
              </option>
              <option value="shoes" style={{ backgroundColor: 'hsl(var(--popover))', color: 'hsl(var(--popover-foreground))' }}>
                {t('gear.manualCreate.types.shoes')}
              </option>
            </select>
            <input
              type="text"
              value={manualGearForm.brandName}
              onChange={(event) => setManualGearForm((prev) => ({ ...prev, brandName: event.target.value }))}
              placeholder={t('gear.manualCreate.fields.brand')}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
            />
            <input
              type="text"
              value={manualGearForm.modelName}
              onChange={(event) => setManualGearForm((prev) => ({ ...prev, modelName: event.target.value }))}
              placeholder={t('gear.manualCreate.fields.model')}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
            />
            <input
              type="number"
              min={0}
              value={manualGearForm.distanceKm}
              onChange={(event) => setManualGearForm((prev) => ({ ...prev, distanceKm: event.target.value }))}
              placeholder={t('gear.manualCreate.fields.startDistanceKm')}
              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground px-1">
              <input
                type="checkbox"
                checked={manualGearForm.retired}
                onChange={(event) => setManualGearForm((prev) => ({ ...prev, retired: event.target.checked }))}
              />
              {t('gear.manualCreate.fields.retired')}
            </label>
          </div>
          <textarea
            value={manualGearForm.description}
            onChange={(event) => setManualGearForm((prev) => ({ ...prev, description: event.target.value }))}
            placeholder={t('gear.manualCreate.fields.description')}
            rows={3}
            className="w-full px-3 py-2 rounded-md bg-background border border-border text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={createManualGearMutation.isPending}
              onClick={() => createManualGearMutation.mutate()}
              className={primaryActionButtonClass}
            >
              {createManualGearMutation.isPending
                ? t('gear.manualCreate.creating')
                : t('gear.manualCreate.submit')}
            </button>
            {formError && <span className="text-sm text-red-500">{formError}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label={t('gear.stats.bikes')}
          value={totalBikes}
          icon={<GearIcon type="bike" className="w-5 h-5" />}
        />
        <StatCard
          label={t('gear.stats.shoes')}
          value={totalShoes}
          icon={<GearIcon type="shoes" className="w-5 h-5" />}
        />
        <StatCard
          label={t('gear.stats.totalDistance')}
          value={formatNumber(totalDistance, 0)}
          unit={t('records.units.km')}
        />
        <StatCard
          label={t('gear.stats.activities')}
          value={totalActivities}
        />
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-secondary rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-secondary rounded w-1/2" />
                    <div className="h-4 bg-secondary rounded w-1/3" />
                    <div className="h-4 bg-secondary rounded w-2/3 mt-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (gearList || []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{t('gear.empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Active Gear */}
          {activeGear.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{t('gear.active', { count: activeGear.length })}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeGear.map((gear) => (
                  <GearCard
                    key={gear.id}
                    gear={gear}
                    maintenanceItems={maintenanceByGearId.get(gear.id) || []}
                    onClick={() => setSelectedGearId(gear.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Retired Gear */}
          {retiredGear.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-muted-foreground">{t('gear.retired', { count: retiredGear.length })}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {retiredGear.map((gear) => (
                  <GearCard
                    key={gear.id}
                    gear={gear}
                    maintenanceItems={maintenanceByGearId.get(gear.id) || []}
                    onClick={() => setSelectedGearId(gear.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Detail Modal */}
      {selectedGearId && (
        <GearDetail gearId={selectedGearId} onClose={() => setSelectedGearId(null)} />
      )}
    </div>
  )
}
