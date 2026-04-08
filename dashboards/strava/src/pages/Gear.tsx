import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createManualGear,
  getGear,
  getGearById,
  getGearMaintenance,
  updateGearMaintenance,
} from "../lib/api";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { formatNumber } from "../lib/formatters";
import type {
  Gear as GearType,
  GearDetailResponse,
  GearMaintenanceItem,
} from "../types/activity";
import { useTranslation } from "react-i18next";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

// Icon for gear types
function GearIcon({
  type,
  className = "",
}: {
  type?: string;
  className?: string;
}) {
  const normalized = (type || "").toLowerCase();
  if (normalized.includes("bike")) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="18.5" cy="17.5" r="3.5" />
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="15" cy="5" r="1" />
        <path d="M12 17.5V14l-3-3 4-3 2 3h2" />
      </svg>
    );
  }
  // Default shoes icon
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 11h3a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z" />
      <path d="M21 12v2a2 2 0 0 1-2 2H7.5" />
      <path d="M3 8V6a2 2 0 0 1 2-2h3a2 2 0 0 0 2-2" />
      <path d="M7.5 16h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2H8" />
    </svg>
  );
}

// Stat card component
function StatCard({
  label,
  value,
  unit,
  icon,
}: {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-secondary/35 p-3 text-center">
      {icon && (
        <div className="mb-1.5 flex justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-xl font-bold leading-none">
        {value}
        {unit && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            {unit}
          </span>
        )}
      </p>
      <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function RankingCard({
  title,
  rows,
  unit,
  decimals = 0,
}: {
  title: string;
  rows: Array<{ id: string; name: string; value: number }>;
  unit?: string;
  decimals?: number;
}) {
  const topValue = rows[0]?.value || 0;

  const getRankBadgeClass = (rank: number) => {
    if (rank === 0) return "border-amber-400/50 bg-amber-400/15 text-amber-300";
    if (rank === 1) return "border-slate-300/50 bg-slate-300/10 text-slate-200";
    if (rank === 2)
      return "border-orange-500/50 bg-orange-500/10 text-orange-300";
    return "border-border/60 bg-background/70 text-muted-foreground";
  };

  return (
    <Card className="overflow-hidden border-primary/15">
      <CardHeader className="border-b border-border/50 bg-gradient-to-r from-primary/12 via-primary/5 to-transparent pb-3">
        <CardTitle className="text-sm font-semibold tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length > 0 ? (
          rows.map((row, index) => (
            <div
              key={row.id}
              className="rounded-xl border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:border-primary/25 hover:bg-primary/5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${getRankBadgeClass(index)}`}
                  >
                    #{index + 1}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {row.name}
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-secondary/80">
                      <div
                        className="h-1.5 rounded-full bg-gradient-to-r from-primary to-orange-400"
                        style={{
                          width: `${topValue > 0 ? Math.max((row.value / topValue) * 100, 8) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-primary">
                    {formatNumber(row.value, decimals)}
                    {unit ? ` ${unit}` : ""}
                  </div>
                  {topValue > 0 && (
                    <div className="text-[11px] text-muted-foreground">
                      {formatNumber((row.value / topValue) * 100, 0)}%
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">--</div>
        )}
      </CardContent>
    </Card>
  );
}

const getGearDistanceKm = (gear: GearType) => {
  if (
    gear.gear_total_distance_km !== undefined &&
    gear.gear_total_distance_km !== null
  ) {
    return Number(gear.gear_total_distance_km) || 0;
  }
  if (gear.total_distance_km !== undefined && gear.total_distance_km !== null) {
    return Number(gear.total_distance_km) || 0;
  }
  if (gear.distance) {
    return Number(gear.distance) / 1000;
  }
  return 0;
};

const formatMonthLabel = (month: string, locale: string) => {
  const [year, monthPart] = String(month).split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(monthPart);
  if (!parsedYear || !parsedMonth) return month;
  try {
    return new Intl.DateTimeFormat(locale, { month: "short" }).format(
      new Date(parsedYear, parsedMonth - 1, 1),
    );
  } catch {
    return month;
  }
};

const getUsedKm = (currentKm: number, lastResetKm?: number | null) => {
  const resetKm = Number(lastResetKm || 0);
  return Math.max(currentKm - resetKm, 0);
};

const getStatusColor = (usedKm: number, targetKm: number) => {
  if (!targetKm || targetKm <= 0) return "bg-muted";
  if (usedKm >= targetKm) return "bg-red-500";
  if (usedKm >= targetKm * 0.9) return "bg-amber-400";
  return "bg-emerald-500";
};

const resolveGearSource = (gear: GearType): "manual" | "synced" => {
  const raw = String(gear.source || "").toLowerCase();
  if (raw === "manual" || raw === "synced") return raw;
  const id = String(gear.id || "").toLowerCase();
  if (id.startsWith("mb_") || id.startsWith("mg_")) return "manual";
  return "synced";
};

const primaryActionButtonClass =
  "px-4 py-2 rounded-md border border-primary/40 bg-background text-primary text-sm font-medium transition-colors hover:bg-primary/10 disabled:opacity-60";

const GEAR_TREND_RANGE_OPTIONS = [
  { key: "all", months: null },
  { key: "2y", months: 24 },
  { key: "1y", months: 12 },
  { key: "6m", months: 6 },
  { key: "3m", months: 3 },
] as const;

function MaintenanceBar({
  usedKm,
  targetKm,
}: {
  usedKm: number;
  targetKm: number;
}) {
  const percent = targetKm > 0 ? Math.min((usedKm / targetKm) * 100, 100) : 0;
  return (
    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
      <div
        className={`h-full ${getStatusColor(usedKm, targetKm)}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

// Gear card component
function GearCard({
  gear,
  maintenanceItems,
  onClick,
}: {
  gear: GearType;
  maintenanceItems: GearMaintenanceItem[];
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const distanceKm = Number(
    gear.total_distance_km || gear.gear_total_distance_km || 0,
  );
  const activityCount = Number(gear.activity_count || 0);
  const hours = Number(gear.total_hours || 0);
  const gearType = resolveGearType(gear.type, gear.id);
  const gearSource = resolveGearSource(gear);
  const currentKm = getGearDistanceKm(gear);

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg hover:border-primary/30 ${gear.retired ? "opacity-60" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className={`rounded-full p-2.5 ${gearType === "bike" ? "bg-blue-500/10 text-blue-500" : "bg-green-500/10 text-green-500"}`}
          >
            <GearIcon type={gear.type} className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold">{gear.name}</h3>
              <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full border border-border text-muted-foreground">
                {gearSource === "manual"
                  ? t("gear.source.manual")
                  : t("gear.source.synced")}
              </span>
              {gear.retired && (
                <span className="px-2 py-0.5 text-xs bg-secondary rounded-full text-muted-foreground">
                  {t("gear.status.retired")}
                </span>
              )}
            </div>
            {(gear.brand_name || gear.model_name) && (
              <p className="text-sm text-muted-foreground">
                {[gear.brand_name, gear.model_name].filter(Boolean).join(" ")}
              </p>
            )}
            {gear.description && (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {gear.description}
              </p>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <div className="rounded-lg border border-border/50 bg-secondary/25 px-2.5 py-2">
                <div className="font-semibold">
                  {formatNumber(distanceKm, 0)}
                </div>
                <div className="text-muted-foreground">
                  {t("records.units.km")}
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-secondary/25 px-2.5 py-2">
                <div className="font-semibold">{activityCount}</div>
                <div className="text-muted-foreground">
                  {t("gear.stats.activities")}
                </div>
              </div>
              {hours > 0 && (
                <div className="rounded-lg border border-border/50 bg-secondary/25 px-2.5 py-2">
                  <div className="font-semibold">{formatNumber(hours, 1)}</div>
                  <div className="text-muted-foreground">
                    {t("gear.stats.hours")}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 space-y-2">
              <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                {t("gear.maintenance.title")}
              </div>
              {maintenanceItems.length === 0 ? (
                <div className="text-[11px] text-muted-foreground">
                  {t("gear.maintenance.empty")}
                </div>
              ) : (
                <div className="space-y-2">
                  {maintenanceItems.slice(0, 2).map((item) => {
                    const targetKm = Number(item.target_km || 0);
                    const usedKm = getUsedKm(currentKm, item.last_reset_km);
                    const remainingKm = targetKm > 0 ? targetKm - usedKm : 0;
                    const statusLabel =
                      targetKm > 0
                        ? remainingKm <= 0
                          ? t("gear.maintenance.status.over", {
                              km: formatNumber(Math.abs(remainingKm), 0),
                            })
                          : t("gear.maintenance.status.left", {
                              km: formatNumber(remainingKm, 0),
                            })
                        : t("gear.maintenance.status.unset");
                    return (
                      <div key={item.component_key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="font-medium">{item.label}</span>
                          <span className="text-muted-foreground">
                            {formatNumber(usedKm, 0)} /{" "}
                            {formatNumber(targetKm, 0)} {t("records.units.km")}
                          </span>
                        </div>
                        <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                        <div className="text-[10px] text-muted-foreground">
                          {statusLabel}
                        </div>
                      </div>
                    );
                  })}
                  {maintenanceItems.length > 2 && (
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      +{maintenanceItems.length - 2}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const resolveGearType = (type?: string, id?: string) => {
  const normalized = (type || "").toLowerCase();
  if (normalized.includes("bike")) return "bike";
  if (normalized.includes("shoe")) return "shoes";

  const idValue = (id || "").toLowerCase();
  if (idValue.startsWith("b")) return "bike";
  if (idValue.startsWith("g")) return "shoes";

  return normalized || "shoes";
};

// Detail page for gear
function GearDetail({ gearId }: { gearId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedTrendRange, setSelectedTrendRange] =
    useState<(typeof GEAR_TREND_RANGE_OPTIONS)[number]["key"]>("1y");
  const [maintenanceItems, setMaintenanceItems] = useState<
    GearMaintenanceItem[]
  >([]);
  const [newComponentLabel, setNewComponentLabel] = useState("");
  const [newComponentTarget, setNewComponentTarget] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["gear", gearId],
    queryFn: () => getGearById(gearId),
  });

  useEffect(() => {
    const maintenance = data?.maintenance || [];
    setMaintenanceItems(maintenance);
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => navigate("/gear")}
          className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          {t("gear.detail.back")}
        </button>
        <Card className="bg-background shadow-2xl">
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">{t("common.loading")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const detailData = data as GearDetailResponse;
  const gear = detailData.gear;
  const gearType = resolveGearType(gear?.type, gear?.id);
  const gearSource = resolveGearSource(gear);
  const currentKm = getGearDistanceKm(gear);
  const activityCount = Number(gear?.activity_count || 0);
  const totalElevation = Number(gear?.total_elevation_m || 0);
  const avgSpeed = Number(gear?.avg_speed_kmh || 0);
  const totalHours = Number(gear?.total_hours || 0);
  const hmPerKm = currentKm > 0 ? totalElevation / currentKm : 0;
  const locale = i18n.language?.startsWith("de") ? "de-DE" : "en-US";
  const monthlyStats = detailData.monthly_stats || [];
  const recentActivities = detailData.recent_activities || [];
  const yearTrend = monthlyStats.map((item) => ({
    month: item.month,
    monthLabel: formatMonthLabel(item.month, locale),
    distanceKm: Number(item.total_distance_km || 0),
    elevationM: Number(item.total_elevation_m || 0),
    activityCount: Number(item.activity_count || 0),
  }));
  const lastRide = recentActivities[0]?.start_date;
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
  const selectedTrendOption = GEAR_TREND_RANGE_OPTIONS.find(
    (option) => option.key === selectedTrendRange,
  );
  const filteredTrend =
    !selectedTrendOption || selectedTrendOption.months === null
      ? yearTrend
      : yearTrend.length <= selectedTrendOption.months
        ? yearTrend
        : yearTrend.slice(-selectedTrendOption.months);
  const filteredActiveMonths = filteredTrend.filter(
    (month) => month.activityCount > 0,
  ).length;
  const filteredPeakDistance =
    filteredTrend.length > 0
      ? Math.max(...filteredTrend.map((month) => month.distanceKm))
      : 0;

  const saveMaintenance = async (items: GearMaintenanceItem[]) => {
    const response = await updateGearMaintenance(
      gearId,
      items.map((item) => ({
        ...item,
        gear_id: gearId,
        component_key: item.component_key || "",
        target_km: Number(item.target_km || 0),
        last_reset_km: Number(item.last_reset_km || 0),
        last_reset_at: item.last_reset_at || null,
      })),
    );
    setMaintenanceItems(response.items || []);
    queryClient.invalidateQueries({ queryKey: ["gear-maintenance"] });
  };

  const updateItem = (index: number, patch: Partial<GearMaintenanceItem>) => {
    setMaintenanceItems((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, ...patch } : item)),
    );
  };

  const removeItem = async (index: number) => {
    const next = maintenanceItems.filter((_, idx) => idx !== index);
    await saveMaintenance(next);
  };

  const resetItem = async (index: number) => {
    const next = maintenanceItems.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        last_reset_km: currentKm,
        last_reset_at: new Date().toISOString(),
      };
    });
    await saveMaintenance(next);
  };

  const addComponent = async (label: string, targetKm: number) => {
    const next: GearMaintenanceItem[] = [
      ...maintenanceItems,
      {
        gear_id: gearId,
        component_key: "",
        label: label.trim(),
        target_km: targetKm,
        last_reset_km: 0,
        last_reset_at: null,
      },
    ];
    await saveMaintenance(next);
  };

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => navigate("/gear")}
        className="inline-flex items-center gap-2 rounded-md border border-border/70 bg-background px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary/60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        {t("gear.detail.back")}
      </button>

      <Card className="overflow-hidden border-border/70 bg-card text-foreground shadow-sm">
        <CardHeader className="flex flex-row items-start justify-between space-y-0 border-b border-border/70 bg-card pb-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-full ${gearType === "bike" ? "bg-blue-500/10 text-blue-500" : "bg-green-500/10 text-green-500"}`}
            >
              <GearIcon type={gear.type} className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-xl">{gear.name}</CardTitle>
                <span className="px-2 py-0.5 text-[10px] uppercase tracking-wide rounded-full border border-border text-muted-foreground">
                  {gearSource === "manual"
                    ? t("gear.source.manual")
                    : t("gear.source.synced")}
                </span>
              </div>
              {(gear.brand_name || gear.model_name) && (
                <p className="text-sm text-muted-foreground">
                  {[gear.brand_name, gear.model_name].filter(Boolean).join(" ")}
                </p>
              )}
            </div>
          </div>
          <div className="hidden text-right text-xs text-muted-foreground lg:block">
            <div>{t("gear.detail.lastRide")}</div>
            <div className="mt-1 text-sm font-medium text-foreground">
              {lastRide ? dateFormatter.format(new Date(lastRide)) : "--"}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 bg-card pt-6">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard
              label={t("gear.stats.totalDistance")}
              value={formatNumber(currentKm, 0)}
              unit={t("records.units.km")}
            />
            <StatCard
              label={t("gear.stats.activities")}
              value={activityCount}
            />
            <StatCard
              label={t("gear.stats.totalElevation")}
              value={formatNumber(totalElevation, 0)}
              unit={t("activityDetail.units.m")}
            />
            <StatCard
              label={t("gear.stats.avgSpeed")}
              value={avgSpeed > 0 ? formatNumber(avgSpeed, 1) : "--"}
              unit={avgSpeed > 0 ? t("activityDetail.units.kmh") : undefined}
            />
            <StatCard
              label={t("gear.stats.hmPerKm")}
              value={hmPerKm > 0 ? formatNumber(hmPerKm, 1) : "--"}
              unit={hmPerKm > 0 ? "HM/km" : undefined}
            />
          </div>

          {gear.description && (
            <div className="rounded-lg border border-border/60 bg-neutral-900 p-4">
              <p className="text-sm">{gear.description}</p>
            </div>
          )}

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_360px] xl:items-start">
            <div className="space-y-6">
              <Card className="border-border/60 bg-neutral-900">
                <CardHeader className="gap-3 pb-2">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {t("gear.detail.yearTrendTitle")}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {t("gear.detail.yearTrendSubtitle")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {GEAR_TREND_RANGE_OPTIONS.map((option) => {
                        const isActive = selectedTrendRange === option.key;
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setSelectedTrendRange(option.key)}
                            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                              isActive
                                ? "border-primary/50 bg-primary/15 text-primary"
                                : "border-border/60 bg-background/60 text-muted-foreground hover:bg-secondary/60"
                            }`}
                          >
                            {t(`gear.detail.rangeOptions.${option.key}`)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard
                      label={t("gear.stats.hours")}
                      value={formatNumber(totalHours, 1)}
                    />
                    <StatCard
                      label={t("gear.stats.status")}
                      value={
                        gear.retired
                          ? t("gear.status.retired")
                          : t("gear.status.active")
                      }
                    />
                    <StatCard
                      label={t("gear.detail.recentActivities")}
                      value={recentActivities.length}
                    />
                    <StatCard
                      label={t("gear.detail.activeMonths")}
                      value={filteredActiveMonths}
                    />
                  </div>
                  {filteredTrend.length > 0 ? (
                    <div className="h-[360px] xl:h-[420px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={filteredTrend}
                          margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient
                              id="gearDistanceFill"
                              x1="0"
                              y1="0"
                              x2="0"
                              y2="1"
                            >
                              <stop
                                offset="5%"
                                stopColor="hsl(var(--primary))"
                                stopOpacity={0.35}
                              />
                              <stop
                                offset="95%"
                                stopColor="hsl(var(--primary))"
                                stopOpacity={0.03}
                              />
                            </linearGradient>
                          </defs>
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="hsl(var(--border))"
                            opacity={0.35}
                          />
                          <XAxis
                            dataKey="monthLabel"
                            tick={{
                              fontSize: 11,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                            tickLine={false}
                            axisLine={false}
                            minTickGap={20}
                          />
                          <YAxis
                            yAxisId="distance"
                            tick={{
                              fontSize: 11,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                            tickLine={false}
                            axisLine={false}
                            width={38}
                          />
                          <YAxis
                            yAxisId="elevation"
                            orientation="right"
                            tick={{
                              fontSize: 11,
                              fill: "hsl(var(--muted-foreground))",
                            }}
                            tickLine={false}
                            axisLine={false}
                            width={44}
                          />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (!active || !payload || payload.length === 0)
                                return null;
                              const row = payload[0].payload as {
                                month: string;
                                distanceKm: number;
                                elevationM: number;
                                activityCount: number;
                              };
                              return (
                                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-foreground shadow-lg">
                                  <div className="font-semibold">
                                    {row.month}
                                  </div>
                                  <div className="text-muted-foreground">{`${formatNumber(row.distanceKm, 1)} ${t("records.units.km")} · ${formatNumber(row.elevationM, 0)} ${t("activityDetail.units.m")}`}</div>
                                  <div className="text-muted-foreground">
                                    {t("gear.stats.activities")}:{" "}
                                    {row.activityCount}
                                  </div>
                                </div>
                              );
                            }}
                          />
                          <Area
                            yAxisId="distance"
                            type="monotone"
                            dataKey="distanceKm"
                            stroke="hsl(var(--primary))"
                            fill="url(#gearDistanceFill)"
                            strokeWidth={2.5}
                          />
                          <Line
                            yAxisId="elevation"
                            type="monotone"
                            dataKey="elevationM"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={{ r: 2.5, fill: "#f59e0b" }}
                            activeDot={{ r: 4 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-6 text-sm text-muted-foreground">
                      {t("gear.detail.historyEmpty")}
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <StatCard
                      label={t("gear.detail.rangeLabel")}
                      value={t(
                        `gear.detail.rangeOptions.${selectedTrendRange}`,
                      )}
                    />
                    <StatCard
                      label={t("gear.detail.monthlyPeak")}
                      value={formatNumber(filteredPeakDistance, 0)}
                      unit={t("records.units.km")}
                    />
                    <StatCard
                      label={t("gear.detail.activeMonths")}
                      value={filteredActiveMonths}
                    />
                    <StatCard
                      label={t("gear.detail.historyRange")}
                      value={
                        filteredTrend.length > 0
                          ? `${filteredTrend[0]?.month} - ${filteredTrend[filteredTrend.length - 1]?.month}`
                          : "--"
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60 bg-neutral-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {t("gear.detail.recentTitle")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {recentActivities.length > 0 ? (
                    recentActivities.map((activity) => (
                      <Link
                        key={activity.strava_activity_id}
                        to={`/activity/${activity.strava_activity_id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-neutral-950 px-3 py-2 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {activity.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {dateFormatter.format(
                              new Date(activity.start_date),
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-muted-foreground">
                          <div>
                            {formatNumber(Number(activity.distance_km || 0), 1)}{" "}
                            {t("records.units.km")}
                          </div>
                          <div>
                            {formatNumber(
                              Number(activity.total_elevation_gain || 0),
                              0,
                            )}{" "}
                            {t("activityDetail.units.m")}
                          </div>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      {t("gear.detail.recentEmpty")}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Wear tracker */}
            <div className="space-y-3 rounded-xl border border-border/60 bg-neutral-900 p-4 xl:sticky xl:top-24">
              <div>
                <h4 className="font-medium">{t("gear.maintenance.title")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("gear.maintenance.subtitle")}
                </p>
              </div>

              {gearType === "shoes" ? (
                <div className="space-y-3">
                  {maintenanceItems.length === 0 ? (
                    <div className="flex flex-col gap-3 border border-dashed border-border/60 rounded-lg p-4">
                      <div className="text-sm text-muted-foreground">
                        {t("gear.maintenance.shoeSetup")}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="number"
                          min="0"
                          placeholder={t("gear.maintenance.limitPlaceholder")}
                          value={newComponentTarget}
                          onChange={(event) =>
                            setNewComponentTarget(event.target.value)
                          }
                          className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                        />
                        <button
                          onClick={() => {
                            addComponent(
                              t("gear.maintenance.shoeLabel"),
                              Number(newComponentTarget || 0),
                            );
                            setNewComponentTarget("");
                          }}
                          className={primaryActionButtonClass}
                        >
                          {t("gear.maintenance.enable")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    maintenanceItems.map((item, index) => {
                      const targetKm = Number(item.target_km || 0);
                      const usedKm = getUsedKm(currentKm, item.last_reset_km);
                      const remainingKm = targetKm > 0 ? targetKm - usedKm : 0;
                      const statusLabel =
                        targetKm > 0
                          ? remainingKm <= 0
                            ? t("gear.maintenance.status.over", {
                                km: formatNumber(Math.abs(remainingKm), 0),
                              })
                            : t("gear.maintenance.status.left", {
                                km: formatNumber(remainingKm, 0),
                              })
                          : t("gear.maintenance.status.unset");
                      return (
                        <div
                          key={item.component_key}
                          className="rounded-lg border border-border/60 bg-neutral-900 p-4 space-y-2"
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="font-medium">{item.label}</div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>
                                {formatNumber(usedKm, 0)}{" "}
                                {t("records.units.km")}
                              </span>
                              <span>/</span>
                              <span>
                                {formatNumber(targetKm, 0)}{" "}
                                {t("records.units.km")}
                              </span>
                            </div>
                          </div>
                          <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              value={targetKm}
                              onChange={(event) =>
                                updateItem(index, {
                                  target_km: Number(event.target.value || 0),
                                })
                              }
                              className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                            />
                            <button
                              onClick={() => saveMaintenance(maintenanceItems)}
                              className="px-3 py-2 rounded-md bg-secondary text-sm hover:bg-secondary/80"
                            >
                              {t("gear.maintenance.save")}
                            </button>
                            <button
                              onClick={() => resetItem(index)}
                              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-secondary/60"
                            >
                              {t("gear.maintenance.reset")}
                            </button>
                            <span className="text-xs text-muted-foreground">
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {maintenanceItems.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      {t("gear.maintenance.bikeEmpty")}
                    </div>
                  ) : (
                    maintenanceItems.map((item, index) => {
                      const targetKm = Number(item.target_km || 0);
                      const usedKm = getUsedKm(currentKm, item.last_reset_km);
                      const remainingKm = targetKm > 0 ? targetKm - usedKm : 0;
                      const statusLabel =
                        targetKm > 0
                          ? remainingKm <= 0
                            ? t("gear.maintenance.status.over", {
                                km: formatNumber(Math.abs(remainingKm), 0),
                              })
                            : t("gear.maintenance.status.left", {
                                km: formatNumber(remainingKm, 0),
                              })
                          : t("gear.maintenance.status.unset");
                      return (
                        <div
                          key={item.component_key}
                          className="rounded-lg border border-border/60 bg-neutral-900 p-4 space-y-3"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px_auto_auto] gap-2 items-center">
                            <input
                              type="text"
                              value={item.label}
                              onChange={(event) =>
                                updateItem(index, { label: event.target.value })
                              }
                              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                            />
                            <input
                              type="number"
                              min="0"
                              value={targetKm}
                              onChange={(event) =>
                                updateItem(index, {
                                  target_km: Number(event.target.value || 0),
                                })
                              }
                              className="px-3 py-2 rounded-md bg-background border border-border text-sm"
                            />
                            <button
                              onClick={() => resetItem(index)}
                              className="px-3 py-2 rounded-md border border-border text-sm hover:bg-secondary/60"
                            >
                              {t("gear.maintenance.reset")}
                            </button>
                            <button
                              onClick={() => removeItem(index)}
                              className="px-3 py-2 rounded-md text-sm text-destructive hover:bg-destructive/10"
                            >
                              {t("gear.maintenance.delete")}
                            </button>
                          </div>
                          <MaintenanceBar usedKm={usedKm} targetKm={targetKm} />
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {formatNumber(usedKm, 0)} {t("records.units.km")}
                            </span>
                            <span>{statusLabel}</span>
                          </div>
                        </div>
                      );
                    })
                  )}

                  <div className="rounded-lg border border-dashed border-border/60 bg-neutral-900 p-4 space-y-2">
                    <div className="text-sm font-medium">
                      {t("gear.maintenance.addTitle")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <input
                        type="text"
                        placeholder={t("gear.maintenance.componentPlaceholder")}
                        value={newComponentLabel}
                        onChange={(event) =>
                          setNewComponentLabel(event.target.value)
                        }
                        className="px-3 py-2 rounded-md bg-background border border-border text-sm min-w-[180px]"
                      />
                      <input
                        type="number"
                        min="0"
                        placeholder={t("gear.maintenance.limitPlaceholder")}
                        value={newComponentTarget}
                        onChange={(event) =>
                          setNewComponentTarget(event.target.value)
                        }
                        className="px-3 py-2 rounded-md bg-background border border-border text-sm w-40"
                      />
                      <button
                        onClick={() => {
                          if (!newComponentLabel.trim()) return;
                          addComponent(
                            newComponentLabel,
                            Number(newComponentTarget || 0),
                          );
                          setNewComponentLabel("");
                          setNewComponentTarget("");
                        }}
                        className={primaryActionButtonClass}
                      >
                        {t("gear.maintenance.add")}
                      </button>
                    </div>
                    <button
                      onClick={() => saveMaintenance(maintenanceItems)}
                      className="px-3 py-2 rounded-md bg-secondary text-sm hover:bg-secondary/80"
                    >
                      {t("gear.maintenance.save")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function Gear() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: selectedGearId } = useParams<{ id?: string }>();
  const queryClient = useQueryClient();
  const [isCreateGearOpen, setIsCreateGearOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [manualGearForm, setManualGearForm] = useState({
    name: "",
    type: "bike" as "bike" | "shoes",
    brandName: "",
    modelName: "",
    distanceKm: "",
    description: "",
    retired: false,
  });

  const {
    data: gearList,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["gear"],
    queryFn: getGear,
  });

  const { data: maintenanceList = [] } = useQuery({
    queryKey: ["gear-maintenance"],
    queryFn: getGearMaintenance,
  });

  const createManualGearMutation = useMutation({
    mutationFn: async () => {
      const name = manualGearForm.name.trim();
      if (!name) {
        throw new Error("NAME_REQUIRED");
      }

      const parsedDistance = Number(manualGearForm.distanceKm || 0);
      const distanceKm = Number.isFinite(parsedDistance) ? parsedDistance : 0;
      if (distanceKm < 0) {
        throw new Error("DISTANCE_NEGATIVE");
      }

      return createManualGear({
        name,
        type: manualGearForm.type,
        brandName: manualGearForm.brandName.trim() || undefined,
        modelName: manualGearForm.modelName.trim() || undefined,
        description: manualGearForm.description.trim() || undefined,
        distanceKm,
        retired: manualGearForm.retired,
      });
    },
    onSuccess: async () => {
      setFormError(null);
      setIsCreateGearOpen(false);
      setManualGearForm({
        name: "",
        type: "bike",
        brandName: "",
        modelName: "",
        distanceKm: "",
        description: "",
        retired: false,
      });
      await queryClient.invalidateQueries({ queryKey: ["gear"] });
    },
    onError: (error: any) => {
      const message = error?.message || "";
      if (message === "NAME_REQUIRED") {
        setFormError(t("gear.manualCreate.validation.nameRequired"));
        return;
      }
      if (message === "DISTANCE_NEGATIVE") {
        setFormError(t("gear.manualCreate.validation.distanceNonNegative"));
        return;
      }
      setFormError(
        error?.response?.data?.error || t("gear.manualCreate.error"),
      );
    },
  });

  const maintenanceByGearId = useMemo(() => {
    const map = new Map<string, GearMaintenanceItem[]>();
    maintenanceList.forEach((item) => {
      const items = map.get(item.gear_id) || [];
      items.push(item);
      map.set(item.gear_id, items);
    });
    return map;
  }, [maintenanceList]);

  const activeGear = (gearList || []).filter((g) => !g.retired);
  const retiredGear = (gearList || []).filter((g) => g.retired);
  const bikeGear = (gearList || []).filter(
    (g) => resolveGearType(g.type, g.id) === "bike",
  );

  // Stats
  const topDistanceBikes = useMemo(
    () =>
      [...bikeGear]
        .sort((a, b) => getGearDistanceKm(b) - getGearDistanceKm(a))
        .map((gear) => ({
          id: gear.id,
          name: gear.name,
          value: getGearDistanceKm(gear),
        })),
    [bikeGear],
  );

  const topElevationBikes = useMemo(
    () =>
      [...bikeGear]
        .sort(
          (a, b) =>
            Number(b.total_elevation_m || 0) - Number(a.total_elevation_m || 0),
        )
        .map((gear) => ({
          id: gear.id,
          name: gear.name,
          value: Number(gear.total_elevation_m || 0),
        })),
    [bikeGear],
  );

  const topSpeedBikes = useMemo(
    () =>
      [...bikeGear]
        .filter((gear) => Number(gear.avg_speed_kmh || 0) > 0)
        .sort(
          (a, b) => Number(b.avg_speed_kmh || 0) - Number(a.avg_speed_kmh || 0),
        )
        .map((gear) => ({
          id: gear.id,
          name: gear.name,
          value: Number(gear.avg_speed_kmh || 0),
        })),
    [bikeGear],
  );

  const topHmPerKmBikes = useMemo(
    () =>
      [...bikeGear]
        .filter(
          (gear) =>
            getGearDistanceKm(gear) > 0 &&
            Number(gear.total_elevation_m || 0) > 0,
        )
        .sort(
          (a, b) =>
            Number(b.total_elevation_m || 0) / getGearDistanceKm(b) -
            Number(a.total_elevation_m || 0) / getGearDistanceKm(a),
        )
        .map((gear) => ({
          id: gear.id,
          name: gear.name,
          value: Number(gear.total_elevation_m || 0) / getGearDistanceKm(gear),
        })),
    [bikeGear],
  );

  if (selectedGearId) {
    return <GearDetail gearId={selectedGearId} />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p className="text-muted-foreground">{t("gear.error")}</p>
        <button onClick={() => refetch()} className={primaryActionButtonClass}>
          {t("error.retry")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("gear.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("gear.subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setIsCreateGearOpen(true);
          }}
          className={primaryActionButtonClass}
        >
          {t("gear.manualCreate.open")}
        </button>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
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
                <p className="text-muted-foreground">{t("gear.empty")}</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeGear.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold">
                    {t("gear.active", { count: activeGear.length })}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {activeGear.map((gear) => (
                      <GearCard
                        key={gear.id}
                        gear={gear}
                        maintenanceItems={
                          maintenanceByGearId.get(gear.id) || []
                        }
                        onClick={() => navigate(`/gear/${gear.id}`)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {retiredGear.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-muted-foreground">
                    {t("gear.retired", { count: retiredGear.length })}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {retiredGear.map((gear) => (
                      <GearCard
                        key={gear.id}
                        gear={gear}
                        maintenanceItems={
                          maintenanceByGearId.get(gear.id) || []
                        }
                        onClick={() => navigate(`/gear/${gear.id}`)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 self-start xl:sticky xl:top-24">
          <div className="space-y-1 px-1">
            <div className="text-sm font-semibold">
              {t("gear.sidebar.title")}
            </div>
            <div className="text-xs text-muted-foreground">
              {t("gear.sidebar.subtitle")}
            </div>
          </div>
          <RankingCard
            title={t("gear.sidebar.topDistance")}
            rows={topDistanceBikes}
            unit={t("records.units.km")}
          />
          <RankingCard
            title={t("gear.sidebar.topElevation")}
            rows={topElevationBikes}
            unit={t("activityDetail.units.m")}
          />
          <RankingCard
            title={t("gear.sidebar.topSpeed")}
            rows={topSpeedBikes}
            unit={t("activityDetail.units.kmh")}
            decimals={1}
          />
          <RankingCard
            title={t("gear.sidebar.topHmPerKm")}
            rows={topHmPerKmBikes}
            unit="HM/km"
            decimals={1}
          />
        </aside>
      </div>

      {isCreateGearOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setIsCreateGearOpen(false)}
        >
          <Card
            className="w-full max-w-2xl bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>{t("gear.manualCreate.title")}</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("gear.manualCreate.subtitle")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateGearOpen(false)}
                className="rounded-full p-2 transition-colors hover:bg-secondary"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={manualGearForm.name}
                  onChange={(event) =>
                    setManualGearForm((prev) => ({
                      ...prev,
                      name: event.target.value,
                    }))
                  }
                  placeholder={t("gear.manualCreate.fields.name")}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <select
                  value={manualGearForm.type}
                  onChange={(event) => {
                    const nextType =
                      event.target.value === "shoes" ? "shoes" : "bike";
                    setManualGearForm((prev) => ({ ...prev, type: nextType }));
                  }}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
                  style={{
                    color: "hsl(var(--foreground))",
                    backgroundColor: "hsl(var(--popover))",
                  }}
                >
                  <option
                    value="bike"
                    style={{
                      backgroundColor: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  >
                    {t("gear.manualCreate.types.bike")}
                  </option>
                  <option
                    value="shoes"
                    style={{
                      backgroundColor: "hsl(var(--popover))",
                      color: "hsl(var(--popover-foreground))",
                    }}
                  >
                    {t("gear.manualCreate.types.shoes")}
                  </option>
                </select>
                <input
                  type="text"
                  value={manualGearForm.brandName}
                  onChange={(event) =>
                    setManualGearForm((prev) => ({
                      ...prev,
                      brandName: event.target.value,
                    }))
                  }
                  placeholder={t("gear.manualCreate.fields.brand")}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  value={manualGearForm.modelName}
                  onChange={(event) =>
                    setManualGearForm((prev) => ({
                      ...prev,
                      modelName: event.target.value,
                    }))
                  }
                  placeholder={t("gear.manualCreate.fields.model")}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  min={0}
                  value={manualGearForm.distanceKm}
                  onChange={(event) =>
                    setManualGearForm((prev) => ({
                      ...prev,
                      distanceKm: event.target.value,
                    }))
                  }
                  placeholder={t("gear.manualCreate.fields.startDistanceKm")}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <label className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={manualGearForm.retired}
                    onChange={(event) =>
                      setManualGearForm((prev) => ({
                        ...prev,
                        retired: event.target.checked,
                      }))
                    }
                  />
                  {t("gear.manualCreate.fields.retired")}
                </label>
              </div>
              <textarea
                value={manualGearForm.description}
                onChange={(event) =>
                  setManualGearForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder={t("gear.manualCreate.fields.description")}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={createManualGearMutation.isPending}
                  onClick={() => createManualGearMutation.mutate()}
                  className={primaryActionButtonClass}
                >
                  {createManualGearMutation.isPending
                    ? t("gear.manualCreate.creating")
                    : t("gear.manualCreate.submit")}
                </button>
                {formError && (
                  <span className="text-sm text-red-500">{formError}</span>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
