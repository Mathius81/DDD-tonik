import { describe, it, expect } from 'vitest';
import { createTestDb } from '../helpers/tmp-db';
import { SettingsRepository } from '../../src/main/db/repos/settings.repo';

/**
 * Bug reparat: ramura `catch` din `SettingsRepository.get()` (setări JSON corupte) întorcea
 * `legacy_migrated: false`. Secvență problematică:
 *   1. setări corupte în bază → get() întoarce valorile implicite;
 *   2. utilizatorul reconfigurează raportul zilnic (destinatari + oră) și salvează;
 *   3. save() persistă și `legacy_migrated: false` (nemodificat de utilizator);
 *   4. următorul get() rulează DIN NOU migrarea câmpurilor vechi (goale) și suprascrie
 *      exact ce tocmai a salvat utilizatorul.
 * Reparat: ramura `catch` marchează și ea `legacy_migrated = true`, la fel ca la instalarea nouă.
 */
describe('SettingsRepository — migrarea pe ramura de setări corupte', () => {
  it('o configurare de raport salvată după setări corupte SUPRAVIEȚUIEȘTE următoarei citiri', () => {
    const t = createTestDb();
    try {
      // Simulăm setări corupte în baza de date (JSON invalid — ex. scriere întreruptă).
      t.db.run(`INSERT INTO settings (key, value) VALUES ('app_settings', ?)`, 'not valid json {{{');

      const repo = new SettingsRepository(t.db);

      // Prima citire, pe ramura `catch`: nu blochează aplicația, întoarce valorile implicite.
      const afterCorruption = repo.get();
      expect(afterCorruption.daily_digest.reports.ddd_dimineata.recipients).toEqual([]);

      // Utilizatorul reconfigurează raportul de dimineață (destinatari + oră) și salvează,
      // exact fluxul din Setări → Raport zilnic.
      const reconfigured = {
        ...afterCorruption,
        daily_digest: {
          ...afterCorruption.daily_digest,
          reports: {
            ...afterCorruption.daily_digest.reports,
            ddd_dimineata: {
              enabled: true,
              send_at: '09:15',
              channels: { email: true, whatsapp: false, notification: false },
              recipients: [{ email: 'sef@tonik.ro', active: true }],
            },
          },
        },
      };
      repo.save(reconfigured);

      // A doua citire: configurarea trebuie să supraviețuiască — NU să fie suprascrisă de o
      // nouă rulare a migrării câmpurilor vechi (care ar reseta totul la valorile implicite).
      const afterSave = repo.get();
      expect(afterSave.daily_digest.reports.ddd_dimineata).toEqual({
        enabled: true,
        send_at: '09:15',
        channels: { email: true, whatsapp: false, notification: false },
        recipients: [{ email: 'sef@tonik.ro', active: true }],
      });
      expect(afterSave.daily_digest.legacy_migrated).toBe(true);
    } finally {
      t.cleanup();
    }
  });
});
