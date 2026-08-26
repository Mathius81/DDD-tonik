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
import {
  Modal,
  TextInput,
  Textarea,
  Button,
  Stack,
  Group,
  Select,
  NumberInput,
  SegmentedControl,
  Text,
  Alert,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconInfoCircle } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import {
  tyreSeasons,
  tyreSeasonLabels,
  tyreSwapMountedSources,
  tyreSwapMountedSourceLabels,
  tyreSwapRemovedDispositions,
  tyreSwapRemovedDispositionLabels,
} from '../../../shared/schemas/tyre';
import type {
  TyreSwapListItem,
  TyreVehicleListItem,
  TyreStorageListItem,
  TyreSeason,
  TyreSwapMountedSource,
  TyreSwapRemovedDisposition,
} from '../../../shared/schemas/tyre';
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
  onSaved: (swap: TyreSwapListItem) => void;
  /** Mașină preselectată (ex.: dintr-o programare finalizată) — dacă e prezentă, selectorul e blocat. */
  presetVehicleId?: number | null;
  /** Etichetă afișată pentru mașina preselectată (număr + client), fără un nou apel IPC. */
  presetVehicleLabel?: string;
  /** Programarea din care a pornit schimbul (se leagă în istoric, vezi tyre_swaps.appointment_id). */
  presetAppointmentId?: number | null;
  /** Sezonul spre care se face schimbul, sugerat de programare (ex. „schimb_sezon” cu sezon setat). */
  presetSeason?: TyreSeason | null;
}

/**
 * Schimbul de sezon — o singură acțiune atomică: setul montat acum iese din depozit
 * (dacă a fost adus din hotel), iar cel demontat intră în depozit sau rămâne acasă la
 * client. Totul se salvează dintr-un singur pas (`ddd.tyres.swaps.create`).
 */
