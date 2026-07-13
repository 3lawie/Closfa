import { cn } from '@/lib/utils/cn'
import type { ButtonHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  isPending?: boolean
}

const variants = {
  primary: 'bg-accent text-white hover:bg-accent-hover shadow-sm',
  secondary: 'bg-surface border border-border text-text hover:bg-surface-translucent shadow-sm',
  ghost: 'bg-transparent text-text-s hover:text-text hover:bg-surface-translucent',
  destructive: 'bg-danger text-white hover:bg-danger-hover shadow-sm',
}

const sizes = {
  sm: 'px-3 py-1.5 text-xs font-semibold rounded-sm',
  md: 'px-4 py-2 text-sm font-bold rounded-md',
  lg: 'px-6 py-3 text-base font-bold rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  isPending = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || isPending}
      className={cn(
        'inline-flex items-center justify-center transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)] active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {isPending ? (
        <span className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
