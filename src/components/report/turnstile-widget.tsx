'use client';
import { useCallback, useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string | null;
  onToken: (token: string | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const stableOnToken = useCallback(onToken, [onToken]);

  useEffect(() => {
    if (!siteKey || !container.current) return;
    let cancelled = false;

    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return;
      container.current.innerHTML = '';
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        theme: 'dark',
        callback: (token: string) => stableOnToken(token),
        'expired-callback': () => stableOnToken(null),
        'error-callback': () => stableOnToken(null),
      });
    };

    if (window.turnstile) {
      render();
    } else {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.onload = render;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* widget already gone */
        }
        widgetId.current = null;
      }
    };
  }, [siteKey, stableOnToken]);

  if (!siteKey) return null;
  return <div ref={container} aria-label="CAPTCHA verification" />;
}
