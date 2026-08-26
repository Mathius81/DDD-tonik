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
import { Stack, Group, Paper, Text, TextInput, Textarea, Select, Switch, Button, Table } from '@mantine/core';
import { IconTemplate, IconPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ddd } from '../../api/ddd';
import { runMutation, useIpcQuery } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import { StatusBadge } from '../../components/StatusBadge';
import { templateChannels, templateVariables, type MessageTemplate } from '../../../shared/schemas/message';

type TemplateChannel = (typeof templateChannels)[number];
type TemplateVariable = (typeof templateVariables)[number];

const CHANNEL_LABELS: Record<TemplateChannel, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
};

const VARIABLE_LABELS: Record<TemplateVariable, string> = {
  contact_name: 'Numele persoanei de contact',
  association_name: 'Numele asociației',
  service_name: 'Numele serviciului',
  due_date: 'Data scadentă',
  days_remaining: 'Zile rămase până la termen',
  company_name: 'Numele firmei',
  company_phone: 'Telefonul firmei',
};

/** Date de exemplu, folosite DOAR pentru previzualizarea locală din această pagină. */
const SAMPLE_VALUES: Record<TemplateVariable, string> = {
  contact_name: 'Ion Popescu',
  association_name: 'Asociația de Proprietari Exemplu 12',
  service_name: 'Dezinsecție',
  due_date: '15.09.2026',
  days_remaining: '7',
  company_name: 'Tonik SRL',
  company_phone: '0712 345 678',
};

/**
 * Previzualizare LOCALĂ, independentă de motorul de randare din main (`template-render.ts`,
 * nu e modificat) — doar pentru a arăta utilizatorului, în timp real, cum arată mesajul.
 */
function previewBody(body: string): string {
  return body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, rawKey: string) => {
    const key = rawKey as TemplateVariable;
    return key in SAMPLE_VALUES ? SAMPLE_VALUES[key] : match;
  });
}

interface FormState {
  id: number | null;
  name: string;
  channel: TemplateChannel;
  subject: string;
  body: string;
  active: boolean;
}

const EMPTY_FORM: FormState = { id: null, name: '', channel: 'whatsapp', subject: '', body: '', active: true };

/**
 * Prefixul șabloanelor tehnice, folosite intern de aplicație (ex. ancora pentru
 * maparea Meta a reminderelor de sezon la cauciucuri). Nu se afișează aici:
 * activarea lor din greșeală ar dezactiva șablonul real al canalului, iar
 * reminderele către asociații ar pleca cu un text tehnic.
 */
const PREFIX_SABLON_TEHNIC = 'NU ACTIVA';

