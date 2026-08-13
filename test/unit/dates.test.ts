import { describe, it, expect } from 'vitest';
import { addMonthsClamped, formatRo, parseRo, daysBetween } from '../../src/shared/dates';

describe('addMonthsClamped', () => {
  it('adaugă luni calendaristice simple', () => {
    expect(addMonthsClamped('2026-08-13', 3)).toBe('2026-11-13');
  });

  it('scenariul de acceptanță: 13.08.2026 + 3 luni = 13.11.2026', () => {
    expect(addMonthsClamped('2026-08-13', 3)).toBe('2026-11-13');
  });

  it('limitează la sfârșit de lună: 31 ianuarie + 1 lună → 28 februarie', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('an bisect: 31 ianuarie 2028 + 1 lună → 29 februarie', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('29 februarie an bisect + 12 luni → 28 februarie an obișnuit', () => {
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
  });

  it('31 august + 1 lună → 30 septembrie', () => {
    expect(addMonthsClamped('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('30 noiembrie + 3 luni → 28/29 februarie (nu explodează peste an)', () => {
    expect(addMonthsClamped('2026-11-30', 3)).toBe('2027-02-28');
  });

  it('traversează anul: 15 noiembrie + 3 luni → 15 februarie', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('intervale lungi: + 24 luni', () => {
    expect(addMonthsClamped('2026-05-10', 24)).toBe('2028-05-10');
  });

  it('nu folosește aritmetică pe zile (90 zile ≠ 3 luni)', () => {
    // 2026-01-15 + 90 zile ar fi 2026-04-15; +3 luni calendaristice = 2026-04-15 doar întâmplător;
    // testăm un caz în care diferă:
    expect(addMonthsClamped('2026-01-31', 3)).toBe('2026-04-30');
  });
});

describe('formatRo / parseRo', () => {
  it('formatează ISO în DD.MM.YYYY', () => {
    expect(formatRo('2026-11-13')).toBe('13.11.2026');
  });

  it('parsează DD.MM.YYYY în ISO', () => {
    expect(parseRo('13.11.2026')).toBe('2026-11-13');
  });

  it('aruncă pentru dată invalidă', () => {
    expect(() => parseRo('32.13.2026')).toThrow();
  });
});

describe('daysBetween', () => {
  it('numără zilele calendaristice', () => {
    expect(daysBetween('2026-08-13', '2026-08-20')).toBe(7);
    expect(daysBetween('2026-08-13', '2026-08-13')).toBe(0);
    expect(daysBetween('2026-08-13', '2026-08-10')).toBe(-3);
  });
});
