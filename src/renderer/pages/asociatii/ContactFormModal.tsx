import { Modal, TextInput, Textarea, Button, Stack, Group, Select, Switch } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { contactRoles, contactChannels, type Contact } from '../../../shared/schemas/contact';

const channelLabels: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'Email',
  sms: 'SMS',
  phone: 'Telefon',
};

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: () => void;
  associationId: number;
  contact?: Contact | null;
}

export function ContactFormModal({ opened, onClose, onSaved, associationId, contact }: Props) {
  const isEdit = !!contact;
  const form = useForm({
    initialValues: {
      name: contact?.name ?? '',
      role: contact?.role ?? 'Administrator',
      phone: contact?.phone ?? '',
      email: contact?.email ?? '',
      preferred_channel: contact?.preferred_channel ?? 'whatsapp',
      is_primary: contact?.is_primary ?? false,
      allow_whatsapp: contact?.allow_whatsapp ?? true,
      allow_email: contact?.allow_email ?? true,
      allow_sms: contact?.allow_sms ?? false,
      do_not_contact: contact?.do_not_contact ?? false,
      notes: contact?.notes ?? '',
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Numele este obligatoriu'),
      email: (v) => (!v || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : 'Email invalid'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    const payload = { ...values, association_id: associationId };
    const saved = await runMutation(
      isEdit
        ? ddd.contacts.update({ ...payload, id: contact!.id })
        : ddd.contacts.create(payload),
      isEdit ? 'Contactul a fost actualizat.' : 'Contactul a fost adăugat.',
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
      title={isEdit ? 'Editare contact' : 'Adaugă persoană de contact'}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack>
          <Group grow>
            <TextInput label="Nume" required {...form.getInputProps('name')} />
            <Select
              label="Rol"
              data={contactRoles as unknown as string[]}
              {...form.getInputProps('role')}
            />
          </Group>
          <Group grow>
            <TextInput label="Telefon" placeholder="07xxxxxxxx" {...form.getInputProps('phone')} />
            <TextInput label="Email" placeholder="nume@exemplu.ro" {...form.getInputProps('email')} />
          </Group>
          <Select
            label="Canal preferat"
            data={contactChannels.map((c) => ({ value: c, label: channelLabels[c] }))}
            {...form.getInputProps('preferred_channel')}
          />
          <Switch
            label="Contact principal"
            {...form.getInputProps('is_primary', { type: 'checkbox' })}
          />
          <Group>
            <Switch
              label="Permite WhatsApp"
              {...form.getInputProps('allow_whatsapp', { type: 'checkbox' })}
            />
            <Switch
              label="Permite email"
              {...form.getInputProps('allow_email', { type: 'checkbox' })}
            />
            <Switch
              label="Permite SMS"
              {...form.getInputProps('allow_sms', { type: 'checkbox' })}
            />
          </Group>
          <Switch
            color="red"
            label="Nu contacta (nu se trimit mesaje către această persoană)"
            {...form.getInputProps('do_not_contact', { type: 'checkbox' })}
          />
          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă contactul'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
