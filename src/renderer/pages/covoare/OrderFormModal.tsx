import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  Select,
  NumberInput,
  Textarea,
  Text,
  Card,
  ActionIcon,
  Divider,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import {
  carpetItemTypes,
  carpetItemTypeLabels,
  carpetOrderStatuses,
  carpetOrderStatusLabels,
  type CarpetItemType,
  type CarpetOrderStatus,
  type CarpetOrderWithItems,
  type CarpetClientListItem,
} from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';
import { formatMp, formatLei } from './covoare-ui';

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

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface ItemFormValue {
  type: CarpetItemType;
  length_m: number | '';
  width_m: number | '';
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onSaved: (order: CarpetOrderWithItems) => void;
  /** Prezentă => editare; absentă/null => comandă nouă. */
  order?: CarpetOrderWithItems | null;
  /** Client preselectat la crearea unei comenzi noi (ex.: din fișa clientului). */
  presetClientId?: number | null;
}

const emptyItem: ItemFormValue = { type: 'covor', length_m: '', width_m: '' };

export function OrderFormModal({ opened, onClose, onSaved, order, presetClientId }: Props) {
  const isEdit = !!order;
  const [clients, setClients] = useState<CarpetClientListItem[]>([]);

  const form = useForm({
    initialValues: {
      client_id: order ? String(order.client_id) : presetClientId ? String(presetClientId) : '',
      pickup_date: order?.pickup_date ?? todayIso(),
      due_date: order?.due_date ?? (null as string | null),
      status: (order?.status ?? 'preluat') as CarpetOrderStatus,
      price_per_sqm: order?.price_per_sqm ?? ('' as number | ''),
      notes: order?.notes ?? '',
      items:
        order && order.items.length > 0
          ? order.items.map((i) => ({ type: i.type, length_m: i.length_m, width_m: i.width_m }))
          : [{ ...emptyItem }],
    },
    validate: {
      client_id: (v) => (v ? null : 'Alege clientul'),
      pickup_date: (v) => (v ? null : 'Data preluării este obligatorie'),
      items: {
        length_m: (v) => (typeof v === 'number' && v > 0 ? null : 'Lungime invalidă'),
        width_m: (v) => (typeof v === 'number' && v > 0 ? null : 'Lățime invalidă'),
      },
    },
  });

  useEffect(() => {
    if (!opened) return;
    unwrap<Paginated<CarpetClientListItem>>(ddd.carpets.clients.list({ page: 1, pageSize: 200 })).then(
      (r) => setClients(r.items),
    );
  }, [opened]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.phone ? `${c.name} · ${c.phone}` : c.name })),
    [clients],
  );

  const items = form.values.items;
  const totalSqm = round2(
    items.reduce(
      (sum, it) =>
        sum + (typeof it.length_m === 'number' && typeof it.width_m === 'number' ? it.length_m * it.width_m : 0),
      0,
    ),
  );
  const pricePerSqm = typeof form.values.price_per_sqm === 'number' ? form.values.price_per_sqm : null;
  const totalPrice = pricePerSqm != null ? round2(totalSqm * pricePerSqm) : null;

  const submit = form.onSubmit(async (values) => {
    const payload = {
      client_id: Number(values.client_id),
      pickup_date: toIso(values.pickup_date)!,
      due_date: toIso(values.due_date),
      status: values.status,
      price_per_sqm: typeof values.price_per_sqm === 'number' ? values.price_per_sqm : null,
      notes: values.notes || null,
      items: values.items.map((i) => ({
        type: i.type,
        length_m: Number(i.length_m),
        width_m: Number(i.width_m),
      })),
    };
    const saved = await runMutation<CarpetOrderWithItems>(
      isEdit ? ddd.carpets.orders.update({ ...payload, id: order!.id }) : ddd.carpets.orders.create(payload),
      isEdit ? 'Comanda a fost actualizată.' : 'Comanda a fost adăugată.',
    );
    if (saved) {
      form.reset();
      onSaved(saved);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} title={isEdit ? 'Editare comandă' : 'Adaugă comandă'} size="lg">
      <form onSubmit={submit}>
        <Stack>
          <Select
            label="Client"
            placeholder="Alege clientul"
            searchable
            required
            data={clientOptions}
            {...form.getInputProps('client_id')}
          />

          <Group grow>
            <DateInput
              label="Data preluării"
              required
              valueFormat="DD.MM.YYYY"
              {...form.getInputProps('pickup_date')}
            />
            <DateInput
              label="Termen estimat (opțional)"
              valueFormat="DD.MM.YYYY"
              clearable
              {...form.getInputProps('due_date')}
            />
          </Group>

          {isEdit && (
            <Select
              label="Status"
              data={carpetOrderStatuses.map((s) => ({ value: s, label: carpetOrderStatusLabels[s] }))}
              allowDeselect={false}
              {...form.getInputProps('status')}
            />
          )}

          <Divider label="Covoare" labelPosition="left" mt="var(--sp-2)" />

          <Stack gap="xs">
            {items.map((_, index) => (
              <Card key={index} withBorder padding="sm">
                <Group align="flex-end" wrap="nowrap">
                  <Select
                    label={index === 0 ? 'Tip' : undefined}
                    data={carpetItemTypes.map((t) => ({ value: t, label: carpetItemTypeLabels[t] }))}
                    allowDeselect={false}
                    w={140}
                    {...form.getInputProps(`items.${index}.type`)}
                  />
                  <NumberInput
                    label={index === 0 ? 'Lungime' : undefined}
                    placeholder="m"
                    suffix=" m"
                    min={0.1}
                    max={100}
                    step={0.1}
                    decimalScale={2}
                    w={110}
                    {...form.getInputProps(`items.${index}.length_m`)}
                  />
                  <NumberInput
                    label={index === 0 ? 'Lățime' : undefined}
                    placeholder="m"
                    suffix=" m"
                    min={0.1}
                    max={100}
                    step={0.1}
                    decimalScale={2}
                    w={110}
                    {...form.getInputProps(`items.${index}.width_m`)}
                  />
                  <Text size="var(--fs-body)" c="var(--text-muted)" w={90} ta="right">
                    {typeof items[index].length_m === 'number' && typeof items[index].width_m === 'number'
                      ? formatMp(round2((items[index].length_m as number) * (items[index].width_m as number)))
                      : '—'}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    disabled={items.length === 1}
                    onClick={() => form.removeListItem('items', index)}
                    aria-label="Șterge covorul"
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Group>
              </Card>
            ))}
          </Stack>

          <Group justify="space-between" align="center">
            <Button
              variant="subtle"
              size="compact-sm"
              leftSection={<IconPlus size={14} />}
              onClick={() => form.insertListItem('items', { ...emptyItem })}
            >
              Adaugă covor
            </Button>
            <Text size="var(--fs-body)" fw={600}>
              Total: {formatMp(totalSqm)}
            </Text>
          </Group>

          <NumberInput
            label="Preț / mp (opțional)"
            description="Doar informativ — nu generează factură."
            placeholder="ex.: 15"
            suffix=" lei"
            min={0}
            max={100000}
            decimalScale={2}
            {...form.getInputProps('price_per_sqm')}
          />

          {totalPrice != null && (
            <Text size="var(--fs-small)" c="var(--text-muted)">
              Total informativ: {formatLei(totalPrice)}
            </Text>
          )}

          <Textarea label="Observații" autosize minRows={2} {...form.getInputProps('notes')} />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit">{isEdit ? 'Salvează' : 'Adaugă comanda'}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
