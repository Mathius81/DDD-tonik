import { LOGO_EMAIL_BASE64 } from './logo-inline';
import type { CompanySettings } from '../../../shared/schemas/settings';

export const LOGO_CID = 'tonik-logo';

/** Atașamentul logo pentru nodemailer (inline, referit prin cid). */
export function logoAttachment() {
  return {
    filename: 'tonik.png',
    content: Buffer.from(LOGO_EMAIL_BASE64, 'base64'),
    cid: LOGO_CID,
  };
}

/**
 * Șablonul HTML comun al emailurilor Tonik: antet cu logo, corp, subsol cu
 * datele firmei. `bodyHtml` e conținutul deja formatat (paragrafe/blocuri).
 */
export function renderEmailHtml(bodyHtml: string, company: CompanySettings): string {
  const footerParts = [
    company.name,
    company.phone && `Tel: ${company.phone}`,
    company.email,
    company.website,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="ro">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f4f6f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0"
        style="max-width:600px;width:100%;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e3e7e5;">
        <tr>
          <td align="center" style="background-color:#0e1b16;padding:20px 24px;">
            <img src="cid:${LOGO_CID}" alt="${company.name || 'Tonik'}" width="180" style="display:block;max-width:180px;height:auto;">
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:14px;line-height:1.65;color:#12201a;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #e3e7e5;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;line-height:1.6;color:#5c6b64;">
            ${footerParts.join(' · ')}
          </td>
        </tr>
      </table>
      <div style="max-width:600px;padding:12px 8px;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;color:#8a9791;">
        Mesaj transmis automat prin aplicația Tonik.
      </div>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Escape minim pentru text interpolat în HTML. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Text simplu (cu linii goale ca separatoare) → paragrafe HTML. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px;">${esc(block.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
