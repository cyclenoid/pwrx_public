import { useEffect, useState } from 'react'
import i18n from '../i18n'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface StatCardProps {
  title: string
  value: number | string
  suffix?: string
  description?: string
  icon?: React.ReactNode
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}

export function StatCard({
  title,
  value,
  suffix = '',
  description,
  icon,
  trend,
  trendValue,
}: StatCardProps) {
  const [displayValue, setDisplayValue] = useState(0)
  const numericValue = typeof value === 'string' ? parseFloat(value) : value

  useEffect(() => {
    if (typeof numericValue !== 'number' || isNaN(numericValue)) {
      return
    }

    // Animate from 0 to target value
    const duration = 1000
    const steps = 60
    const stepValue = numericValue / steps
    let current = 0

    const timer = setInterval(() => {
      current += stepValue
      if (current >= numericValue) {
        setDisplayValue(numericValue)
        clearInterval(timer)
      } else {
        setDisplayValue(current)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [numericValue])

  const formattedValue = typeof value === 'string'
    ? value
    : displayValue.toLocaleString(i18n.language?.startsWith('de') ? 'de-DE' : 'en-US', { maximumFractionDigits: 0 })

  return (
    <Card className="transition-all duration-200 hover:shadow-lg hover:scale-[1.02] hover:border-primary/50">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {icon && (
          <div className="text-muted-foreground">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {formattedValue}
          {suffix && (
            <span className="text-lg font-normal text-muted-foreground ml-1">
              {suffix}
            </span>
          )}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
        {trend && trendValue && (
          <p className={`text-xs mt-1 flex items-center gap-1 ${
            trend === 'up' ? 'text-green-500' :
            trend === 'down' ? 'text-red-500' : 'text-muted-foreground'
          }`}>
            {trend === 'up' && (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m18 15-6-6-6 6"/>
              </svg>
            )}
            {trend === 'down' && (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m6 9 6 6 6-6"/>
              </svg>
            )}
            {trend === 'neutral' && (
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14"/>
              </svg>
            )}
            {trendValue}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
