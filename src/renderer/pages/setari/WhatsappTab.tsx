import { useEffect, useState } from 'react';
import {
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Group,
  Radio,
  Alert,
  Badge,
  Divider,
  MultiSelect,
  Table,
  Text,
  ActionIcon,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import {
  IconBrandWhatsapp,
  IconInfoCircle,
  IconPlugConnected,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, useIpcQuery } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings, WhatsappTemplateMap } from '../../../shared/schemas/settings';
import { templateVariables, type MessageTemplate } from '../../../shared/schemas/message';

const modeLabels: Record<string, string> = {
  assisted: 'Asistat',
  cloud_api: 'Automat (Cloud API)',
  disabled: 'Dezactivat',
};

/** Etichete în română pentru variabilele disponibile în template-uri (vezi template-render.ts). */
const variableLabels: Record<string, string> = {
  contact_name: 'Nume contact',
  association_name: 'Asociație',
  service_name: 'Serviciu',
  due_date: 'Dată scadentă',
  days_remaining: 'Zile rămase',
  company_name: 'Nume firmă',
  company_phone: 'Telefon firmă',
};

const variableOptions = templateVariables.map((v) => ({ value: v, label: variableLabels[v] ?? v }));

interface MappingDraft {
  meta_template_name: string;
  language: string;
  variables: string[];
}

