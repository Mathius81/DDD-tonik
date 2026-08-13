import { Modal, Button, Stack, Group, Textarea, Text } from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import type { FollowupListItem } from '../../../shared/schemas/followup';

function toIso(d: Date | null): string | null {
  if (!d) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  followup: FollowupListItem | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ScheduleFollowupModal({ followup, onClose, onSaved }: Props) {
  const form = useForm({
    initialValues: {
      scheduled_date: null as Date | null,
      scheduled_time: '',
      notes: '',
    },
    validate: {
      scheduled_date: (v) => (v ? null : 'Data este obligatorie'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    if (!followup) return;
    const saved = await runMutation(
      ddd.followups.schedule({
        id: followup.id,
        scheduled_date: toIso(values.scheduled_date)!,
        scheduled_time: values.scheduled_time || null,
        notes: values.notes || null,
      }),
      'Programarea a fost salvată.',
    );
    if (saved) {
      form.reset();
      onSaved();
    }
  });

  return (
    <Modal opened={!!followup} onClose={onClose} title="Programează intervenția">
      {followup && (
        <form onSubmit={submit}>
          <Stack>
            <Text size="sm" c="dimmed">
              {followup.association_name} · {followup.service_name} · scadent{' '}
              {fmtDate(followup.due_date)}
            </Text>
            <Group grow>
              <DateInput
                label="Data"
                required
                valueFormat="DD.MM.YYYY"
                {...form.getInputProps('scheduled_date')}
              />
              <TimeInput label="Ora" {...form.getInputProps('scheduled_time')} />
            </Group>
            <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Renunță
              </Button>
              <Button type="submit">Programează</Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
