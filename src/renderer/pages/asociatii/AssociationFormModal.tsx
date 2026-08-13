import { Modal, TextInput, Textarea, Button, Stack, Group, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import type { Association } from '../../../shared/schemas/association';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (association: Association) => void;
  /** Dacă e prezent, formularul editează; altfel creează. */
  association?: Association | null;
}

export function AssociationFormModal({ opened, onClose, onSaved, association }: Props) {
  const isEdit = !!association;
  const form = useForm({
    initialValues: {
      name: association?.name ?? '',
      tax_id: association?.tax_id ?? '',
      address: association?.address ?? '',
      city: association?.city ?? '',
      county: association?.county ?? '',
      notes: association?.notes ?? '',
      active: association?.active ?? true,
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Denumirea este obligatorie'),
      address: (v) => (v.trim() ? null : 'Adresa este obligatorie'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    const payload = isEdit ? { ...values, id: association!.id } : values;
    const saved = await runMutation<Association>(
      isEdit ? ddd.associations.update(payload) : ddd.associations.create(payload),
      isEdit ? 'Asociația a fost actualizată.' : 'Asociația a fost adăugată.',
    );
    if (saved) {
      form.reset();
      onSaved(saved);
    }
  });

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? 'Editare asociație' : 'Adaugă asociație'}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Denumire" required {...form.getInputProps('name')} />
          <TextInput label="CUI" {...form.getInputProps('tax_id')} />
          <TextInput label="Adresă" required {...form.getInputProps('address')} />
          <Group grow>
            <TextInput label="Localitate" {...form.getInputProps('city')} />
            <TextInput label="Județ" {...form.getInputProps('county')} />
          </Group>
          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
          {isEdit && (
            <Switch
              label="Asociație activă (reminderele se trimit doar pentru asociațiile active)"
              {...form.getInputProps('active', { type: 'checkbox' })}
            />
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă asociația'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