export function WhatsappTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [token, setToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, MappingDraft>>({});
  const [savingMappingId, setSavingMappingId] = useState<number | null>(null);
  const form = useForm({ initialValues: settings.whatsapp });

  const { data: templates } = useIpcQuery<MessageTemplate[]>(() => ddd.messages.templates.list(), []);
  const { data: maps, reload: reloadMaps } = useIpcQuery<WhatsappTemplateMap[]>(
    () => ddd.settings.whatsappTemplateMap.list(),
    [],
  );

  // Inițializăm draft-urile din mapările salvate — fără să suprascriem ce editează
  // utilizatorul chiar acum (lista se poate reîncărca automat la orice schimbare de date).
  useEffect(() => {
    if (!maps) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const m of maps) {
        if (!next[m.message_template_id]) {
          next[m.message_template_id] = {
            meta_template_name: m.meta_template_name,
            language: m.language,
            variables: m.variables,
          };
        }
      }
      return next;
    });
  }, [maps]);

  const whatsappTemplates = (templates ?? []).filter((t) => t.channel === 'whatsapp');

  const draftFor = (templateId: number): MappingDraft =>
    drafts[templateId] ?? { meta_template_name: '', language: 'ro', variables: [] };

  const updateDraft = (templateId: number, patch: Partial<MappingDraft>) => {
    setDrafts((prev) => ({ ...prev, [templateId]: { ...draftFor(templateId), ...patch } }));
  };

  /** Salvează setările + tokenul (dacă a fost introdus). Întoarce true la succes. */
  const persist = async (values: typeof form.values, successMessage?: string): Promise<boolean> => {
    if (token) {
      const ok = await runMutation(
        ddd.settings.setSecret({ key: 'whatsapp_access_token', value: token }),
      );
      if (ok === null) return false;
      values.has_access_token = true;
    }
    const saved = await runMutation(
      ddd.settings.update({ ...settings, whatsapp: values }),
      successMessage,
    );
    if (saved) {
      setToken('');
      onSaved();
    }
    return !!saved;
  };

  const submit = form.onSubmit(async (values) => {
    await persist(values, 'Setările WhatsApp au fost salvate.');
  });

  // Testul salvează configurația (Phone Number ID, Business Account ID, token) ca să
  // poată fi verificată — dar NU activează modul „Automat" doar pentru că testul a
  // fost apăsat. Dacă verificarea eșuează, utilizatorul nu trebuie să rămână blocat
  // accidental în „Automat" fără credențiale valide; modul se salvează abia după
  // un test reușit (a doua persistare, mai jos).
  const testConnection = async () => {
    setTesting(true);
    const ok = await persist({ ...form.values, mode: settings.whatsapp.mode });
    if (!ok) {
      setTesting(false);
      return;
    }
    const result = await runMutation<{
      ok: boolean;
      displayPhoneNumber: string | null;
      verifiedName: string | null;
    }>(ddd.settings.testWhatsapp());
    setTesting(false);
    if (result) {
      notifications.show({
        color: 'teal',
        message: result.displayPhoneNumber
          ? `Conexiunea funcționează — numărul conectat este ${result.displayPhoneNumber}.`
          : 'Conexiunea cu WhatsApp Business Cloud API funcționează.',
      });
      if (form.values.mode === 'cloud_api' && settings.whatsapp.mode !== 'cloud_api') {
        await persist({ ...form.values, mode: 'cloud_api' }, 'Modul „Automat” a fost activat.');
      }
    }
  };

  const saveMapping = async (templateId: number) => {
    const draft = draftFor(templateId);
    if (!draft.meta_template_name.trim()) {
      notifications.show({
        color: 'red',
        message: 'Completează numele template-ului aprobat de Meta.',
      });
      return;
    }
    setSavingMappingId(templateId);
    const saved = await runMutation(
      ddd.settings.whatsappTemplateMap.upsert({
        message_template_id: templateId,
        meta_template_name: draft.meta_template_name.trim(),
        language: draft.language.trim() || 'ro',
        variables: draft.variables,
      }),
      'Maparea de template a fost salvată.',
    );
    setSavingMappingId(null);
    if (saved) reloadMaps();
  };

  const mode = form.values.mode;

  return (
    <SectionCard
      maw={640}
      title="Configurare WhatsApp"
      description="Alege cum trimiți mesajele WhatsApp către clienți."
      icon={<IconBrandWhatsapp size={21} stroke={1.7} />}
      titleRight={
        <Badge color={mode === 'disabled' ? 'gray' : 'teal'} variant="light">
          {modeLabels[settings.whatsapp.mode]}
        </Badge>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Radio.Group {...form.getInputProps('mode')}>
            <Stack gap="sm" mt={4}>
              <Radio
                value="assisted"
                label="Asistat (recomandat, gratuit)"
                description="Aplicația pregătește mesajul și deschide WhatsApp — tu doar apeși Send."
              />
              <Radio
                value="cloud_api"
                label="Automat — WhatsApp Business Cloud API"
                description="Mesajele pleacă automat, fără intervenția ta. Necesită cont Meta Business."
              />
              <Radio value="disabled" label="Dezactivat" description="Nu se trimit mesaje WhatsApp." />
            </Stack>
          </Radio.Group>

          {mode === 'cloud_api' && (
            <>
              <Divider my={4} />
              <Alert color="yellow" variant="light" icon={<IconInfoCircle size={17} />}>
                Necesită cont WhatsApp Business Platform și un template de mesaj aprobat de Meta.
                Confirmările de livrare/citire nu sunt disponibile în acest mod local.
              </Alert>
              <Group grow align="flex-start">
                <TextInput label="Phone Number ID" {...form.getInputProps('phone_number_id')} />
                <TextInput
                  label="Business Account ID"
                  {...form.getInputProps('business_account_id')}
                />
              </Group>
              <PasswordInput
                label="Access Token"
                placeholder={
                  settings.whatsapp.has_access_token ? '••••••••  (salvat)' : 'Token de acces'
                }
                description="Stocat criptat pe acest calculator"
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
              />

              <Group justify="flex-start">
                <Button
                  variant="default"
                  onClick={testConnection}
                  loading={testing}
                  leftSection={<IconPlugConnected size={17} />}
                >
                  Testează conexiunea
                </Button>
              </Group>

              <Divider label="Mapare template-uri (fallback după 24h)" labelPosition="left" my={4} />
              <Text size="var(--fs-small)" c="var(--text-muted)">
                Dacă fereastra de 24h de conversație s-a închis, Meta acceptă doar template-uri
                aprobate în prealabil. Leagă fiecare template local de WhatsApp de un template
                aprobat pe Meta și alege, în ordine, variabilele care completează {'{{1}}'},{' '}
                {'{{2}}'}... din el.
              </Text>

              {whatsappTemplates.length === 0 ? (
                <Text size="var(--fs-small)" c="var(--text-faint)">
                  Nu există încă niciun template local pentru canalul WhatsApp.
                </Text>
              ) : (
                <Table verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Template local</Table.Th>
                      <Table.Th>Template Meta</Table.Th>
                      <Table.Th w={90}>Limbă</Table.Th>
                      <Table.Th>Variabile (în ordine)</Table.Th>
                      <Table.Th w={50}></Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {whatsappTemplates.map((t) => {
                      const draft = draftFor(t.id);
                      return (
                        <Table.Tr key={t.id}>
                          <Table.Td>
                            <Text size="var(--fs-body)" fw={550}>
                              {t.name}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              placeholder="ex.: reminder_service"
                              value={draft.meta_template_name}
                              onChange={(e) =>
                                updateDraft(t.id, { meta_template_name: e.currentTarget.value })
                              }
                            />
                          </Table.Td>
                          <Table.Td>
                            <TextInput
                              placeholder="ro"
                              value={draft.language}
                              onChange={(e) => updateDraft(t.id, { language: e.currentTarget.value })}
                            />
                          </Table.Td>
                          <Table.Td>
                            <MultiSelect
                              placeholder="Alege variabilele, în ordine"
                              data={variableOptions}
                              value={draft.variables}
                              onChange={(v) => updateDraft(t.id, { variables: v })}
                            />
                          </Table.Td>
                          <Table.Td>
                            <ActionIcon
                              variant="subtle"
                              loading={savingMappingId === t.id}
                              onClick={() => saveMapping(t.id)}
                              aria-label="Salvează maparea"
                            >
                              <IconDeviceFloppy size={16} />
                            </ActionIcon>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              )}
            </>
          )}

          <Group justify="flex-end" mt="sm">
            <Button type="submit">Salvează</Button>
          </Group>
        </Stack>
      </form>
    </SectionCard>
  );
}
