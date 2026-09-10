/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { describe, expect, it } from 'vitest';
import { esc, logoAttachment, LOGO_CID, renderEmailHtml, textToHtml } from '../../src/main/services/messaging/email-template';
import { companySettingsSchema } from '../../src/shared/schemas/settings';

describe('Email — text neîncrezut convertit în HTML', () => {
  it.each([
    ['', ''],
    ["Ștefan O\'Brien — ăâîșț", "Ștefan O\'Brien — ăâîșț"],
    ['<script>alert("client")</script> & fii', '&lt;script&gt;alert("client")&lt;/script&gt; &amp; fii'],
    ['&lt;img&gt;', '&amp;lt;img&amp;gt;'],
  ])('escapează textul %j fără să piardă diacritice sau să decodeze entități introduse de client', (text, asteptat) => {
    expect(esc(text)).toBe(asteptat);
  });

  it('separă paragrafele la linii goale și păstrează o singură linie nouă ca br, după escapare', () => {
    expect(textToHtml('  Bună, Ștefan!\nO\'Brien & fii\n\n\n <b>Nu este HTML</b>  ')).toBe(
      '<p style="margin:0 0 14px;">Bună, Ștefan!<br>O\'Brien &amp; fii</p>' +
      '<p style="margin:0 0 14px;">&lt;b&gt;Nu este HTML&lt;/b&gt;</p>',
    );
  });

  it('un corp gol produce un paragraf gol, nu undefined sau null', () => {
    expect(textToHtml('')).toBe('<p style="margin:0 0 14px;"></p>');
  });

  it('mesajul de 5000 de caractere rămâne integral, inclusiv ultimul caracter și escaparea repetată', () => {
    const text = 'ăâîșț<&>!?'.repeat(500);
    expect(text).toHaveLength(5000);
    expect(textToHtml(text)).toBe(
      `<p style="margin:0 0 14px;">${'ăâîșț&lt;&amp;&gt;!?'.repeat(500)}</p>`,
    );
  });

  it('numele de client cu script ajunge ca text inert în emailul complet, nu ca element executabil', () => {
    const html = renderEmailHtml(
      textToHtml('Bună, <script>alert("x")</script> O\'Brien & Ștefan!'),
      companySettingsSchema.parse({ name: 'Tonik' }),
    );
    expect(html).toContain('<p style="margin:0 0 14px;">Bună, &lt;script&gt;alert("x")&lt;/script&gt; O\'Brien &amp; Ștefan!</p>');
    expect(html).not.toMatch(/<script[\s>]/i);
    expect(html).not.toContain('&amp;lt;script');
  });
});

describe('Email — structură, identitatea firmei și atașament inline', () => {
  it('include corpul deja formatat, datele firmei în ordine și referința la logo-ul atașat', () => {
    const html = renderEmailHtml('<p><strong>Lucrare mâine</strong></p>', companySettingsSchema.parse({
      name: 'Tonik Ștefan', phone: '0712345678', email: 'firma@example.ro', website: 'https://example.ro',
    }));
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('<html lang="ro">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain('<p><strong>Lucrare mâine</strong></p>');
    expect(html).toContain('Tonik Ștefan · Tel: 0712345678 · firma@example.ro · https://example.ro');
    expect(html).toContain(`src="cid:${LOGO_CID}" alt="Tonik Ștefan"`);
    expect(html).toContain('Mesaj transmis automat prin aplicația Tonik.');
  });

  it('firma fără date folosește Tonik la logo și omite telefonul și separatorii goi din subsol', () => {
    const html = renderEmailHtml('', companySettingsSchema.parse({}));
    expect(html).toContain('alt="Tonik"');
    expect(html).not.toContain('Tel:');
    expect(html).not.toContain(' · ');
    expect(html).not.toMatch(/undefined|null/);
  });

  it('logoAttachment furnizează un PNG real, cu același CID ca HTML-ul și buffer independent', () => {
    const atasament = logoAttachment();
    expect(atasament.filename).toBe('tonik.png');
    expect(atasament.cid).toBe(LOGO_CID);
    expect(atasament.content.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect(atasament.content.subarray(-8)).toEqual(Buffer.from([73, 69, 78, 68, 174, 66, 96, 130]));
    atasament.content[0] = 0;
    expect(logoAttachment().content[0]).toBe(137);
  });

  // Atributul alt escapează și ghilimelele, nu numai caracterele markup.
  it('REGRESIE: numele firmei nu poate injecta un atribut onerror în imaginea inline', () => {
    const html = renderEmailHtml('', companySettingsSchema.parse({ name: 'Tonik" onerror="alert(1)' }));
    expect(html.match(/<img\b[^>]*>/)?.[0]).toBe(
      '<img src="cid:tonik-logo" alt="Tonik&quot; onerror=&quot;alert(1)" width="180" style="display:block;max-width:180px;height:auto;">',
    );
  });

  // Fiecare câmp al firmei este escapat ca text în subsol.
  it.each(['name', 'phone', 'email', 'website'] as const)('REGRESIE: câmpul firmei %s cu markup rămâne text, nu HTML activ în subsol', (camp) => {
    const html = renderEmailHtml('', companySettingsSchema.parse({ [camp]: '<script>1</script>&' }));
    const subsol = html.slice(html.indexOf('border-top:1px solid'));
    expect(subsol).toContain('&lt;script&gt;1&lt;/script&gt;&amp;');
    expect(subsol).not.toContain('<script>');
  });

  it('numele românesc cu ghilimele, apostrof și & rămâne integral în ambele contexte HTML', () => {
    const name = `S.C. "Ana & O'Brien <Co>" S.R.L.`;
    const html = renderEmailHtml(textToHtml('Detalii & condiții'), companySettingsSchema.parse({ name }));
    expect(html).toContain('alt="S.C. &quot;Ana &amp; O&#39;Brien &lt;Co&gt;&quot; S.R.L."');
    const subsol = html.slice(html.indexOf('border-top:1px solid'));
    expect(subsol).toContain(`S.C. "Ana &amp; O'Brien &lt;Co&gt;" S.R.L.`);
    expect(html).toContain('<p style="margin:0 0 14px;">Detalii &amp; condiții</p>');
    expect(html).not.toContain('&amp;amp;');
  });

  it('entitățile scrise literal de firmă nu sunt decodate și URL-urile păstrează parametrii ca text', () => {
    const html = renderEmailHtml('', companySettingsSchema.parse({
      name: 'Ana &quot;Co&quot;', website: 'https://example.ro/?a=1&b=<doi>',
    }));
    expect(html).toContain('alt="Ana &amp;quot;Co&amp;quot;"');
    expect(html).toContain('https://example.ro/?a=1&amp;b=&lt;doi&gt;');
  });
});
