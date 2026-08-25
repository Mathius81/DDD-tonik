import { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, Textarea, Button, Stack, Group, Select, NumberInput, SegmentedControl, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import { tyreSeasons, tyreSeasonLabels } from '../../../shared/schemas/tyre';
import type { TyreStorageListItem, TyreVehicleListItem, TyreSeason } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

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
  onSaved: (set: TyreStorageListItem) => void;
  /** Prezent => editare; absent/null => set nou. */
  set?: TyreStorageListItem | null;
  /** Mașină preselectată la crearea unui set nou (ex.: din fișa mașinii). */
  presetVehicleId?: number | null;
}

/**
 * Formular pentru un set de cauciucuri lăsate în depozit (hotel de cauciucuri).
 * Poziția pe raft NU are un câmp dedicat — se notează liber în „Observații”.
 */
export function StorageFormModal({ opened, onClose, onSaved, set, presetVehicleId }: Props) {
  const isEdit = !!set;
  const [vehicles, setVehicles] = useState<TyreVehicleListItem[]>([]);

  const form = useForm({
    initialValues: {
      vehicle_id: set ? String(set.vehicle_id) : presetVehicleId ? String(presetVehicleId) : '',
      size: set?.size ?? '',
      brand: set?.brand ?? '',
      season: (set?.season ?? 'iarna') as TyreSeason,
      quantity: set?.quantity ?? 4,
      date_in: set?.date_in ?? todayIso(),
      notes: set?.notes ?? '',
    },
    validate: {
      vehicle_id: (v) => (v ? null : 'Alege mașina'),
      size: (v) => (v.trim() ? null : 'Completează dimensiunea (ex.: 205/55 R16)'),
      date_in: (v) => (v ? null : 'Data intrării este obligatorie'),
    },
  });

  useEffect(() => {
    if (!opened) return;
    unwrap<Paginated<TyreVehicleListItem>>(ddd.tyres.vehicles.list({ page: 1, pageSize: 200 })).then((r) =>
      setVehicles(r.items),
    );
  }, [opened]);

  const vehicleOptions = useMemo(
    () => vehicles.map((v) => ({ value: String(v.id), label: `${v.plate_number} — ${v.client_name}` })),
    [vehicles],
  );

  const submit = form.onSubmit(async (values) => {
    const payload = {
      vehicle_id: Number(values.vehicle_id),
      size: values.size,
      brand: values.brand || null,
      season: values.season,
      quantity: Number(values.quantity),
      date_in: toIso(values.date_in)!,
      notes: values.notes || null,
    };
    const saved = await runMutation<TyreStorageListItem>(
      isEdit ? ddd.tyres.storage.update({ ...payload, id: set!.id }) : ddd.tyres.storage.create(payload),
      isEdit ? 'Setul a fost actualizat.' : 'Setul a fost adăugat în depozit.',
    );
    if (saved) {
      form.reset();
      onSaved(saved);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Editare set' : 'Set nou în depozit'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          <Select
            label="Mașină"
            placeholder="Alege mașina"
            searchable
            required
            data={vehicleOptions}
            {...form.getInputProps('vehicle_id')}
          />

          <Group grow>
            <TextInput
              label="Dimensiune"
              placeholder="ex.: 205/55 R16"
              required
              {...form.getInputProps('size')}
            />
            <TextInput label="Brand (opțional)" placeholder="ex.: Michelin" {...form.getInputProps('brand')} />
          </Group>

          <Group grow align="flex-end">
            <div>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Anotimp
              </Text>
              <SegmentedControl
                fullWidth
                data={tyreSeasons.map((s) => ({ value: s, label: tyreSeasonLabels[s] }))}
                {...form.getInputProps('season')}
              />
            </div>
            <NumberInput label="Bucăți" min={1} max={20} {...form.getInputProps('quantity')} />
          </Group>

          <DateInput
            label="Data intrării în depozit"
            required
            valueFormat="DD.MM.YYYY"
            {...form.getInputProps('date_in')}
          />

          <Textarea
            label="Observații"
            description="Aici notează poziția pe raft, dacă e cazul (nu există un câmp dedicat de raft/poziție)."
            autosize
            minRows={2}
            {...form.getInputProps('notes')}
          />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă în depozit'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
