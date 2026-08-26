/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Modal, TextInput, Textarea, Button, Stack, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { TyreWhatsappButton } from './TyreWhatsappButton';
import { defaultClientWhatsappMessage } from './cauciucuri-ui';
import type { TyreClient } from '../../../shared/schemas/tyre';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (client: TyreClient) => void;
  /** Dacă e prezent, formularul editează clientul; altfel creează unul nou. */
  client?: TyreClient | null;
}

export function ClientFormModal({ opened, onClose, onSaved, client }: Props) {
  const isEdit = !!client;
  const form = useForm({
    initialValues: {
      name: client?.name ?? '',
      phone: client?.phone ?? '',
      notes: client?.notes ?? '',
    },
    validate: {
      name: (v) => (v.trim() ? null : 'Numele este obligatoriu'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    const payload = isEdit ? { ...values, id: client!.id } : values;
    const saved = await runMutation<TyreClient>(
      isEdit ? ddd.tyres.clients.update(payload) : ddd.tyres.clients.create(payload),
      isEdit ? 'Clientul a fost actualizat.' : 'Clientul a fost adăugat.',
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
      title={isEdit ? 'Editare client' : 'Adaugă client'}
      size="lg"
    >
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Nume" required {...form.getInputProps('name')} />
          <TextInput label="Telefon" {...form.getInputProps('phone')} />
          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />
          <Group justify="space-between">
            {isEdit ? (
              <TyreWhatsappButton
                clientId={client!.id}
                phone={client!.phone}
                subtitle={client!.name}
                defaultMessage={defaultClientWhatsappMessage(client!.name)}
              />
            ) : (
              <span />
            )}
            <Group>
              <Button variant="default" onClick={onClose}>
                Renunță
              </Button>
              <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă clientul'}</Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
