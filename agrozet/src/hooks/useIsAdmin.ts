'use client'

import { useQuery } from '@tanstack/react-query'
import { getSupabaseBrowserClient } from '@/lib/supabase-browser'

/** admin = role 'admin' no user_metadata — a MESMA fonte que a funcao is_admin() do banco le. */
export function useIsAdmin() {
  const { data, isLoading } = useQuery({
    queryKey: ['is-admin'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await getSupabaseBrowserClient().auth.getUser()
      return data.user?.user_metadata?.role === 'admin'
    },
  })
  return { isAdmin: data ?? false, isLoading }
}
