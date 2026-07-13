import { Spinner } from '@/components/ui/Spinner'

export const LoadingSpinner = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-bg text-text-s gap-4">
      <Spinner size="lg" />
      <p>Loading Closfa...</p>
    </div>
  )
}
