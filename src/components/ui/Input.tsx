import { cn } from '@/lib/utils/cn'
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export function Input({ label, error, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-text-s font-medium"
        >
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn(
          "flex h-10 w-full rounded-md border border-border bg-bg px-3 py-2 text-text",
          "placeholder:text-text-s",
          "transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
          "focus:outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-border",
          className
        )}
        {...props}
      />
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export function Textarea({ label, error, className, id, ...props }: TextareaProps) {
  const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={textareaId}
          className="text-text-s font-medium"
        >
          {label}
        </label>
      )}
      <textarea
        id={textareaId}
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-border bg-bg px-3 py-2 text-text",
          "placeholder:text-text-s",
          "transition-all duration-[var(--motion-fast)] ease-[var(--motion-ease)]",
          "focus:outline-none focus:border-accent-border focus:ring-2 focus:ring-accent-border",
          className
        )}
        {...props}
      />
      {error && <p className="text-danger text-xs">{error}</p>}
    </div>
  )
}
