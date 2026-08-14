import { useState } from 'react';
import {
  Button,
  Stack,
  Group,
  Table,
  Modal,
  TextInput,
  NumberInput,
  Switch,
  Badge,
  Text,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSpray, IconPlus } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Service } from '../../../shared/schemas/service';

export function ServiciiTab() {
  const { data: services, reload } = useIpcQuery<Service[]>(() => ddd.services.list(), []);
  const [modal, setModal] = useState<{ open: boolean; service: Service | null }>({
    open: false,
    service: null,
  });

  return (
    <SectionCard
      title="Servicii oferite"
      description="Fiecare serviciu are un interval implicit de repetare, pe care îl poți ajusta la fiecare intervenție."
      icon={<IconSpray size={21} stroke={1.7} />}
      titleRight={
        <Button
          size="sm"
          leftSection={<IconPlus size={16} />}
          onClick={() => setModal({ open: true, service: null })}
        >
          Adaugă serviciu
        </Button>
      }
    >
      <Table verticalSpacing="sm" highlightOnHover>
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
              <Table.Td>
                <Text size="sm" fw={550}>
                  {s.name}
                </Text>
              </Table.Td>
              <Table.Td>{s.default_interval_months} luni</Table.Td>
              <Table.Td>
                {s.active ? (
                  <Badge color="teal" variant="light">
                    Activ
                  </Badge>
                ) : (
                  <Badge color="gray" variant="light">
                    Inactiv
                  </Badge>
                )}
              </Table.Td>
              <Table.Td align="right">
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
    </SectionCard>
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
        : ddd.services.create({
            name: values.name,
            default_interval_months: values.default_interval_months,
          }),
      'Serviciul a fost salvat.',
    );
    if (saved) {
      form.reset();
      onSaved();
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Editează serviciu' : 'Adaugă serviciu'}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
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
          <Group justify="flex-end" mt="xs">
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