export function SabloaneTab() {
  const { data: allTemplates, reload } = useIpcQuery<MessageTemplate[]>(
    () => ddd.messages.templates.list(),
    [],
  );
  const templates = allTemplates?.filter((t) => !t.name.startsWith(PREFIX_SABLON_TEHNIC));
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const startNew = (channel: TemplateChannel) => setForm({ ...EMPTY_FORM, channel });

  const startEdit = (t: MessageTemplate) => {
    if (t.channel === 'sms') return; // canalul SMS nu are UI de gestionare (fără implementare reală, v1)
    setForm({ id: t.id, name: t.name, channel: t.channel, subject: t.subject ?? '', body: t.body, active: t.active });
  };

  const save = async () => {
    if (!form.name.trim()) {
      notifications.show({ color: 'red', message: 'Completează denumirea șablonului.' });
      return;
    }
    if (!form.body.trim()) {
      notifications.show({ color: 'red', message: 'Completează conținutul șablonului.' });
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      channel: form.channel,
      subject: form.channel === 'email' ? form.subject.trim() || null : null,
      body: form.body,
    };
    const saved =
      form.id == null
        ? await runMutation<MessageTemplate>(ddd.messages.templates.create(payload), 'Șablonul a fost creat.')
        : await runMutation<MessageTemplate>(
            ddd.messages.templates.update({ ...payload, id: form.id, active: form.active }),
            'Șablonul a fost salvat.',
          );

    if (saved) {
      // Un singur șablon poate fi activ pe fiecare canal — dacă acesta devine activ,
      // dezactivăm automat celelalte de pe același canal (fără să atingem motorul de
      // randare/selecție din main, doar prin IPC-ul existent de update).
      if (saved.active && templates) {
        const others = templates.filter(
          (t) => t.channel === saved.channel && t.id !== saved.id && t.active,
        );
        for (const other of others) {
          await ddd.messages.templates.update({
            id: other.id,
            name: other.name,
            channel: other.channel,
            subject: other.subject,
            body: other.body,
            active: false,
          });
        }
      }
      setForm(EMPTY_FORM);
      reload();
    }
    setSaving(false);
  };

  return (
    <Stack gap="var(--sp-4)">
      <SectionCard
        maw={900}
        title="Șabloane de mesaje"
        description="Șablonul ACTIV de pe fiecare canal este cel folosit automat la trimiterea remindere-lor. Doar unul poate fi activ per canal — activarea unui șablon îl dezactivează automat pe cel anterior."
        icon={<IconTemplate size={21} stroke={1.7} />}
      >
        <Stack gap="var(--sp-4)">
          {templateChannels.map((channel) => {
            const channelTemplates = (templates ?? []).filter((t) => t.channel === channel);
            return (
              <div key={channel}>
                <Group justify="space-between" mb={6}>
                  <Text fw={600} size="var(--fs-body)">
                    {CHANNEL_LABELS[channel]}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="default"
                    leftSection={<IconPlus size={13} />}
                    onClick={() => startNew(channel)}
                  >
                    Șablon nou
                  </Button>
                </Group>
                {channelTemplates.length === 0 ? (
                  <Text size="var(--fs-small)" c="var(--text-faint)">
                    Niciun șablon încă pe acest canal.
                  </Text>
                ) : (
                  <Table verticalSpacing={4}>
                    <Table.Tbody>
                      {channelTemplates.map((t) => (
                        <Table.Tr key={t.id}>
                          <Table.Td>
                            <Text size="var(--fs-body)">{t.name}</Text>
                          </Table.Td>
                          <Table.Td w={90}>
                            {t.active ? (
                              <StatusBadge tone="success">Activ</StatusBadge>
                            ) : (
                              <StatusBadge tone="neutral">Inactiv</StatusBadge>
                            )}
                          </Table.Td>
                          <Table.Td w={90} align="right">
                            <Button size="compact-xs" variant="subtle" onClick={() => startEdit(t)}>
                              Editează
                            </Button>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
              </div>
            );
          })}
        </Stack>
      </SectionCard>

      <SectionCard maw={900} title={form.id == null ? 'Șablon nou' : `Editează șablonul „${form.name}”`}>
        <Stack gap="var(--sp-4)">
          <Group align="flex-end">
            <TextInput
              label="Denumire"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.currentTarget.value }))}
              style={{ flex: 1 }}
            />
            <Select
              label="Canal"
              data={templateChannels.map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
              value={form.channel}
              onChange={(v) => v && setForm((f) => ({ ...f, channel: v as TemplateChannel }))}
              allowDeselect={false}
              w={160}
            />
          </Group>

          {form.channel === 'email' && (
            <TextInput
              label="Subiect email"
              value={form.subject}
              onChange={(e) => setForm((f) => ({ ...f, subject: e.currentTarget.value }))}
            />
          )}

          <Textarea
            label="Conținut"
            minRows={6}
            autosize
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.currentTarget.value }))}
          />

          <div>
            <Text size="var(--fs-small)" fw={550} mb={4}>
              Variabile disponibile
            </Text>
            <Table verticalSpacing={2}>
              <Table.Tbody>
                {templateVariables.map((v) => (
                  <Table.Tr key={v}>
                    <Table.Td w={170}>
                      <Text size="var(--fs-small)" ff="monospace">
                        {`{{${v}}}`}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="var(--fs-small)" c="var(--text-muted)">
                        {VARIABLE_LABELS[v]}
                      </Text>
                    </Table.Td>
                    <Table.Td w={90} align="right">
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        onClick={() => setForm((f) => ({ ...f, body: `${f.body}{{${v}}}` }))}
                      >
                        Inserează
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>

          {form.id != null && (
            <Switch
              label="Șablon activ (folosit automat la trimitere)"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.currentTarget.checked }))}
            />
          )}

          <div>
            <Text size="var(--fs-small)" fw={550} mb={4}>
              Previzualizare (cu date de exemplu)
            </Text>
            <Paper withBorder p="var(--sp-3)" style={{ whiteSpace: 'pre-wrap' }}>
              <Text size="var(--fs-body)" c={form.body ? undefined : 'var(--text-faint)'}>
                {form.body
                  ? previewBody(form.body)
                  : 'Scrie conținutul mai sus ca să vezi previzualizarea aici.'}
              </Text>
            </Paper>
          </div>

          <Group justify="space-between">
            {form.id != null ? (
              <Button variant="subtle" onClick={() => setForm(EMPTY_FORM)}>
                Anulează editarea
              </Button>
            ) : (
              <span />
            )}
            <Button loading={saving} onClick={save}>
              {form.id == null ? 'Creează șablon' : 'Salvează'}
            </Button>
          </Group>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
