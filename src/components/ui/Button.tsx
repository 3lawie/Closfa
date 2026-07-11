import { cn } from '@/lib/utils/cn'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const variants = {
  primary: 'text-white border border-transparent shadow-sm',
  secondary: 'bg-transparent text-current shadow-sm',
  ghost: 'bg-transparent text-current border border-transparent opacity-70 hover:opacity-100',
  danger: 'bg-red-500 hover:bg-red-600 text-white border border-red-600 shadow-sm',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-4 py-2 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        'font-medium transition-all focus:outline-none focus:ring-2 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      style={{
        background: variant === 'primary' ? 'var(--accent)' : undefined,
        borderColor: variant === 'secondary' ? 'var(--border)' : undefined,
        color: variant === 'secondary' ? 'var(--text)' : undefined,
        ...props.style
      }}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {children}
        </span>
      ) : (
        children
      )}
    </button>
  )
}
