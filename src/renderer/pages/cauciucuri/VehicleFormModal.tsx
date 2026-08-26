/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, Textarea, Button, Stack, Group, Select, Divider } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import { TyreWhatsappButton } from './TyreWhatsappButton';
import { defaultVehicleWhatsappMessage } from './cauciucuri-ui';
import type { TyreVehicleListItem, TyreClientListItem } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const NEW_CLIENT = '__new__';

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (vehicle: TyreVehicleListItem) => void;
  /** Dacă e prezent, formularul editează mașina; altfel creează una nouă. */
  vehicle?: TyreVehicleListItem | null;
  /** Client preselectat la crearea unei mașini noi (ex.: „adaugă a doua mașină” din fișa clientului). */
  presetClientId?: number | null;
}

/**
 * Formular mașină — la creare, într-un singur pas: fie alegi un client existent
 * (a doua mașină a cuiva), fie completezi direct nume + telefon și clientul se
 * creează automat. Nu există un pas separat „creează întâi clientul”.
 */
export function VehicleFormModal({ opened, onClose, onSaved, vehicle, presetClientId }: Props) {
  const isEdit = !!vehicle;
  const [clients, setClients] = useState<TyreClientListItem[]>([]);

  const form = useForm({
    initialValues: {
      clientChoice: presetClientId ? String(presetClientId) : NEW_CLIENT,
      client_name: vehicle?.client_name ?? '',
      client_phone: vehicle?.client_phone ?? '',
      plate_number: vehicle?.plate_number ?? '',
      make: vehicle?.make ?? '',
      model: vehicle?.model ?? '',
      notes: vehicle?.notes ?? '',
    },
    validate: {
      plate_number: (v) => (v.trim() ? null : 'Numărul de înmatriculare este obligatoriu'),
      client_name: (v, values) =>
        isEdit || values.clientChoice !== NEW_CLIENT
          ? v.trim() || isEdit
            ? null
            : null
          : v.trim()
            ? null
            : 'Completează numele clientului',
    },
  });

  useEffect(() => {
    if (!opened || isEdit) return;
    unwrap<Paginated<TyreClientListItem>>(ddd.tyres.clients.list({ page: 1, pageSize: 200 })).then((r) =>
      setClients(r.items),
    );
  }, [opened, isEdit]);

  const clientOptions = useMemo(
    () => [
      { value: NEW_CLIENT, label: '+ Client nou' },
      ...clients.map((c) => ({ value: String(c.id), label: c.phone ? `${c.name} · ${c.phone}` : c.name })),
    ],
    [clients],
  );

  const isNewClient = !isEdit && form.values.clientChoice === NEW_CLIENT;

  const submit = form.onSubmit(async (values) => {
    const vehicleFields = {
      plate_number: values.plate_number,
      make: values.make || null,
      model: values.model || null,
      notes: values.notes || null,
    };

    if (isEdit) {
      const saved = await runMutation<TyreVehicleListItem>(
        ddd.tyres.vehicles.update({
          id: vehicle!.id,
          client_name: values.client_name,
          client_phone: values.client_phone || null,
          ...vehicleFields,
        }),
        'Mașina a fost actualizată.',
      );
      if (saved) {
        form.reset();
        onSaved(saved);
      }
      return;
    }

    const payload = isNewClient
      ? { client_name: values.client_name, client_phone: values.client_phone || null, ...vehicleFields }
      : { client_id: Number(values.clientChoice), ...vehicleFields };

    const saved = await runMutation<TyreVehicleListItem>(
      ddd.tyres.vehicles.create(payload),
      'Mașina a fost adăugată.',
    );
    if (saved) {
      form.reset();
      onSaved(saved);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Editare mașină' : 'Adaugă mașină'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          {!isEdit && (
            <Select
              label="Client"
              description="Alege un client existent (a doua mașină) sau completează un client nou mai jos."
              searchable
              allowDeselect={false}
              data={clientOptions}
              {...form.getInputProps('clientChoice')}
            />
          )}

          {(isEdit || isNewClient) && (
            <Group grow align="flex-start">
              <TextInput label="Nume client" required {...form.getInputProps('client_name')} />
              <TextInput label="Telefon" {...form.getInputProps('client_phone')} />
            </Group>
          )}

          <Divider my={2} />

          <TextInput
            label="Număr de înmatriculare"
            placeholder="ex.: B 123 ABC"
            required
            className="tonik-num"
            {...form.getInputProps('plate_number')}
          />
          <Group grow>
            <TextInput label="Marcă (opțional)" placeholder="ex.: Dacia" {...form.getInputProps('make')} />
            <TextInput label="Model (opțional)" placeholder="ex.: Duster" {...form.getInputProps('model')} />
          </Group>
          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />

          <Group justify="space-between">
            {isEdit ? (
              <TyreWhatsappButton
                clientId={vehicle!.client_id}
                phone={vehicle!.client_phone}
                subtitle={`${vehicle!.client_name} · ${vehicle!.plate_number}`}
                defaultMessage={defaultVehicleWhatsappMessage(vehicle!.client_name, vehicle!.plate_number)}
              />
            ) : (
              <span />
            )}
            <Group>
              <Button variant="default" onClick={onClose}>
                Renunță
              </Button>
              <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă mașina'}</Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
