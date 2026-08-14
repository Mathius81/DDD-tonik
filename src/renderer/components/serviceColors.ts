/**
 * Culorile serviciilor — un singur map (Brief §3).
 * Serviciile necunoscute primesc fallback-ul neutru.
 */

export interface ServiceColor {
  color: string;
  soft: string;
}

const bySlug: Record<string, ServiceColor> = {
  dezinsectie: { color: 'var(--svc-dezinsectie)', soft: 'var(--svc-dezinsectie-soft)' },
  deratizare: { color: 'var(--svc-deratizare)', soft: 'var(--svc-deratizare-soft)' },
  dezinfectie: { color: 'var(--svc-dezinfectie)', soft: 'var(--svc-dezinfectie-soft)' },
  spalare: { color: 'var(--svc-spalare)', soft: 'var(--svc-spalare-soft)' },
};

const fallback: ServiceColor = { color: 'var(--svc-fallback)', soft: 'var(--svc-fallback-soft)' };

/** 'Dezinsecție' → 'dezinsectie' */
export function serviceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/ă|â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/ș|ş/g, 's')
    .replace(/ț|ţ/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function serviceColor(name: string): ServiceColor {
  return bySlug[serviceSlug(name)] ?? fallback;
}
