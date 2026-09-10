/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { creeazaContextTest } from '../helpers/app-context';
import { buildDddReport } from '../../src/main/services/reports/ddd-report';
import { renderEmailHtml, textToHtml } from '../../src/main/services/messaging/email-template';
import type { FollowupStatus } from '../../src/shared/schemas/followup';

/** Extrage un bloc, ca un nume prezent într-o secțiune greșită să nu satisfacă testul. */
function sectiune(corp: string, titlu: string): string {
  return corp.split('\n\n').find((bloc) => bloc.startsWith(titlu)) ?? '';
}

describe('Constructorul DDD — conținut din repo-uri reale, dimineață și seară', () => {
  let baza: ReturnType<typeof creeazaContextTest>;
  beforeEach(() => { baza = creeazaContextTest(); });
  afterEach(() => { baza.cleanup(); vi.restoreAllMocks(); });

  function urmarire(nume: string, scadenta: string, optiuni: {
    stare?: FollowupStatus; programare?: string; ora?: string; activa?: boolean;
  } = {}) {
    const { db } = baza.ctx;
    const asociatie = Number(db.run('INSERT INTO associations (name, address, active) VALUES (?, ?, ?)',
      nume, 'Str. Școlii nr. 1', optiuni.activa === false ? 0 : 1).lastInsertRowid);
    const serviciu = db.get<{ id: number }>("SELECT id FROM services WHERE name = 'Dezinsecție'")!.id;
    const id = Number(db.run(`INSERT INTO followups (association_id, service_id, due_date, status, scheduled_date, scheduled_time)
      VALUES (?, ?, ?, ?, ?, ?)`, asociatie, serviciu, scadenta, optiuni.stare ?? 'pending',
    optiuni.programare ?? null, optiuni.ora ?? null).lastInsertRowid);
    return { id, asociatie };
  }

  it.each([
    ['dimineata', 'Planul zilei', '14.08.2026', 'Nimic urgent astăzi', 'Nimic urgent azi.'],
    ['seara', 'Pregătire pentru mâine', '15.08.2026', 'Nimic programat pentru mâine', 'Nimic programat mâine.'],
  ] as const)('baza goală, %s: păstrează ruta, subiectul, rezumatul și mesajul explicit de rezervă', (perioada, titlu, data, mesaj, rezumat) => {
    const raport = buildDddReport(baza.ctx, '2026-08-14', perioada);
    expect(raport).toMatchObject({ title: titlu, subject: `${titlu} · ${data} · Tonik`, route: '/ddd', isEmpty: true, summary: rezumat });
    expect(raport.body).toContain(mesaj);
    expect(raport.body).toMatch(/\n—\nTrimis automat de Tonik\.$/);
    expect(raport.body).not.toMatch(/null|undefined/);
  });

  it('separă restanțele, scadența de azi și intervalul 1–7 zile; exclude ziua a opta și stările închise', () => {
    urmarire('Restantă de trei zile', '2026-08-11');
    urmarire('Scadentă azi', '2026-08-14');
    urmarire('Contactată mâine', '2026-08-15', { stare: 'contacted' });
    urmarire('La limita de șapte zile', '2026-08-21');
    urmarire('PREA DEPARTE', '2026-08-22');
    urmarire('FINALIZATĂ', '2026-08-14', { stare: 'completed' });
    urmarire('ANULATĂ', '2026-08-14', { stare: 'cancelled' });
    urmarire('ASOCIAȚIE INACTIVĂ', '2026-08-14', { activa: false });
    const raport = buildDddReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(sectiune(raport.body, 'RESTANTE')).toBe('RESTANTE (1) — de contactat urgent\n  • Restantă de trei zile — Dezinsecție · restant de 3 zile');
    expect(sectiune(raport.body, 'AJUNG LA TERMEN')).toBe('AJUNG LA TERMEN ASTĂZI (1) — de contactat\n  • Scadentă azi — Dezinsecție');
    expect(sectiune(raport.body, 'URMĂTOARELE')).toBe('URMĂTOARELE 7 ZILE (2)\n  • Contactată mâine — Dezinsecție · 15.08.2026 (mâine)\n  • La limita de șapte zile — Dezinsecție · 21.08.2026 (în 7 zile)');
    expect(raport.body).not.toMatch(/PREA DEPARTE|FINALIZATĂ|ANULATĂ|ASOCIAȚIE INACTIVĂ/);
    expect(raport.summary).toBe('4 lucruri de făcut azi (1 restante).');
    expect(raport.isEmpty).toBe(false);
  });

  it('programările sunt ordonate după ora reală și nu sunt numărate din nou ca scadențe', () => {
    urmarire('Programată târziu', '2026-08-14', { stare: 'scheduled', programare: '2026-08-14', ora: '15:30' });
    urmarire('Programată devreme', '2026-08-14', { stare: 'scheduled', programare: '2026-08-14', ora: '08:15' });
    urmarire('ALTĂ ZI', '2026-08-14', { stare: 'scheduled', programare: '2026-08-15' });
    const raport = buildDddReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(sectiune(raport.body, 'PROGRAMATE')).toBe('PROGRAMATE ASTĂZI (2)\n  • Programată devreme — Dezinsecție · ora 08:15\n  • Programată târziu — Dezinsecție · ora 15:30');
    expect(raport.body).not.toContain('AJUNG LA TERMEN');
    expect(raport.body).not.toContain('ALTĂ ZI');
    expect(raport.summary).toBe('2 lucruri de făcut azi.');
  });

  it('asociația fără contacte și contactele fără telefon/email rămân vizibile, fără paranteze sau valori null', () => {
    urmarire('Fără contacte', '2026-08-14');
    const faraTelefon = urmarire('Fără telefon', '2026-08-14');
    const faraEmail = urmarire('Fără email', '2026-08-14');
    baza.ctx.db.run('INSERT INTO contacts (association_id, name, email) VALUES (?, ?, ?)', faraTelefon.asociatie, "Ștefan O'Brien", 'stefan@example.ro');
    baza.ctx.db.run('INSERT INTO contacts (association_id, name, phone) VALUES (?, ?, ?)', faraEmail.asociatie, 'Țâncu', '0712345678');
    const raport = buildDddReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(sectiune(raport.body, 'AJUNG LA TERMEN')).toBe(
      "AJUNG LA TERMEN ASTĂZI (3) — de contactat\n  • Fără contacte — Dezinsecție\n  • Fără telefon — Dezinsecție · Ștefan O'Brien\n  • Fără email — Dezinsecție · Țâncu (0712345678)",
    );
    expect(raport.body).not.toMatch(/null|undefined|\(\)|stefan@example/);
  });

  it('nu dublează asociația cu mai multe contacte și nu folosește un contact principal șters', () => {
    const { asociatie } = urmarire('O singură lucrare', '2026-08-14');
    for (const [nume, principal, sters] of [['SECUNDAR', 0, null], ['ȘTERS', 1, '2026-08-13'], ['Principal activ', 1, null]] as const) {
      baza.ctx.db.run('INSERT INTO contacts (association_id, name, is_primary, deleted_at) VALUES (?, ?, ?, ?)', asociatie, nume, principal, sters);
    }
    const raport = buildDddReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(sectiune(raport.body, 'AJUNG LA TERMEN')).toBe('AJUNG LA TERMEN ASTĂZI (1) — de contactat\n  • O singură lucrare — Dezinsecție · Principal activ');
    expect(raport.summary).toBe('1 lucru de făcut azi.');
    expect(raport.body).not.toMatch(/SECUNDAR|ȘTERS/);
  });

  it.each([
    ['2026-12-31', '2027-01-01', '01.01.2027'],
    ['2028-02-28', '2028-02-29', '29.02.2028'],
    ['2028-02-29', '2028-03-01', '01.03.2028'],
  ])('seara din %s folosește mâine pentru programări ȘI pentru clasificarea scadențelor', (azi, maine, dataRo) => {
    baza.schimbaOra(`${azi}T18:00:00`);
    urmarire('PROGRAMARE AZI EXCLUSĂ', maine, { stare: 'scheduled', programare: azi });
    urmarire('Programare mâine fără oră', maine, { stare: 'scheduled', programare: maine });
    urmarire('Scadența de azi devine restantă', azi);
    urmarire('Scadență mâine', maine);
    const raport = buildDddReport(baza.ctx, azi, 'seara');
    expect(sectiune(raport.body, 'PROGRAMATE')).toBe('PROGRAMATE MÂINE (1)\n  • Programare mâine fără oră — Dezinsecție');
    expect(sectiune(raport.body, 'AJUNG LA TERMEN')).toBe('AJUNG LA TERMEN MÂINE (1) — de contactat\n  • Scadență mâine — Dezinsecție');
    expect(sectiune(raport.body, 'RESTANTE')).toContain('Scadența de azi devine restantă — Dezinsecție · ieri');
    expect(raport.body).not.toContain('PROGRAMARE AZI EXCLUSĂ');
    expect(raport.subject).toBe(`Pregătire pentru mâine · ${dataRo} · Tonik`);
    expect(raport.summary).toBe('3 lucruri de făcut mâine (1 restante).');
  });

  it('adună erorile de reminder și mesaj, nu și mesajele reușite, și elimină avertismentul după rezolvare', () => {
    const { ctx } = baza;
    const { id } = urmarire('Lucrare cu erori', '2026-08-14');
    ctx.db.run("INSERT INTO reminders (followup_id, offset_days, channel, scheduled_at, status) VALUES (?, 3, 'internal', '2026-08-11 09:00:00', 'failed')", id);
    for (const stare of ['failed', 'confirmed_sent']) {
      ctx.db.run("INSERT INTO message_logs (channel, recipient, message_preview, status) VALUES ('email', 'test@example.ro', 'Mesaj', ?)", stare);
    }
    expect(buildDddReport(ctx, '2026-08-14', 'dimineata').body).toContain('2 mesaje eșuate necesită atenție în aplicație.');
    ctx.db.run("UPDATE reminders SET status = 'sent'");
    expect(buildDddReport(ctx, '2026-08-14', 'dimineata').body).toContain('1 mesaj eșuat necesită atenție în aplicație.');
    ctx.db.run("UPDATE message_logs SET status = 'confirmed_sent'");
    expect(buildDddReport(ctx, '2026-08-14', 'dimineata').body).not.toContain('necesită atenție');
  });

  it('numele din SQLite cu markup și apostrof rămâne complet în text și inert în email', () => {
    urmarire("<script>ăâîșț</script> O'Brien & fii", '2026-08-14');
    const raport = buildDddReport(baza.ctx, '2026-08-14', 'dimineata');
    expect(raport.body).toContain("<script>ăâîșț</script> O'Brien & fii — Dezinsecție");
    const html = renderEmailHtml(textToHtml(raport.body), baza.ctx.settings.get().company);
    expect(html).toContain("&lt;script&gt;ăâîșț&lt;/script&gt; O'Brien &amp; fii — Dezinsecție");
    expect(html).not.toContain('<script>');
  });
});
