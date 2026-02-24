import { useQuery } from '@tanstack/react-query'
import { getUserProfile } from '../lib/api'

export function useUserProfile() {
  return useQuery({
    queryKey: ['user-profile'],
    queryFn: getUserProfile,
    staleTime: 10 * 1000, // 10 seconds - keep data fresh for profile updates
    retry: 2,
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchInterval: 30 * 1000, // Refetch every 30 seconds
  })
}
