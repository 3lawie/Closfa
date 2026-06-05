import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility: merge Tailwind classes with conflict resolution.
 *
 * clsx handles conditional classes:
 *   cn("px-4", isActive && "bg-blue-500")
 *
 * twMerge handles Tailwind conflicts:
 *   cn("px-4", "px-8") → "px-8" (not "px-4 px-8")
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
