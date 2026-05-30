"use client"
import nextDynamic from 'next/dynamic'
import { LoadingSpinner } from '@/components/loadingSpinner'

export const dynamic = 'force-dynamic'

const SpaClientEntry = nextDynamic(() => import('@/components/TanStackRouterProvider')
  .then((m)=>({default: m.TanStackRouterProvider})), {
  ssr: false,
  loading: () => (
    <LoadingSpinner />
  ),
})

export default function SpaPage() {
  return <SpaClientEntry />
}
