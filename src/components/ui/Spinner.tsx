import { cn } from '@/lib/utils/cn'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizeMap = {
  sm: 'w-4 h-4 border-2',
  md: 'w-7 h-7 border-2',
  lg: 'w-12 h-12 border-4',
}

/** Simple spinning ring */
export function Spinner({ size = 'md', className }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        sizeMap[size],
        'border-accent-border border-t-transparent rounded-full animate-spin',
        className,
      )}
    />
  )
}

/** Full-page loading overlay */
export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <Spinner size="lg" />
    </div>
  )
}
