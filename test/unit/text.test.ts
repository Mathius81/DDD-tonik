import { describe, it, expect } from 'vitest';
import { pluralRo, dueContext, unaccentRo, roMediumDate, roLongDate } from '../../src/shared/text';

describe('pluralRo — cele trei forme din română (Brief §6)', () => {
  it('1 lună', () => expect(pluralRo(1, 'lună', 'luni')).toBe('1 lună'));
  it('2 luni', () => expect(pluralRo(2, 'lună', 'luni')).toBe('2 luni'));
  it('19 luni', () => expect(pluralRo(19, 'lună', 'luni')).toBe('19 luni'));
  it('20 de luni', () => expect(pluralRo(20, 'lună', 'luni')).toBe('20 de luni'));
  it('100 de luni', () => expect(pluralRo(100, 'lună', 'luni')).toBe('100 de luni'));
  it('101 luni (rest 1-19)', () => expect(pluralRo(101, 'lună', 'luni')).toBe('101 luni'));
  it('120 de luni', () => expect(pluralRo(120, 'lună', 'luni')).toBe('120 de luni'));
  it('0 de zile', () => expect(pluralRo(0, 'zi', 'zile')).toBe('0 de zile'));
  it('1 intervenție / 5 intervenții', () => {
    expect(pluralRo(1, 'intervenție', 'intervenții')).toBe('1 intervenție');
    expect(pluralRo(5, 'intervenție', 'intervenții')).toBe('5 intervenții');
  });
});

describe('dueContext', () => {
  it('restant', () => {
    expect(dueContext(-5)).toEqual({ label: 'restant de 5 zile', urgency: 'overdue' });
    expect(dueContext(-1)).toEqual({ label: 'ieri', urgency: 'overdue' });
    expect(dueContext(-25).label).toBe('restant de 25 de zile');
  });
  it('astăzi / mâine / în X zile', () => {
    expect(dueContext(0)).toEqual({ label: 'astăzi', urgency: 'soon' });
    expect(dueContext(1)).toEqual({ label: 'mâine', urgency: 'soon' });
    expect(dueContext(3)).toEqual({ label: 'în 3 zile', urgency: 'soon' });
    expect(dueContext(30)).toEqual({ label: 'în 30 de zile', urgency: 'normal' });
  });
});

describe('unaccentRo', () => {
  it('normalizează diacriticele', () => {
    expect(unaccentRo('Ploiești')).toBe('ploiesti');
    expect(unaccentRo('Brăila Țăndărei Iași')).toBe('braila tandarei iasi');
  });
});

describe('date în română', () => {
  it('roMediumDate', () => expect(roMediumDate('2026-08-14')).toBe('14 august 2026'));
  it('roLongDate', () =>
    expect(roLongDate(new Date('2026-08-14T12:00:00'))).toBe('vineri, 14 august 2026'));
});
