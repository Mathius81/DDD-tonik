/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useState } from 'react';
import { Stack, Group, Button, TextInput, Alert, Anchor } from '@mantine/core';
import { IconSunrise } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import { DailyReportCard } from './DailyReportCard';
import {
  reportWorkspaces,
  reportPeriods,
  type Settings,
  type DailyReports,
  type DailyReportSettings,
  type ReportId,
} from '../../../shared/schemas/settings';

const WORKSPACE_LABELS: Record<(typeof reportWorkspaces)[number], string> = {
  ddd: 'DDD',
  covoare: 'Covoare',
  cauciucuri: 'Cauciucuri',
};

const PERIOD_LABELS: Record<(typeof reportPeriods)[number], string> = {
  dimineata: 'Dimineața',
  seara: 'Seara',
};

const REPORT_DESCRIPTIONS: Record<ReportId, string> = {
  ddd_dimineata: 'Planul zilei de azi: programări, scadențe, restanțe.',
  ddd_seara: 'Pregătire pentru mâine: ce e programat și ce ajunge la termen.',
  covoare_dimineata: 'Comenzi în lucru, gata de livrat și preluate astăzi.',
  covoare_seara: 'Comenzi cu termen mâine și cele încă în așteptare de livrare.',
  cauciucuri_dimineata: 'Seturile mai vechi aflate în depozit — candidați pentru reminder.',
  cauciucuri_seara: 'Recapitulare a seturilor intrate astăzi în depozit.',
};

export function RaportZilnicTab({
  settings,
  onSaved,
  goToEmail,
}: {
  settings: Settings;
  onSaved: () => void;
  goToEmail: () => void;
}) {
  const [reports, setReports] = useState<DailyReports>(settings.daily_digest.reports);
  const [ownerPhone, setOwnerPhone] = useState(settings.daily_digest.owner_whatsapp_phone);
  const [sendingId, setSendingId] = useState<ReportId | null>(null);
  const [saving, setSaving] = useState(false);

  const smtpConfigured = !!settings.smtp.host;
  const ownerPhoneConfigured = !!ownerPhone.trim();

  const patchReport = (id: ReportId, patch: Partial<DailyReportSettings>) => {
    setReports((rs) => ({ ...rs, [id]: { ...rs[id], ...patch } }));
  };

  const save = async (): Promise<boolean> => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        daily_digest: {
          ...settings.daily_digest,
          owner_whatsapp_phone: ownerPhone.trim(),
          reports,
        },
      }),
      'Salvat.',
    );
    if (saved) onSaved();
    return !!saved;
  };

  const sendNow = async (id: ReportId) => {
    setSendingId(id);
    const ok = await save();
    if (!ok) {
      setSendingId(null);
      return;
    }
    const result = await runMutation<{ sent: boolean; empty: boolean }>(
      ddd.settings.sendDigestNow({ report: id }),
    );
    if (result) {
      if (result.empty) {
        notifications.show({
          color: 'blue',
          message: 'Nu era nimic de raportat acum — nu s-a trimis nimic (comportament normal).',
        });
      } else if (result.sent) {
        notifications.show({ color: 'teal', message: 'Raportul a fost trimis pe canalele activate.' });
      }
    }
    setSendingId(null);
  };

  const saveAll = async () => {
    setSaving(true);
    await save();
    setSaving(false);
  };

  return (
    <Stack gap="var(--sp-4)">
      <SectionCard
        maw={900}
        title="Rapoarte zilnice"
        description="Fiecare spațiu de lucru are propriile rapoarte, complet independente: unul dimineața (ce e de făcut azi) și unul seara (pregătire pentru mâine). Alege ora, canalele și destinatarii pentru fiecare, separat."
        icon={<IconSunrise size={21} stroke={1.7} />}
      >
        <Stack gap="var(--sp-4)">
          {!smtpConfigured && (
            <Alert color="yellow" variant="light">
              Rapoartele pe email folosesc serverul de email al firmei.{' '}
              <Anchor size="var(--fs-body)" onClick={goToEmail}>
                Configurează mai întâi emailul
              </Anchor>
              .
            </Alert>
          )}
          <TextInput
            label="Numărul tău de WhatsApp"
            description="Folosit de toate rapoartele cu canalul WhatsApp activat — raportul se trimite la ACEST număr, nu la un client."
            placeholder="ex.: 07xxxxxxxx"
            value={ownerPhone}
            onChange={(e) => setOwnerPhone(e.currentTarget.value)}
            maw={280}
          />
        </Stack>
      </SectionCard>

      {reportWorkspaces.map((workspace) => (
        <SectionCard key={workspace} maw={900} title={WORKSPACE_LABELS[workspace]}>
          <Group align="stretch" gap="var(--sp-4)" wrap="wrap">
            {reportPeriods.map((period) => {
              const id = `${workspace}_${period}` as ReportId;
              return (
                <DailyReportCard
                  key={id}
                  label={PERIOD_LABELS[period]}
                  description={REPORT_DESCRIPTIONS[id]}
                  report={reports[id]}
                  onChange={(patch) => patchReport(id, patch)}
                  whatsappMode={settings.whatsapp.mode}
                  ownerPhoneConfigured={ownerPhoneConfigured}
                  smtpConfigured={smtpConfigured}
                  onSendNow={() => sendNow(id)}
                  sending={sendingId === id}
                />
              );
            })}
          </Group>
        </SectionCard>
      ))}

      <Group justify="flex-end">
        <Button loading={saving} onClick={saveAll}>
          Salvează
        </Button>
      </Group>
    </Stack>
  );
}
