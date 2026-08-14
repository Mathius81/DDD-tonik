/**
 * Tema și densitatea aplicației — persistate local, aplicate pe <html>.
 * 'system' respectă preferința sistemului de operare (Brief §7.4).
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type DensityPref = 'compact' | 'comfortable';

const THEME_KEY = 'tonik.theme';
const DENSITY_KEY = 'tonik.density';

export function getThemePref(): ThemePref {
  return (localStorage.getItem(THEME_KEY) as ThemePref) ?? 'system';
}

export function getDensityPref(): DensityPref {
  return (localStorage.getItem(DENSITY_KEY) as DensityPref) ?? 'compact';
}

function resolvedTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyAppearance(
  theme: ThemePref = getThemePref(),
  density: DensityPref = getDensityPref(),
): 'light' | 'dark' {
  localStorage.setItem(THEME_KEY, theme);
  localStorage.setItem(DENSITY_KEY, density);
  const resolved = resolvedTheme(theme);
  document.documentElement.dataset.theme = resolved === 'dark' ? 'dark' : '';
  if (resolved !== 'dark') delete document.documentElement.dataset.theme;
  document.documentElement.dataset.density = density;
  return resolved;
}

/** Reaplică la schimbarea temei de sistem, dacă preferința e 'system'. */
export function watchSystemTheme(onChange: (resolved: 'light' | 'dark') => void): () => void {
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = () => {
    if (getThemePref() === 'system') onChange(applyAppearance());
  };
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}
