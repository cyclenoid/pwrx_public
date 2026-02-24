import { useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { useTheme } from '../ThemeProvider'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Skeleton } from '../ui/skeleton'
import { NoDataAvailable } from '../ui/empty-state'
import { formatNumber } from '../../lib/formatters'

export interface TrendDataPoint {
  label: string
  value: number
  date?: string
}

interface TrendChartProps {
  title: string
  subtitle?: string
  data: TrendDataPoint[]
  unit: string
  color?: 'orange' | 'green' | 'blue' | 'purple'
  isLoading?: boolean
  height?: number
  onPointClick?: (point: TrendDataPoint) => void
}

const colorConfigs = {
  orange: {
    stroke: '#f97316',
    fill: 'url(#gradient-orange)',
    gradientStart: '#f97316',
    gradientEnd: '#f9731600',
  },
  green: {
    stroke: '#22c55e',
    fill: 'url(#gradient-green)',
    gradientStart: '#22c55e',
    gradientEnd: '#22c55e00',
  },
  blue: {
    stroke: '#3b82f6',
    fill: 'url(#gradient-blue)',
    gradientStart: '#3b82f6',
    gradientEnd: '#3b82f600',
  },
  purple: {
    stroke: '#a855f7',
    fill: 'url(#gradient-purple)',
    gradientStart: '#a855f7',
    gradientEnd: '#a855f700',
  },
}

// Custom tooltip component
interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; payload: TrendDataPoint }>
  label?: string
  unit: string
}

function CustomTooltip({ active, payload, label, unit }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  return (
    <div className="bg-popover/95 backdrop-blur border rounded-lg shadow-lg px-3 py-2">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-semibold">
        {formatNumber(payload[0].value)} {unit}
      </p>
    </div>
  )
}

export function TrendChart({
  title,
  subtitle,
  data,
  unit,
  color = 'orange',
  isLoading = false,
  height = 200,
  onPointClick,
}: TrendChartProps) {
  const { resolvedTheme } = useTheme()
  const colorConfig = colorConfigs[color]

  const chartColors = useMemo(() => ({
    grid: resolvedTheme === 'dark' ? '#374151' : '#e5e7eb',
    text: resolvedTheme === 'dark' ? '#9ca3af' : '#6b7280',
    background: resolvedTheme === 'dark' ? '#1f2937' : '#ffffff',
  }), [resolvedTheme])

  // Calculate nice axis domain - always start at 0
  const yDomain = useMemo(() => {
    if (!data.length) return [0, 100]
    const values = data.map(d => d.value)
    const max = Math.max(...values)
    const padding = max * 0.1
    return [0, max + padding]
  }, [data])

  // Format Y axis values
  const formatYAxis = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toString()
  }

  if (isLoading) {
    return <TrendChartSkeleton height={height} />
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">{title}</CardTitle>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </CardHeader>
        <CardContent>
          <NoDataAvailable />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">
              {formatNumber(data.reduce((sum, d) => sum + d.value, 0))}
              <span className="text-xs font-normal text-muted-foreground ml-1">{unit}</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onClick={(e) => {
              if (e && (e as any).activePayload && onPointClick) {
                const payload = (e as any).activePayload[0]?.payload
                if (payload) onPointClick(payload)
              }
            }}
          >
            <defs>
              <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colorConfig.gradientStart} stopOpacity={0.3} />
                <stop offset="100%" stopColor={colorConfig.gradientEnd} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke={chartColors.grid}
              vertical={false}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: chartColors.text }}
              dy={8}
              interval={0}
              angle={-45}
              textAnchor="end"
              height={50}
            />
            <YAxis
              domain={yDomain}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: chartColors.text }}
              tickFormatter={formatYAxis}
              width={45}
            />
            <Tooltip
              content={<CustomTooltip unit={unit} />}
              cursor={{ stroke: colorConfig.stroke, strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={colorConfig.stroke}
              strokeWidth={2}
              fill={colorConfig.fill}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function TrendChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-20" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  )
}

// Compact chart variant for dashboard sidebar
export function TrendChartMini({
  data,
  color = 'orange',
  height = 60,
}: {
  data: TrendDataPoint[]
  color?: 'orange' | 'green' | 'blue' | 'purple'
  height?: number
}) {
  const colorConfig = colorConfigs[color]

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`gradient-mini-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={colorConfig.gradientStart} stopOpacity={0.3} />
            <stop offset="100%" stopColor={colorConfig.gradientEnd} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="value"
          stroke={colorConfig.stroke}
          strokeWidth={1.5}
          fill={`url(#gradient-mini-${color})`}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
