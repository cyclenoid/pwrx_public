import { useState } from 'react'
import { cn } from '../../lib/utils'
import { MiniMap } from '../MiniMap'

interface ActivityThumbnailProps {
  photoUrl?: string | null
  routeData?: [number, number][] | null
  activityType: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeClasses = {
  sm: 'w-12 h-12',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
}

const iconSizes = {
  sm: 16,
  md: 20,
  lg: 28,
}

const typeIcons: Record<string, string> = {
  Ride: '🚴',
  VirtualRide: '🖥️',
  Run: '🏃',
  Walk: '🚶',
  Hike: '🥾',
  Swim: '🏊',
  Workout: '💪',
}

export function ActivityThumbnail({
  photoUrl,
  routeData,
  activityType,
  size = 'md',
  className,
}: ActivityThumbnailProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  const hasPhoto = photoUrl && !imageError
  const hasRoute = routeData && routeData.length > 0

  // Priority: Photo -> Route Map -> Icon
  return (
    <div
      className={cn(
        'relative rounded-lg overflow-hidden bg-muted flex-shrink-0',
        sizeClasses[size],
        className
      )}
    >
      {hasPhoto ? (
        <>
          {imageLoading && (
            <div className="absolute inset-0 animate-pulse bg-muted" />
          )}
          <img
            src={photoUrl}
            alt=""
            className={cn(
              'w-full h-full object-cover transition-opacity duration-200',
              imageLoading ? 'opacity-0' : 'opacity-100'
            )}
            onLoad={() => setImageLoading(false)}
            onError={() => {
              setImageError(true)
              setImageLoading(false)
            }}
          />
        </>
      ) : hasRoute ? (
        <MiniMap coordinates={routeData} className="w-full h-full" />
      ) : (
        <ActivityIcon type={activityType} size={iconSizes[size]} />
      )}
    </div>
  )
}

// Icon fallback component
function ActivityIcon({ type, size }: { type: string; size: number }) {
  const icon = typeIcons[type] || '🏃'

  return (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
      <span style={{ fontSize: size }} className="opacity-60">
        {icon}
      </span>
    </div>
  )
}

// Alternative: SVG icon version
export function ActivityIconSvg({ type, className }: { type: string; className?: string }) {
  const iconPaths: Record<string, React.ReactNode> = {
    Ride: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="18.5" cy="17.5" r="3.5"/>
        <circle cx="5.5" cy="17.5" r="3.5"/>
        <circle cx="15" cy="5" r="1"/>
        <path d="M12 17.5V14l-3-3 4-3 2 3h2"/>
      </svg>
    ),
    Run: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="17" cy="4" r="2"/>
        <path d="M15.59 13.51l-2.59-3.76-3.26 2.7c-.74.62-1.74.63-2.49.03L4 10l-1 1 4.52 3.38c1.25.94 2.95.92 4.18-.05L13 13l2.5 3.5L12 20l1 2 5-5.5"/>
      </svg>
    ),
    Walk: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <circle cx="12" cy="4" r="2"/>
        <path d="M12 6v4l-2 3m4 0l2 3.5M6 21l3-6m6 6l-3-6"/>
      </svg>
    ),
    default: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={className}>
        <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>
      </svg>
    ),
  }

  return iconPaths[type] || iconPaths.default
}
