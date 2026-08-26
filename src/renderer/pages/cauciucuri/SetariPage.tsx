/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect } from 'react';
import { Stack, Card, Switch, Text, Textarea, Button, Group, Select, NumberInput, Divider, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconInfoCircle, IconSnowflake, IconSun } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import {
  defaultTyreSeasonReminderSettings,
  renderTyreSeasonReminderMessage,
  type TyreSeasonReminderSettings,
} from '../../../shared/schemas/tyre';

const months = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
const monthOptions = months.map((label, i) => ({ value: String(i + 1), label }));

/**
 * Configurarea reminder-elor automate de sezon — vezi și pagina „Remindere”
 * (acolo se văd clienții eligibili acum și se trimit mesajele; aici doar se
 * setează fereastra de timp și textul mesajului).
 */
export function SetariPage() {
  const { data: settings, reload } = useIpcQuery<TyreSeasonReminderSettings>(
    () => ddd.tyres.seasonReminders.getSettings(),
    [],
  );

  const form = useForm<TyreSeasonReminderSettings>({
    initialValues: defaultTyreSeasonReminderSettings,
  });

  useEffect(() => {
    if (settings) form.setValues(settings);
  }, [settings]);

  if (!settings) return null;

  const submit = form.onSubmit(async (values) => {
    const payload: TyreSeasonReminderSettings = {
      enabled: !!values.enabled,
      windows: {
        iarna: {
          start: { month: Number(values.windows.iarna.start.month), day: Number(values.windows.iarna.start.day) },
          end: { month: Number(values.windows.iarna.end.month), day: Number(values.windows.iarna.end.day) },
        },
        vara: {
          start: { month: Number(values.windows.vara.start.month), day: Number(values.windows.vara.start.day) },
          end: { month: Number(values.windows.vara.end.month), day: Number(values.windows.vara.end.day) },
        },
      },
      message_template: values.message_template,
    };
    const saved = await runMutation(ddd.tyres.seasonReminders.saveSettings(payload), 'Setările au fost salvate.');
    if (saved) reload();
  });

  const preview = renderTyreSeasonReminderMessage(form.values.message_template || '', {
    name: 'Ion Popescu',
    season: 'iarna',
  });

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Setări — Remindere de sezon"
        description="Când pornește fereastra de sezon, clienții eligibili primesc automat un mesaj — o singură dată pe sezon."
      />

      <form onSubmit={submit}>
        <Stack gap="var(--sp-4)">
          <Card padding="var(--sp-4)">
            <Group justify="space-between">
              <div>
                <Text fw={600}>Remindere automate active</Text>
                <Text size="sm" c="dimmed">
                  Dacă e oprit, ferestrele de mai jos nu declanșează nimic automat.
                </Text>
              </div>
              <Switch size="md" {...form.getInputProps('enabled', { type: 'checkbox' })} />
            </Group>
          </Card>

          <Group grow align="stretch">
            <Card padding="var(--sp-4)">
              <Group gap={8} mb="sm">
                <IconSnowflake size={18} color="var(--accent)" />
                <Text fw={600}>Fereastra de iarnă</Text>
              </Group>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Start
              </Text>
              <Group grow mb="sm">
                <Select
                  data={monthOptions}
                  allowDeselect={false}
                  value={String(form.values.windows.iarna.start.month)}
                  onChange={(v) => form.setFieldValue('windows.iarna.start.month', v ? Number(v) : 1)}
                />
                <NumberInput min={1} max={31} {...form.getInputProps('windows.iarna.start.day')} />
              </Group>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Sfârșit
              </Text>
              <Group grow>
                <Select
                  data={monthOptions}
                  allowDeselect={false}
                  value={String(form.values.windows.iarna.end.month)}
                  onChange={(v) => form.setFieldValue('windows.iarna.end.month', v ? Number(v) : 1)}
                />
                <NumberInput min={1} max={31} {...form.getInputProps('windows.iarna.end.day')} />
              </Group>
            </Card>

            <Card padding="var(--sp-4)">
              <Group gap={8} mb="sm">
                <IconSun size={18} color="orange" />
                <Text fw={600}>Fereastra de vară</Text>
              </Group>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Start
              </Text>
              <Group grow mb="sm">
                <Select
                  data={monthOptions}
                  allowDeselect={false}
                  value={String(form.values.windows.vara.start.month)}
                  onChange={(v) => form.setFieldValue('windows.vara.start.month', v ? Number(v) : 1)}
                />
                <NumberInput min={1} max={31} {...form.getInputProps('windows.vara.start.day')} />
              </Group>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Sfârșit
              </Text>
              <Group grow>
                <Select
                  data={monthOptions}
                  allowDeselect={false}
                  value={String(form.values.windows.vara.end.month)}
                  onChange={(v) => form.setFieldValue('windows.vara.end.month', v ? Number(v) : 1)}
                />
                <NumberInput min={1} max={31} {...form.getInputProps('windows.vara.end.day')} />
              </Group>
            </Card>
          </Group>

          <Card padding="var(--sp-4)">
            <Text fw={600} mb={4}>
              Mesajul trimis
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Poți folosi <code>{'{nume}'}</code> (numele clientului) și <code>{'{sezon}'}</code> (vară/iarnă).
            </Text>
            <Textarea autosize minRows={3} {...form.getInputProps('message_template')} />
            <Divider my="sm" label="Previzualizare" labelPosition="left" />
            <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
              {preview || 'Scrie un mesaj mai sus.'}
            </Alert>
          </Card>

          <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" title="Mod WhatsApp automat (Cloud API)">
            <Text size="sm">
              Dacă WhatsApp e setat pe modul automat (Setări → WhatsApp), majoritatea clienților de
              sezon nu au mai scris nimic în ultimele 24h, deci mesajul liber nu poate pleca automat
              — e nevoie de un șablon aprobat de Meta. Configurează maparea din{' '}
              <b>Setări → WhatsApp → Mapare template-uri</b> pentru șablonul{' '}
              <i>„NU ACTIVA — Cauciucuri: reminder sezon (mapare Meta)”</i>. Fără mapare, trimiterea
              automată eșuează vizibil (badge roșu în pagina Remindere), nu se pierde tăcut.
            </Text>
          </Alert>

          <Group justify="flex-end">
            <Button type="submit">Salvează setările</Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
