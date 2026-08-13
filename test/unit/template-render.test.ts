import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  normalizePhoneE164,
} from '../../src/main/services/messaging/template-render';

const ctx = {
  contact_name: 'Ion Popescu',
  association_name: 'Asociația Bloc A7',
  service_name: 'Dezinsecție',
  due_date: '2026-11-13',
  todayIso: '2026-10-14',
  company: {
    name: 'DDD Serv SRL',
    tax_id: '',
    address: '',
    phone: '0722000000',
    email: '',
    website: '',
  },
};

describe('renderTemplate', () => {
  it('înlocuiește toate variabilele, cu diacritice intacte', () => {
    const result = renderTemplate(
      'Bună ziua, {{contact_name}}. {{service_name}} la {{association_name}} pe {{due_date}} ({{days_remaining}} zile). {{company_name}} {{company_phone}}',
      ctx,
    );
    expect(result).toBe(
      'Bună ziua, Ion Popescu. Dezinsecție la Asociația Bloc A7 pe 13.11.2026 (30 zile). DDD Serv SRL 0722000000',
    );
  });

  it('variabilele necunoscute devin gol, nu rămân {{...}}', () => {
    expect(renderTemplate('X {{necunoscut}} Y', ctx)).toBe('X  Y');
  });

  it('acceptă spații în interiorul acoladelor', () => {
    expect(renderTemplate('{{ contact_name }}', ctx)).toBe('Ion Popescu');
  });
});

describe('normalizePhoneE164 (numere românești)', () => {
  it('07xxxxxxxx → 407xxxxxxxx', () => {
    expect(normalizePhoneE164('0712345678')).toBe('40712345678');
  });
  it('acceptă spații, liniuțe, paranteze', () => {
    expect(normalizePhoneE164('0712 345 678')).toBe('40712345678');
    expect(normalizePhoneE164('0712-345-678')).toBe('40712345678');
  });
  it('+40 rămâne 40…', () => {
    expect(normalizePhoneE164('+40712345678')).toBe('40712345678');
  });
  it('0040 devine 40…', () => {
    expect(normalizePhoneE164('0040712345678')).toBe('40712345678');
  });
  it('respinge numere invalide', () => {
    expect(normalizePhoneE164('123')).toBeNull();
    expect(normalizePhoneE164('abc')).toBeNull();
    expect(normalizePhoneE164('071234')).toBeNull();
  });
});
