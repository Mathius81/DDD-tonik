import { useState } from 'react';
import {
  Button,
  Stack,
  Group,
  Switch,
  TextInput,
  Text,
  Alert,
  Anchor,
  ActionIcon,
  Table,
} from '@mantine/core';
import { IconSunrise, IconSend, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import { StatusBadge } from '../../components/StatusBadge';
import type { Settings, DigestRecipient } from '../../../shared/schemas/settings';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

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
  const [recipients, setRecipients] = useState<DigestRecipient[]>(
    settings.daily_digest.recipients,
  );
  const [newEmail, setNewEmail] = useState('');
  const [sendAt, setSendAt] = useState(settings.daily_digest.send_at);
  const [sending, setSending] = useState(false);

  const smtpConfigured = !!settings.smtp.host;
  const activeCount = recipients.filter((r) => r.active).length;

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      notifications.show({ color: 'red', message: 'Adresa de email nu pare validă.' });
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === email)) {
      notifications.show({ color: 'red', message: 'Adresa există deja în listă.' });
      return;
    }
    setRecipients((rs) => [...rs, { email, active: true }]);
    setNewEmail('');
  };

  const save = async (): Promise<boolean> => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        daily_digest: { enabled, email: '', recipients, send_at: sendAt || '08:00' },
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
    await runMutation(
      ddd.settings.sendDigestNow(),
      'Raportul a fost trimis către destinatarii activi. Verifică inbox-ul.',
    );
    setSending(false);
  };

  return (
    <SectionCard
      maw={640}
      title="Raport zilnic"
      description="În fiecare dimineață, destinatarii activi primesc pe email planul zilei: programările, scadențele de azi, restanțele și ce urmează în 7 zile."
      icon={<IconSunrise size={21} stroke={1.7} />}
      titleRight={
        enabled && activeCount > 0 ? (
          <StatusBadge tone="success">
            {activeCount === 1 ? '1 destinatar activ' : `${activeCount} destinatari activi`}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Oprit</StatusBadge>
        )
      }
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

        <Group align="flex-end">
          <Switch
            label="Trimite raportul zilnic"
            checked={enabled}
            onChange={(e) => setEnabled(e.currentTarget.checked)}
            style={{ flex: 1 }}
          />
          <TextInput
            label="Ora trimiterii"
            placeholder="08:00"
            value={sendAt}
            onChange={(e) => setSendAt(e.currentTarget.value)}
            w={110}
          />
        </Group>

        <div>
          <Text size="var(--fs-small)" fw={550} mb={6}>
            Destinatari
          </Text>
          {recipients.length === 0 ? (
            <Text size="var(--fs-small)" c="var(--text-faint)" mb="var(--sp-2)">
              Niciun destinatar încă — adaugă primul email mai jos.
            </Text>
          ) : (
            <Table verticalSpacing={4}>
              <Table.Tbody>
                {recipients.map((r, i) => (
                  <Table.Tr key={r.email}>
                    <Table.Td>
                      <Text
                        size="var(--fs-body)"
                        c={r.active ? undefined : 'var(--text-faint)'}
                        td={r.active ? undefined : 'line-through'}
                      >
                        {r.email}
                      </Text>
                    </Table.Td>
                    <Table.Td w={110}>
                      {r.active ? (
                        <StatusBadge tone="success">Activ</StatusBadge>
                      ) : (
                        <StatusBadge tone="neutral">Oprit</StatusBadge>
                      )}
                    </Table.Td>
                    <Table.Td w={90} align="right">
                      <Group gap={4} justify="flex-end" wrap="nowrap">
                        <Switch
                          size="xs"
                          checked={r.active}
                          onChange={(e) => {
                            const active = e.currentTarget.checked;
                            setRecipients((rs) =>
                              rs.map((x, j) => (j === i ? { ...x, active } : x)),
                            );
                          }}
                          aria-label={r.active ? 'Oprește trimiterea' : 'Pornește trimiterea'}
                        />
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size="sm"
                          onClick={() => setRecipients((rs) => rs.filter((_, j) => j !== i))}
                          aria-label="Șterge destinatarul"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Group gap="var(--sp-2)" mt="var(--sp-2)">
            <TextInput
              placeholder="ex.: marius@exemplu.ro"
              value={newEmail}
              onChange={(e) => setNewEmail(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRecipient())}
              style={{ flex: 1, maxWidth: 320 }}
            />
            <Button variant="default" leftSection={<IconPlus size={15} />} onClick={addRecipient}>
              Adaugă
            </Button>
          </Group>
        </div>

        <Text size="var(--fs-small)" c="var(--text-muted)">
          Raportul pleacă doar către destinatarii activi. Dacă PC-ul e oprit la ora setată,
          se trimite la prima pornire din acea zi.
        </Text>

        <Group justify="space-between">
          <Button
            variant="default"
            leftSection={<IconSend size={16} />}
            loading={sending}
            disabled={!smtpConfigured || activeCount === 0}
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