export function SwapFormModal({
  opened,
  onClose,
  onSaved,
  presetVehicleId,
  presetVehicleLabel,
  presetAppointmentId,
  presetSeason,
}: Props) {
  const vehicleLocked = !!presetVehicleId;
  const [vehicles, setVehicles] = useState<TyreVehicleListItem[]>([]);
  const [storageSets, setStorageSets] = useState<TyreStorageListItem[]>([]);

  const form = useForm({
    initialValues: {
      vehicle_id: presetVehicleId ? String(presetVehicleId) : '',
      swap_date: todayIso(),
      to_season: (presetSeason ?? 'iarna') as TyreSeason,
      mounted_source: 'adus_de_client' as TyreSwapMountedSource,
      mounted_storage_id: '',
      removed_disposition: 'acasa' as TyreSwapRemovedDisposition,
      removed_size: '',
      removed_brand: '',
      removed_quantity: 4,
      notes: '',
    },
    validate: {
      vehicle_id: (v) => (v ? null : 'Alege mașina'),
      swap_date: (v) => (v ? null : 'Data este obligatorie'),
      mounted_storage_id: (v, values) =>
        values.mounted_source === 'din_depozit' && !v ? 'Alege setul din depozit care se montează.' : null,
      removed_size: (v, values) =>
        values.removed_disposition === 'depozit' && !v.trim()
          ? 'Dimensiunea este obligatorie pentru setul care intră în depozit.'
          : null,
    },
  });

  useEffect(() => {
    if (!opened) return;
    form.setValues({
      vehicle_id: presetVehicleId ? String(presetVehicleId) : '',
      swap_date: todayIso(),
      to_season: (presetSeason ?? 'iarna') as TyreSeason,
      mounted_source: 'adus_de_client',
      mounted_storage_id: '',
      removed_disposition: 'acasa',
      removed_size: '',
      removed_brand: '',
      removed_quantity: 4,
      notes: '',
    });
    // Reinițializăm doar la deschidere — valorile presetate vin din props la momentul deschiderii.
  }, [opened]);

  useEffect(() => {
    if (!opened || vehicleLocked) return;
    unwrap<Paginated<TyreVehicleListItem>>(ddd.tyres.vehicles.list({ page: 1, pageSize: 200 })).then((r) =>
      setVehicles(r.items),
    );
  }, [opened, vehicleLocked]);

  const vehicleId = form.values.vehicle_id;
  const toSeason = form.values.to_season;
  const mountedSource = form.values.mounted_source;

  useEffect(() => {
    if (!opened || mountedSource !== 'din_depozit' || !vehicleId) {
      setStorageSets([]);
      return;
    }
    unwrap<Paginated<TyreStorageListItem>>(
      ddd.tyres.storage.list({ status: 'in_depozit', vehicle_id: Number(vehicleId), page: 1, pageSize: 100 }),
    ).then((r) => setStorageSets(r.items));
  }, [opened, mountedSource, vehicleId]);

  const vehicleOptions = useMemo(
    () => vehicles.map((v) => ({ value: String(v.id), label: `${v.plate_number} — ${v.client_name}` })),
    [vehicles],
  );

  const matchingStorageSets = useMemo(
    () => storageSets.filter((s) => s.season === toSeason),
    [storageSets, toSeason],
  );
  const storageOptions = useMemo(
    () => matchingStorageSets.map((s) => ({ value: String(s.id), label: `${s.size}${s.brand ? ` · ${s.brand}` : ''} (intrat ${s.date_in})` })),
    [matchingStorageSets],
  );

  const submit = form.onSubmit(async (values) => {
    const payload = {
      vehicle_id: Number(values.vehicle_id),
      appointment_id: presetAppointmentId ?? null,
      swap_date: toIso(values.swap_date)!,
      to_season: values.to_season,
      mounted_source: values.mounted_source,
      mounted_storage_id: values.mounted_source === 'din_depozit' ? Number(values.mounted_storage_id) : null,
      removed_disposition: values.removed_disposition,
      removed_size: values.removed_disposition === 'depozit' ? values.removed_size : null,
      removed_brand: values.removed_disposition === 'depozit' ? values.removed_brand || null : null,
      removed_quantity: values.removed_disposition === 'depozit' ? Number(values.removed_quantity) : null,
      notes: values.notes || null,
    };
    const saved = await runMutation<TyreSwapListItem>(ddd.tyres.swaps.create(payload), 'Schimbul a fost înregistrat.');
    if (saved) {
      onSaved(saved);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title="Înregistrează schimb de sezon" size="lg">
      <form onSubmit={submit}>
        <Stack>
          {vehicleLocked ? (
            <TextInput label="Mașină" value={presetVehicleLabel ?? `#${presetVehicleId}`} disabled />
          ) : (
            <Select
              label="Mașină"
              placeholder="Alege mașina"
              searchable
              required
              data={vehicleOptions}
              {...form.getInputProps('vehicle_id')}
            />
          )}

          <Group grow align="flex-end">
            <DateInput label="Data schimbului" required valueFormat="DD.MM.YYYY" {...form.getInputProps('swap_date')} />
            <div>
              <Text size="var(--fs-small)" fw={500} mb={4}>
                Se montează cauciucurile de
              </Text>
              <SegmentedControl
                fullWidth
                data={tyreSeasons.map((s) => ({ value: s, label: tyreSeasonLabels[s] }))}
                {...form.getInputProps('to_season')}
              />
            </div>
          </Group>

          <div>
            <Text size="var(--fs-small)" fw={500} mb={4}>
              Setul montat acum vine…
            </Text>
            <SegmentedControl
              fullWidth
              data={tyreSwapMountedSources.map((s) => ({ value: s, label: tyreSwapMountedSourceLabels[s] }))}
              {...form.getInputProps('mounted_source')}
            />
          </div>

          {mountedSource === 'din_depozit' && (
            <Select
              label="Setul din depozit care se montează"
              placeholder={vehicleId ? 'Alege setul' : 'Alege întâi mașina'}
              disabled={!vehicleId}
              data={storageOptions}
              {...form.getInputProps('mounted_storage_id')}
            />
          )}
          {mountedSource === 'din_depozit' && vehicleId && matchingStorageSets.length === 0 && (
            <Alert icon={<IconInfoCircle size={16} />} color="yellow" variant="light">
              Nu există niciun set de {tyreSeasonLabels[toSeason].toLowerCase()} în depozit pentru această mașină.
            </Alert>
          )}

          <div>
            <Text size="var(--fs-small)" fw={500} mb={4}>
              Setul demontat acum…
            </Text>
            <SegmentedControl
              fullWidth
              data={tyreSwapRemovedDispositions.map((d) => ({ value: d, label: tyreSwapRemovedDispositionLabels[d] }))}
              {...form.getInputProps('removed_disposition')}
            />
          </div>

          {form.values.removed_disposition === 'depozit' && (
            <Group grow align="flex-start">
              <TextInput
                label="Dimensiune"
                placeholder="ex.: 205/55 R16"
                required
                {...form.getInputProps('removed_size')}
              />
              <TextInput label="Brand (opțional)" placeholder="ex.: Michelin" {...form.getInputProps('removed_brand')} />
              <NumberInput label="Bucăți" min={1} max={20} {...form.getInputProps('removed_quantity')} />
            </Group>
          )}

          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">Înregistrează schimbul</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
