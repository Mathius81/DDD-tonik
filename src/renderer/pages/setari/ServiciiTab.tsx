import { useState } from 'react';
import { Button, Stack, Group, Table, Modal, TextInput, NumberInput, Switch, Badge } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import type { Service } from '../../../shared/schemas/service';

export function ServiciiTab() {
  const { data: services, reload } = useIpcQuery<Service[]>(() => ddd.services.list(), []);
  const [modal, setModal] = useState<{ open: boolean; service: Service | null }>({
    open: false,
    service: null,
  });

  return (
    <Stack maw={640}>
      <Group justify="flex-end">
        <Button onClick={() => setModal({ open: true, service: null })}>+ Adaugă serviciu</Button>
      </Group>
      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Serviciu</Table.Th>
            <Table.Th>Repetare implicită</Table.Th>
            <Table.Th>Status</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(services ?? []).map((s) => (
            <Table.Tr key={s.id}>
              <Table.Td>{s.name}</Table.Td>
              <Table.Td>{s.default_interval_months} luni</Table.Td>
              <Table.Td>
                {s.active ? <Badge color="green" variant="light">Activ</Badge> : <Badge color="gray" variant="light">Inactiv</Badge>}
              </Table.Td>
              <Table.Td>
                <Button
                  size="compact-sm"
                  variant="default"
                  onClick={() => setModal({ open: true, service: s })}
                >
                  Editează
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      <ServiceFormModal
        opened={modal.open}
        service={modal.service}
        onClose={() => setModal({ open: false, service: null })}
        onSaved={() => {
          setModal({ open: false, service: null });
          reload();
        }}
      />
    </Stack>
  );
}

function ServiceFormModal({
  opened,
  service,
  onClose,
  onSaved,
}: {
  opened: boolean;
  service: Service | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!service;
  const form = useForm({
    initialValues: {
      name: service?.name ?? '',
      default_interval_months: service?.default_interval_months ?? 3,
      active: service?.active ?? true,
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Denumirea este obligatorie'),
      default_interval_months: (v) => (v >= 1 ? null : 'Minim 1 lună'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    const saved = await runMutation(
      isEdit
        ? ddd.services.update({ ...values, id: service!.id })
        : ddd.services.create({ name: values.name, default_interval_months: values.default_interval_months }),
      'Serviciul a fost salvat.',
    );
    if (saved) {
      form.reset();
      onSaved();
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Editează serviciu' : 'Adaugă serviciu'}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Denumire" required {...form.getInputProps('name')} />
          <NumberInput
            label="Repetare implicită (luni)"
            min={1}
            max={120}
            required
            {...form.getInputProps('default_interval_months')}
          />
          {isEdit && (
            <Switch label="Serviciu activ" {...form.getInputProps('active', { type: 'checkbox' })} />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">Salvează</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
