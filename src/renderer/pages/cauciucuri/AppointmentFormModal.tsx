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
import { Modal, TextInput, Textarea, Button, Stack, Group, Select, Autocomplete, Divider } from '@mantine/core';
import { DateInput, TimeInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import {
  tyreSeasons,
  tyreSeasonLabels,
  tyreAppointmentWorkTypes,
  tyreAppointmentWorkTypeLabels,
} from '../../../shared/schemas/tyre';
import type { TyreAppointmentListItem, TyreVehicleListItem, TyreSeason } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const NEW_VEHICLE = '__new__';

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
  onSaved: (appointment: TyreAppointmentListItem) => void;
  /** Prezentă => editare; absentă => programare nouă. */
  appointment?: TyreAppointmentListItem | null;
  /** Data preselectată la o programare nouă (ex.: ziua curentă selectată în listă). */
  presetDate?: string;
}

const workTypeOptions = tyreAppointmentWorkTypes.map((t) => tyreAppointmentWorkTypeLabels[t]);

/**
 * Formular programare — la creare, poți alege o mașină deja înregistrată sau, dacă
 * sună un client nou, completezi direct numele + numărul mașinii: se creează automat
 * clientul și mașina, într-un singur pas (ca la fișa Mașini).
 */
export function AppointmentFormModal({ opened, onClose, onSaved, appointment, presetDate }: Props) {
  const isEdit = !!appointment;
  const [vehicles, setVehicles] = useState<TyreVehicleListItem[]>([]);

  const form = useForm({
    initialValues: {
      vehicleChoice: appointment ? String(appointment.vehicle_id) : NEW_VEHICLE,
      client_name: '',
      client_phone: '',
      plate_number: '',
      appointment_date: appointment?.appointment_date ?? presetDate ?? todayIso(),
      appointment_time: appointment?.appointment_time ?? '',
      work_type: appointment?.work_type ?? tyreAppointmentWorkTypeLabels.schimb_sezon,
      season: (appointment?.season ?? null) as TyreSeason | null,
      notes: appointment?.notes ?? '',
    },
    validate: {
      vehicleChoice: (v) => (v ? null : 'Alege mașina'),
      client_name: (v, values) => (!isEdit && values.vehicleChoice === NEW_VEHICLE && !v.trim() ? 'Completează numele clientului' : null),
      plate_number: (v, values) =>
        !isEdit && values.vehicleChoice === NEW_VEHICLE && !v.trim() ? 'Completează numărul de înmatriculare' : null,
      appointment_date: (v) => (v ? null : 'Data este obligatorie'),
      appointment_time: (v) => (v ? null : 'Ora este obligatorie'),
      work_type: (v) => (v.trim() ? null : 'Tipul lucrării este obligatoriu'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    unwrap<Paginated<TyreVehicleListItem>>(ddd.tyres.vehicles.list({ page: 1, pageSize: 300 })).then((r) =>
      setVehicles(r.items),
    );
  }, [opened]);

  const vehicleOptions = useMemo(
    () => [
      { value: NEW_VEHICLE, label: '+ Client nou (mașină nouă)' },
      ...vehicles.map((v) => ({ value: String(v.id), label: `${v.plate_number} — ${v.client_name}` })),
    ],
    [vehicles],
  );

  const isNewVehicle = !isEdit && form.values.vehicleChoice === NEW_VEHICLE;

  const submit = form.onSubmit(async (values) => {
    let vehicleId: number;
    if (isEdit) {
      vehicleId = appointment!.vehicle_id;
    } else if (isNewVehicle) {
      const vehicle = await runMutation<TyreVehicleListItem>(
        ddd.tyres.vehicles.create({
          client_name: values.client_name,
          client_phone: values.client_phone || null,
          plate_number: values.plate_number,
        }),
      );
      if (!vehicle) return;
      vehicleId = vehicle.id;
    } else {
      vehicleId = Number(values.vehicleChoice);
    }

    const payload = {
      vehicle_id: vehicleId,
      appointment_date: toIso(values.appointment_date)!,
      appointment_time: values.appointment_time,
      work_type: values.work_type,
      season: values.season,
      notes: values.notes || null,
    };

    const saved = await runMutation<TyreAppointmentListItem>(
      isEdit ? ddd.tyres.appointments.update({ ...payload, id: appointment!.id }) : ddd.tyres.appointments.create(payload),
      isEdit ? 'Programarea a fost actualizată.' : 'Programarea a fost adăugată.',
    );
    if (saved) {
      form.reset();
      onSaved(saved);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Editare programare' : 'Programare nouă'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          {!isEdit && (
            <Select
              label="Mașină"
              description="Alege o mașină deja înregistrată sau adaugă un client nou."
              searchable
              allowDeselect={false}
              data={vehicleOptions}
              {...form.getInputProps('vehicleChoice')}
            />
          )}

          {isEdit && (
            <TextInput
              label="Mașină"
              value={`${appointment!.plate_number} — ${appointment!.client_name}`}
              disabled
            />
          )}

          {isNewVehicle && (
            <>
              <Group grow align="flex-start">
                <TextInput label="Nume client" required {...form.getInputProps('client_name')} />
                <TextInput label="Telefon" {...form.getInputProps('client_phone')} />
              </Group>
              <TextInput
                label="Număr de înmatriculare"
                placeholder="ex.: B 123 ABC"
                required
                className="tonik-num"
                {...form.getInputProps('plate_number')}
              />
              <Divider my={2} />
            </>
          )}

          <Group grow align="flex-start">
            <DateInput
              label="Data programării"
              required
              valueFormat="DD.MM.YYYY"
              {...form.getInputProps('appointment_date')}
            />
            <TimeInput label="Ora" required {...form.getInputProps('appointment_time')} />
          </Group>

          <Group grow align="flex-start">
            <Autocomplete
              label="Tip lucrare"
              description="Alege din listă sau scrie alt tip de lucrare."
              data={workTypeOptions}
              {...form.getInputProps('work_type')}
            />
            <Select
              label="Sezon (opțional)"
              placeholder="Fără sezon anume"
              clearable
              data={tyreSeasons.map((s) => ({ value: s, label: tyreSeasonLabels[s] }))}
              {...form.getInputProps('season')}
            />
          </Group>

          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">{isEdit ? 'Salvează' : 'Programează'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
