import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  Select,
  MultiSelect,
  NumberInput,
  Textarea,
  Text,
  Card,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { ddd } from '../../api/ddd';
import { unwrap } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import type { Service } from '../../../shared/schemas/service';
import type { FollowupListItem } from '../../../shared/schemas/followup';
import type { Association } from '../../../shared/schemas/association';

/** Mantine 9 întoarce datele ca string 'YYYY-MM-DD'; acceptăm și Date pentru siguranță. */
function toIso(d: Date | string | null): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso(): string {
  return toIso(new Date())!;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  /** Preselectat când se deschide din fișa asociației. */
  associationId?: number;
  /** Precompletat când vine din „Marchează intervenția efectuată”. */
  fromFollowup?: FollowupListItem | null;
}

export function InterventionFormModal({
  opened,
  onClose,
  onSaved,
  associationId,
  fromFollowup,
}: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [associations, setAssociations] = useState<Association[]>([]);
  /** Interval (luni) per serviciu selectat, prefillat cu valoarea implicită a serviciului. */
  const [intervals, setIntervals] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const form = useForm({
    initialValues: {
      association_id: associationId ? String(associationId) : '',
      service_ids: [] as string[],
      performed_date: todayIso() as string | null,
      notes: '',
    },
    validate: {
      association_id: (v) => (v ? null : 'Alege asociația'),
      service_ids: (v) => (v.length > 0 ? null : 'Alege cel puțin un serviciu'),
      performed_date: (v) => (v ? null : 'Data intervenției este obligatorie'),
    },
  });

  // Încarcă serviciile și, dacă nu avem asociație fixă, lista de asociații.
  useEffect(() => {
    if (!opened) return;
    unwrap<Service[]>(ddd.services.list()).then((list) =>
      setServices(list.filter((s) => s.active)),
    );
    if (!associationId) {
      unwrap<{ items: Association[] }>(
        ddd.associations.list({ status: 'active', page: 1, pageSize: 200 }),
      ).then((r) => setAssociations(r.items));
    }
  }, [opened, associationId]);

  // Precompletare din follow-up programat.
  useEffect(() => {
    if (!opened) return;
    if (fromFollowup) {
      form.setValues({
        association_id: String(fromFollowup.association_id),
        service_ids: [String(fromFollowup.service_id)],
        performed_date: fromFollowup.scheduled_date ?? todayIso(),
      });
    } else if (associationId) {
      form.setFieldValue('association_id', String(associationId));
    }
  }, [opened, fromFollowup, associationId]);

  // Intervalele implicite pentru serviciile nou-selectate (nu suprascriem ce a editat utilizatorul).
  const serviceIds = form.values.service_ids;
  useEffect(() => {
    setIntervals((prev) => {
      const next = { ...prev };
      for (const id of serviceIds) {
        if (!(id in next)) {
          const s = services.find((x) => String(x.id) === id);
          next[id] = s?.default_interval_months ?? 3;
        }
      }
      return next;
    });
  }, [serviceIds, services]);

  // Previzualizare due date per serviciu, calculată în main (aceeași logică de la salvare).
  const performedIso = toIso(form.values.performed_date);
  useEffect(() => {
    if (!performedIso || serviceIds.length === 0) {
      setPreviews({});
      return;
    }
    let cancelled = false;
    Promise.all(
      serviceIds.map(async (id) => {
        const months = intervals[id];
        if (!months) return [id, ''] as const;
        try {
          const r = await unwrap<{ due_date: string }>(
            ddd.interventions.previewDueDate({
              performed_date: performedIso,
              interval_months: months,
            }),
          );
          return [id, r.due_date] as const;
        } catch {
          return [id, ''] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setPreviews(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [performedIso, serviceIds, intervals]);

  const associationOptions = useMemo(
    () => associations.map((a) => ({ value: String(a.id), label: a.name })),
    [associations],
  );

  const submit = form.onSubmit(async (values) => {
    setSaving(true);
    const performed = toIso(values.performed_date)!;
    const failed: string[] = [];
    let saved = 0;

    // O intervenție per serviciu selectat; fiecare cu tranzacția și follow-up-ul ei.
    for (const sid of values.service_ids) {
      const result = await ddd.interventions.create({
        association_id: Number(values.association_id),
        service_id: Number(sid),
        performed_date: performed,
        interval_months: intervals[sid] ?? 3,
        notes: values.notes || null,
        completes_followup_id:
          fromFollowup && String(fromFollowup.service_id) === sid ? fromFollowup.id : null,
      });
      if (result.ok) {
        saved++;
      } else {
        const name = services.find((s) => String(s.id) === sid)?.name ?? sid;
        failed.push(`${name}: ${result.error}`);
      }
    }

    setSaving(false);
    if (saved > 0) {
      notifications.show({
        color: 'teal',
        message:
          saved === 1
            ? 'Intervenția a fost salvată. Follow-up-ul următor a fost creat automat.'
            : `${saved} intervenții salvate. Follow-up-urile următoare au fost create automat.`,
      });
    }
    for (const message of failed) {
      notifications.show({ color: 'red', title: 'Eroare', message });
    }
    if (failed.length === 0) {
      form.reset();
      setIntervals({});
      onSaved();
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Adaugă intervenție" size="lg">
      <form onSubmit={submit}>
        <Stack>
          {!associationId && (
            <Select
              label="Asociație"
              searchable
              required
              data={associationOptions}
              {...form.getInputProps('association_id')}
            />
          )}
          <MultiSelect
            label="Servicii efectuate"
            description="Poți selecta unul sau mai multe servicii pentru aceeași vizită"
            required
            data={services.map((s) => ({ value: String(s.id), label: s.name }))}
            {...form.getInputProps('service_ids')}
          />
          <DateInput
            label="Data intervenției"
            required
            valueFormat="DD.MM.YYYY"
            {...form.getInputProps('performed_date')}
          />

          {serviceIds.length > 0 && (
            <Card withBorder padding="sm">
              <Stack gap="xs">
                {serviceIds.map((sid) => {
                  const service = services.find((s) => String(s.id) === sid);
                  return (
                    <Group key={sid} justify="space-between" wrap="nowrap">
                      <Text size="sm" fw={500} style={{ flex: 1 }}>
                        {service?.name ?? '—'}
                      </Text>
                      <NumberInput
                        size="sm"
                        w={140}
                        min={1}
                        max={120}
                        suffix=" luni"
                        value={intervals[sid] ?? 3}
                        onChange={(v) =>
                          setIntervals((prev) => ({ ...prev, [sid]: Number(v) || 1 }))
                        }
                      />
                      <Text size="sm" c="teal" w={150} ta="right">
                        {previews[sid] ? `→ ${fmtDate(previews[sid])}` : ''}
                      </Text>
                    </Group>
                  );
                })}
              </Stack>
            </Card>
          )}

          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" loading={saving}>
              {serviceIds.length > 1 ? 'Salvează intervențiile' : 'Salvează intervenția'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
