import { useEffect, useRef } from 'react'

interface TurnstileWidgetProps {
  sitekey?: string
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
}

declare global {
  interface Window {
    turnstile?: any
  }
}

export function TurnstileWidget({
  sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY,
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!sitekey) {
      console.warn('Turnstile sitekey is missing')
      return
    }

    // Load the script if not already present
    let script = document.getElementById('turnstile-script') as HTMLScriptElement
    if (!script) {
      script = document.createElement('script')
      script.id = 'turnstile-script'
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    const renderWidget = () => {
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey,
          callback: onVerify,
          'error-callback': onError,
          'expired-callback': onExpire,
          theme,
        })
      }
    }

    if (window.turnstile) {
      renderWidget()
    } else {
      script.addEventListener('load', renderWidget)
    }

    return () => {
      if (script) {
        script.removeEventListener('load', renderWidget)
      }
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
  }, [sitekey, onVerify, onError, onExpire, theme])

  return <div ref={containerRef} />
}
