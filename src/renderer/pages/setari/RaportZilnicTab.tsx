import { useState } from 'react';
import { Button, Stack, Group, Switch, TextInput, Text, Alert, Anchor } from '@mantine/core';
import { IconSunrise, IconSend } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';

export function RaportZilnicTab({
  settings,
  onSaved,
  goToEmail,
}: {
  settings: Settings;
  onSaved: () => void;
  goToEmail: () => void;
}) {
  const [enabled, setEnabled] = useState(settings.daily_digest.enabled);
  const [email, setEmail] = useState(settings.daily_digest.email);
  const [sendAt, setSendAt] = useState(settings.daily_digest.send_at);
  const [sending, setSending] = useState(false);

  const smtpConfigured = !!settings.smtp.host;

  const save = async (): Promise<boolean> => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        daily_digest: { enabled, email: email.trim(), send_at: sendAt || '08:00' },
      }),
      'Salvat.',
    );
    if (saved) onSaved();
    return !!saved;
  };

  const sendNow = async () => {
    setSending(true);
    const ok = await save();
    if (!ok) {
      setSending(false);
      return;
    }
    await runMutation(ddd.settings.sendDigestNow(), 'Raportul a fost trimis. Verifică inbox-ul.');
    setSending(false);
  };

  return (
    <SectionCard
      maw={640}
      title="Raport zilnic"
      description="În fiecare dimineață primești pe email planul zilei: programările, scadențele de azi, restanțele și ce urmează în 7 zile."
      icon={<IconSunrise size={21} stroke={1.7} />}
    >
      <Stack gap="var(--sp-4)">
        {!smtpConfigured && (
          <Alert color="yellow" variant="light">
            Raportul se trimite prin serverul de email al firmei.{' '}
            <Anchor size="var(--fs-body)" onClick={goToEmail}>
              Configurează mai întâi emailul
            </Anchor>
            .
          </Alert>
        )}
        <Switch
          label="Trimite raportul zilnic"
          description="Dacă PC-ul e oprit la ora setată, raportul pleacă la prima pornire din acea zi."
          checked={enabled}
          onChange={(e) => setEnabled(e.currentTarget.checked)}
        />
        <Group grow align="flex-start">
          <TextInput
            label="Trimite către"
            placeholder="ex.: marius@exemplu.ro"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
          />
          <TextInput
            label="Ora trimiterii"
            placeholder="08:00"
            value={sendAt}
            onChange={(e) => setSendAt(e.currentTarget.value)}
            w={120}
          />
        </Group>
        <Text size="var(--fs-small)" c="var(--text-muted)">
          Aplicația verifică la fiecare 10 minute — raportul sosește în jurul orei setate.
        </Text>
        <Group justify="space-between">
          <Button
            variant="default"
            leftSection={<IconSend size={16} />}
            loading={sending}
            disabled={!smtpConfigured || !email.trim()}
            onClick={sendNow}
          >
            Trimite acum, de probă
          </Button>
          <Button onClick={save}>Salvează</Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
