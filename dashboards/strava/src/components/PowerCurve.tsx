import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { getActivityPowerCurve } from '../lib/api'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface PowerCurveProps {
  activityId: number
}

export function PowerCurve({ activityId }: PowerCurveProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['power-curve', activityId],
    queryFn: () => getActivityPowerCurve(activityId),
  })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Power Curve</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 flex items-center justify-center text-muted-foreground">
            Loading power data...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error || !data || data.durations.length === 0) {
    return null // Don't show anything if no power data
  }

  // Format data for chart
  const chartData = data.durations.map((d) => ({
    label: d.label,
    watts: d.watts,
    duration: d.duration,
  }))

  // Find peak power
  const peakPower = Math.max(...chartData.map(d => d.watts || 0))
  const peakEntry = chartData.find(d => d.watts === peakPower)

  // Calculate W/kg (assuming 75kg, can be made configurable)
  const estimatedWeight = 75

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span>Power Curve</span>
          {peakEntry && (
            <span className="text-sm font-normal text-muted-foreground">
              Peak: {peakPower}W @ {peakEntry.label}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Power Curve Chart */}
        <div className="h-48 mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#eab308" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#eab308" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}W`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload
                    return (
                      <div className="bg-background border rounded-lg shadow-lg p-2 text-sm">
                        <p className="font-medium">{data.label}</p>
                        <p className="text-yellow-500">{data.watts}W</p>
                        <p className="text-muted-foreground text-xs">
                          {(data.watts / estimatedWeight).toFixed(2)} W/kg
                        </p>
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Area
                type="monotone"
                dataKey="watts"
                stroke="#eab308"
                strokeWidth={2}
                fill="url(#powerGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Power Values Grid */}
        <div className="grid grid-cols-5 gap-2 text-center">
          {chartData.slice(0, 5).map((d) => (
            <div key={d.label} className="bg-secondary/50 rounded p-2">
              <p className="text-xs text-muted-foreground">{d.label}</p>
              <p className="font-bold text-yellow-500">{d.watts}W</p>
              <p className="text-xs text-muted-foreground">
                {(d.watts! / estimatedWeight).toFixed(1)} W/kg
              </p>
            </div>
          ))}
        </div>

        {chartData.length > 5 && (
          <div className="grid grid-cols-4 gap-2 text-center mt-2">
            {chartData.slice(5).map((d) => (
              <div key={d.label} className="bg-secondary/30 rounded p-2">
                <p className="text-xs text-muted-foreground">{d.label}</p>
                <p className="font-semibold text-sm">{d.watts}W</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
