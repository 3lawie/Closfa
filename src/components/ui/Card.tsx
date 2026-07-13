import { cn } from '@/lib/utils/cn'
import type { HTMLAttributes } from 'react'

// ──────────────────────────────────────────────────────────────
// Card
// ──────────────────────────────────────────────────────────────
interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const cardPadding = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-7' }

export function Card({ padding = 'md', className, children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-sm',
        cardPadding[padding],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
