import { session } from 'electron';

/**
 * CSP restrictiv aplicat pe toate răspunsurile.
 * În dev, Vite HMR are nevoie de ws: și inline styles.
 */
export function applyContentSecurityPolicy(devServerUrl: string | undefined): void {
  const csp = devServerUrl
    ? [
        "default-src 'self'",
        `script-src 'self' ${devServerUrl}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        `connect-src 'self' ${devServerUrl} ws://localhost:* ws://127.0.0.1:*`,
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ')
    : [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
      ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}
