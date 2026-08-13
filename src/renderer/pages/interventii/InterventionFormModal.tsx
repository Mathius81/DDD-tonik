import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  Select,
  NumberInput,
  Textarea,
  Text,
  Alert,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import type { Service } from '../../../shared/schemas/service';
import type { FollowupListItem } from '../../../shared/schemas/followup';
import type { Association } from '../../../shared/schemas/association';

function toIso(d: Date | string | null): string | null {
  if (!d) return null;
  if (typeof d === 'string') return d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  const [dueDatePreview, setDueDatePreview] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      association_id: associationId ? String(associationId) : '',
      service_id: '',
      performed_date: new Date() as Date | null,
      interval_months: 3,
      notes: '',
    },
    validate: {
      association_id: (v) => (v ? null : 'Alege asociația'),
      service_id: (v) => (v ? null : 'Alege serviciul'),
      performed_date: (v) => (v ? null : 'Data intervenției este obligatorie'),
      interval_months: (v) => (v && v >= 1 ? null : 'Minim 1 lună'),
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
        service_id: String(fromFollowup.service_id),
        performed_date: fromFollowup.scheduled_date
          ? new Date(`${fromFollowup.scheduled_date}T00:00:00`)
          : new Date(),
      });
    } else if (associationId) {
      form.setFieldValue('association_id', String(associationId));
    }
  }, [opened, fromFollowup, associationId]);

  // Interval implicit din serviciul ales.
  const serviceId = form.values.service_id;
  useEffect(() => {
    const s = services.find((x) => String(x.id) === serviceId);
    if (s && !fromFollowup) form.setFieldValue('interval_months', s.default_interval_months);
  }, [serviceId, services]);

  // Previzualizare due date calculată în main (aceeași logică folosită la salvare).
  const performedIso = toIso(form.values.performed_date);
  const intervalMonths = form.values.interval_months;
  useEffect(() => {
    if (!performedIso || !intervalMonths) {
      setDueDatePreview(null);
      return;
    }
    unwrap<{ due_date: string }>(
      ddd.interventions.previewDueDate({
        performed_date: performedIso,
        interval_months: intervalMonths,
      }),
    )
      .then((r) => setDueDatePreview(r.due_date))
      .catch(() => setDueDatePreview(null));
  }, [performedIso, intervalMonths]);

  const associationOptions = useMemo(
    () => associations.map((a) => ({ value: String(a.id), label: a.name })),
    [associations],
  );

  const submit = form.onSubmit(async (values) => {
    const saved = await runMutation(
      ddd.interventions.create({
        association_id: Number(values.association_id),
        service_id: Number(values.service_id),
        performed_date: toIso(values.performed_date)!,
        interval_months: values.interval_months,
        notes: values.notes || null,
        completes_followup_id: fromFollowup?.id ?? null,
      }),
      'Intervenția a fost salvată. Follow-up-ul următor a fost creat automat.',
    );
    if (saved) {
      form.reset();
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
          <Select
            label="Serviciu"
            required
            data={services.map((s) => ({ value: String(s.id), label: s.name }))}
            {...form.getInputProps('service_id')}
          />
          <Group grow>
            <DateInput
              label="Data intervenției"
              required
              valueFormat="DD.MM.YYYY"
              {...form.getInputProps('performed_date')}
            />
            <NumberInput
              label="Repetare după (luni)"
              required
              min={1}
              max={120}
              {...form.getInputProps('interval_months')}
            />
          </Group>
          {dueDatePreview && (
            <Alert color="teal" variant="light">
              <Text size="sm">
                Următoarea intervenție: <b>{fmtDate(dueDatePreview)}</b>
              </Text>
            </Alert>
          )}
          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">Salvează intervenția</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
