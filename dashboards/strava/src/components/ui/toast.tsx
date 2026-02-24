import { useEffect, useState } from 'react'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'success' | 'error'
}

interface ToastProps {
  toast: Toast
  onDismiss: (id: string) => void
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Fade in
    requestAnimationFrame(() => setIsVisible(true))

    // Auto dismiss after 3 seconds
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => onDismiss(toast.id), 200)
    }, 3000)

    return () => clearTimeout(timer)
  }, [toast.id, onDismiss])

  const variants = {
    default: 'bg-background border-border',
    success: 'bg-green-500/10 border-green-500/50',
    error: 'bg-red-500/10 border-red-500/50',
  }

  const iconColors = {
    default: 'text-primary',
    success: 'text-green-500',
    error: 'text-red-500',
  }

  const variant = toast.variant || 'default'

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg transition-all duration-200 ${
        variants[variant]
      } ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
    >
      {variant === 'success' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={iconColors[variant]}
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      )}
      {variant === 'error' && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={iconColors[variant]}
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </svg>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{toast.title}</div>
        {toast.description && (
          <div className="text-xs text-muted-foreground mt-0.5">{toast.description}</div>
        )}
      </div>
      <button
        onClick={() => {
          setIsVisible(false)
          setTimeout(() => onDismiss(toast.id), 200)
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <line x1="18" x2="6" y1="6" y2="18" />
          <line x1="6" x2="18" y1="6" y2="18" />
        </svg>
      </button>
    </div>
  )
}

interface ToasterProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function Toaster({ toasts, onDismiss }: ToasterProps) {
  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-0 right-0 z-50 p-4 flex flex-col gap-2 max-w-md w-full">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  )
}
