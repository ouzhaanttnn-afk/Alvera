'use client';
import Script from 'next/script';
import { useRef } from 'react';
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
export function Captcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    id = useRef<string | undefined>(undefined);
  const render = () => {
    if (ref.current && window.turnstile && !id.current)
      id.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        action: 'application',
        callback: onToken,
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
      });
  };
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onReady={render}
      />
      <div ref={ref} />
    </>
  );
}
