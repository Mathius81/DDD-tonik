import type { DddApi } from '../../preload';

declare global {
  interface Window {
    ddd: DddApi;
  }
}

/** Acces tipizat la API-ul expus de preload. */
export const ddd = window.ddd;
