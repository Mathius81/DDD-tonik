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
import {
  Paper,
  Stack,
  Group,
  Switch,
  Checkbox,
  TextInput,
  Text,
  Button,
  ActionIcon,
  Table,
} from '@mantine/core';
import { IconSend, IconPlus, IconTrash } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { StatusBadge } from '../../components/StatusBadge';
import type { DailyReportSettings, DigestRecipient, WhatsappSettings } from '../../../shared/schemas/settings';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function RecipientsEditor({
  recipients,
  onChange,
}: {
  recipients: DigestRecipient[];
  onChange: (recipients: DigestRecipient[]) => void;
}) {
  const [newEmail, setNewEmail] = useState('');

  const add = () => {
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      notifications.show({ color: 'red', message: 'Adresa de email nu pare validă.' });
      return;
    }
    if (recipients.some((r) => r.email.toLowerCase() === email)) {
      notifications.show({ color: 'red', message: 'Adresa există deja în listă.' });
      return;
    }
    onChange([...recipients, { email, active: true }]);
    setNewEmail('');
  };

  return (
    <div>
      {recipients.length > 0 && (
        <Table verticalSpacing={4}>
          <Table.Tbody>
            {recipients.map((r, i) => (
              <Table.Tr key={r.email}>
                <Table.Td>
                  <Text
                    size="var(--fs-small)"
                    c={r.active ? undefined : 'var(--text-faint)'}
                    td={r.active ? undefined : 'line-through'}
                  >
                    {r.email}
                  </Text>
                </Table.Td>
                <Table.Td w={90} align="right">
                  <Group gap={4} justify="flex-end" wrap="nowrap">
                    <Switch
                      size="xs"
                      checked={r.active}
                      onChange={(e) => {
                        const active = e.currentTarget.checked;
                        onChange(recipients.map((x, j) => (j === i ? { ...x, active } : x)));
                      }}
                      aria-label={r.active ? 'Oprește trimiterea' : 'Pornește trimiterea'}
                    />
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => onChange(recipients.filter((_, j) => j !== i))}
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
      <Group gap="var(--sp-2)" mt={recipients.length > 0 ? 'var(--sp-2)' : 0}>
        <TextInput
          placeholder="ex.: marius@exemplu.ro"
          size="sm"
          value={newEmail}
          onChange={(e) => setNewEmail(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}
          style={{ flex: 1, maxWidth: 280 }}
        />
        <Button variant="default" size="sm" leftSection={<IconPlus size={14} />} onClick={add}>
          Adaugă
        </Button>
      </Group>
    </div>
  );
}

function whatsappHint(mode: WhatsappSettings['mode']): string {
  if (mode === 'cloud_api') {
    return 'Se trimite automat pe numărul tău de WhatsApp, prin Cloud API.';
  }
  if (mode === 'assisted') {
    return 'Nu se deschide nimic automat — primești o notificare pe desktop; dă click pe ea ca să deschizi conversația WhatsApp cu raportul deja pregătit.';
  }
  return 'WhatsApp e dezactivat (Setări → WhatsApp) — activează-l ca acest canal să funcționeze.';
}

export function DailyReportCard({
  label,
  description,
  report,
  onChange,
  whatsappMode,
  ownerPhoneConfigured,
  smtpConfigured,
  onSendNow,
  sending,
}: {
  label: string;
  description: string;
  report: DailyReportSettings;
  onChange: (patch: Partial<DailyReportSettings>) => void;
  whatsappMode: WhatsappSettings['mode'];
  ownerPhoneConfigured: boolean;
  smtpConfigured: boolean;
  onSendNow: () => void;
  sending: boolean;
}) {
  const anyChannel = report.channels.email || report.channels.whatsapp || report.channels.notification;

  return (
    <Paper withBorder radius="md" p="var(--sp-4)" style={{ flex: 1, minWidth: 280 }}>
      <Stack gap="var(--sp-3)">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Switch
            label={label}
            description={description}
            checked={report.enabled}
            onChange={(e) => onChange({ enabled: e.currentTarget.checked })}
          />
          {report.enabled ? (
            <StatusBadge tone="success">Activ</StatusBadge>
          ) : (
            <StatusBadge tone="neutral">Oprit</StatusBadge>
          )}
        </Group>

        <TextInput
          label="Ora trimiterii"
          placeholder="08:00"
          value={report.send_at}
          onChange={(e) => onChange({ send_at: e.currentTarget.value })}
          w={110}
        />

        <div>
          <Text size="var(--fs-small)" fw={550} mb={6}>
            Canale de trimitere
          </Text>
          <Stack gap={6}>
            <Checkbox
              label="Email"
              checked={report.channels.email}
              onChange={(e) =>
                onChange({ channels: { ...report.channels, email: e.currentTarget.checked } })
              }
            />
            {report.channels.email && !smtpConfigured && (
              <Text size="var(--fs-small)" c="var(--warning)" ml={28}>
                Emailul nu e configurat încă (Setări → Email).
              </Text>
            )}
            {report.channels.email && (
              <div style={{ marginLeft: 28 }}>
                <RecipientsEditor
                  recipients={report.recipients}
                  onChange={(recipients) => onChange({ recipients })}
                />
              </div>
            )}

            <Checkbox
              label="WhatsApp (către tine)"
              checked={report.channels.whatsapp}
              onChange={(e) =>
                onChange({ channels: { ...report.channels, whatsapp: e.currentTarget.checked } })
              }
            />
            {report.channels.whatsapp && (
              <Text size="var(--fs-small)" c="var(--text-muted)" ml={28}>
                {whatsappHint(whatsappMode)}
              </Text>
            )}
            {report.channels.whatsapp && !ownerPhoneConfigured && (
              <Text size="var(--fs-small)" c="var(--warning)" ml={28}>
                Completează numărul tău de WhatsApp mai jos.
              </Text>
            )}

            <Checkbox
              label="Notificare pe desktop"
              checked={report.channels.notification}
              onChange={(e) =>
                onChange({ channels: { ...report.channels, notification: e.currentTarget.checked } })
              }
            />
            {report.channels.notification && (
              <Text size="var(--fs-small)" c="var(--text-muted)" ml={28}>
                Apare ca notificare a sistemului de operare; click pe ea te duce direct în aplicație.
              </Text>
            )}
          </Stack>
        </div>

        <Group justify="flex-end">
          <Button
            variant="default"
            size="sm"
            leftSection={<IconSend size={14} />}
            loading={sending}
            disabled={!anyChannel}
            onClick={onSendNow}
          >
            Trimite acum, de probă
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
