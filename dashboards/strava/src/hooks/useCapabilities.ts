import { useQuery } from '@tanstack/react-query'
import { getCapabilities, type AdapterCapabilities, type CapabilitiesResponse } from '../lib/api'

const fallbackCapabilities: AdapterCapabilities = {
  supportsFiles: true,
  supportsOAuth: true,
  supportsWebhooks: false,
  supportsSegments: true,
  supportsSync: true,
  supportsPhotos: true,
}

export function useCapabilities() {
  const query = useQuery({
    queryKey: ['capabilities'],
    queryFn: getCapabilities,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })

  const data: CapabilitiesResponse | undefined = query.data
  const adapters = data?.adapters || []
  const capabilities = data?.capabilities || fallbackCapabilities

  const hasAdapter = (adapterId: string) =>
    adapters.some((adapter) => adapter.id === adapterId && adapter.enabled)

  const hasCapability = (capability: keyof AdapterCapabilities) => capabilities[capability]

  return {
    ...query,
    data,
    adapters,
    capabilities,
    hasAdapter,
    hasCapability,
  }
}
