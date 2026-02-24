import { useState, useCallback } from 'react'
import type { Toast } from '../components/ui/toast'

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback(
    ({
      title,
      description,
      variant = 'default',
    }: {
      title: string
      description?: string
      variant?: 'default' | 'success' | 'error'
    }) => {
      const id = Math.random().toString(36).substring(2, 9)
      setToasts((prev) => [...prev, { id, title, description, variant }])
    },
    []
  )

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return {
    toast,
    toasts,
    dismiss,
  }
}
