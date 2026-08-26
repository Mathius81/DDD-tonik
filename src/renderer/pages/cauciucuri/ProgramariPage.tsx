/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useMemo, useState } from 'react';
import { Stack, Group, Button, Text, Card, ActionIcon, Tooltip, Badge, Menu, UnstyledButton } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { DateInput } from '@mantine/dates';
import {
  IconPlus,
  IconCalendarEvent,
  IconPencil,
  IconChevronDown,
  IconTransferIn,
  IconCalendarDue,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { AppointmentFormModal } from './AppointmentFormModal';
import { SwapFormModal } from './SwapFormModal';
import { tyreSeasonColor } from './cauciucuri-ui';
import {
  tyreAppointmentStatuses,
  tyreAppointmentStatusLabels,
  tyreSeasonLabels,
} from '../../../shared/schemas/tyre';
import type { TyreAppointmentListItem, TyreAppointmentStatus } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const appointmentStatusTone: Record<TyreAppointmentStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  programat: 'info',
  venit: 'warning',
  finalizat: 'success',
  anulat: 'neutral',
};

const weekdayShort = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];

function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayIso(): string {
  return toIso(new Date());
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return toIso(dt);
}

function dayLabel(iso: string): { weekday: string; dayMonth: string } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return { weekday: weekdayShort[dt.getDay()], dayMonth: `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}` };
}

/**
 * Programări cu oră fixă — o singură listă pe zi (nu există stații de lucru în paralel).
 * Banda de zile de sus arată următoarele 10 zile, cu „Azi” evidențiat vizual; poți sări
 * la orice altă zi cu selectorul de dată din dreapta.
 */
export function ProgramariPage() {
  const today = todayIso();
  const [selectedDate, setSelectedDate] = useState(today);
  const [editing, setEditing] = useState<TyreAppointmentListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [swapFor, setSwapFor] = useState<TyreAppointmentListItem | null>(null);

  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => addDays(today, i)), [today]);

  const { data, loading, reload } = useIpcQuery<Paginated<TyreAppointmentListItem>>(
    () => ddd.tyres.appointments.list({ date: selectedDate, status: 'all', page: 1, pageSize: 200 }),
    [selectedDate],
  );

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (a: TyreAppointmentListItem) => {
    setEditing(a);
    setModalOpen(true);
  };

  const setStatus = async (a: TyreAppointmentListItem, status: TyreAppointmentStatus) => {
    const saved = await runMutation(
      ddd.tyres.appointments.setStatus({ id: a.id, status }),
      `Programarea a fost marcată „${tyreAppointmentStatusLabels[status]}”.`,
    );
    if (saved) reload();
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Programări"
        description="Programări cu oră fixă, o singură listă de lucru pe zi."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Programare nouă
          </Button>
        }
      />

      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap={6} wrap="wrap" style={{ overflowX: 'auto' }}>
          {days.map((d) => {
            const isToday = d === today;
            const isSelected = d === selectedDate;
            const { weekday, dayMonth } = dayLabel(d);
            return (
              <UnstyledButton
                key={d}
                onClick={() => setSelectedDate(d)}
                px="sm"
                py={6}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  border: isToday ? '1.5px solid var(--accent)' : '1px solid var(--border-subtle)',
                  background: isSelected ? 'var(--accent-soft)' : 'transparent',
                  minWidth: 56,
                  textAlign: 'center',
                }}
              >
                <Text size="var(--fs-micro)" fw={600} c={isToday ? 'var(--accent)' : 'var(--text-muted)'} tt="uppercase">
                  {isToday ? 'Azi' : weekday}
                </Text>
                <Text size="var(--fs-small)" fw={700} className="tonik-num">
                  {dayMonth}
                </Text>
              </UnstyledButton>
            );
          })}
        </Group>
        <DateInput
          label="Sau alege altă zi"
          valueFormat="DD.MM.YYYY"
          value={selectedDate}
          onChange={(v) => v && setSelectedDate(String(v))}
          w={180}
        />
      </Group>

      <Card padding="var(--sp-4)">
        {!loading && data && data.total === 0 ? (
          <EmptyState
            icon={<IconCalendarEvent size={24} stroke={1.5} />}
            title={selectedDate === today ? 'Nicio programare azi.' : 'Nicio programare în această zi.'}
            description="Adaugă o programare nouă pentru clientul care sună."
            actionLabel="Programare nouă"
            onAction={openCreate}
          />
        ) : (
          <DataTable
            minHeight={160}
            records={data?.items ?? []}
            fetching={loading}
            noRecordsText="Nicio programare."
            highlightOnHover
            verticalSpacing={6}
            onRowClick={({ record }) => openEdit(record)}
            columns={[
              {
                accessor: 'appointment_time',
                title: 'Ora',
                width: 70,
                render: (r) => (
                  <Text size="var(--fs-body)" fw={700} className="tonik-num">
                    {r.appointment_time}
                  </Text>
                ),
              },
              {
                accessor: 'plate_number',
                title: 'Mașină',
                render: (r) => (
                  <div>
                    <Text size="var(--fs-body)" fw={700} className="tonik-num">
                      {r.plate_number}
                    </Text>
                    <Text size="var(--fs-small)" c="var(--text-muted)">
                      {r.client_name}
                      {r.client_phone ? ` · ${r.client_phone}` : ''}
                    </Text>
                  </div>
                ),
              },
              {
                accessor: 'work_type',
                title: 'Lucrare',
                render: (r) => (
                  <Group gap={6} wrap="nowrap">
                    <Text size="var(--fs-body)">{r.work_type}</Text>
                    {r.season && (
                      <Badge variant="light" color={tyreSeasonColor[r.season]} size="sm">
                        {tyreSeasonLabels[r.season]}
                      </Badge>
                    )}
                  </Group>
                ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 150,
                render: (r) => (
                  <Menu withinPortal position="bottom-start" shadow="sm">
                    <Menu.Target>
                      <UnstyledButton onClick={(e) => e.stopPropagation()}>
                        <Group gap={4} wrap="nowrap">
                          <StatusBadge tone={appointmentStatusTone[r.status]}>
                            {tyreAppointmentStatusLabels[r.status]}
                          </StatusBadge>
                          <IconChevronDown size={13} color="var(--text-faint)" />
                        </Group>
                      </UnstyledButton>
                    </Menu.Target>
                    <Menu.Dropdown onClick={(e) => e.stopPropagation()}>
                      {tyreAppointmentStatuses.map((s) => (
                        <Menu.Item key={s} disabled={s === r.status} onClick={() => setStatus(r, s)}>
                          {tyreAppointmentStatusLabels[s]}
                        </Menu.Item>
                      ))}
                    </Menu.Dropdown>
                  </Menu>
                ),
              },
              {
                accessor: 'notes',
                title: '',
                width: 34,
                render: (r) =>
                  r.notes ? (
                    <Tooltip label={r.notes} withArrow multiline maw={320}>
                      <IconCalendarDue size={15} color="var(--text-faint)" />
                    </Tooltip>
                  ) : null,
              },
              {
                accessor: 'actions',
                title: '',
                width: 140,
                render: (r) => (
                  <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    {r.status === 'finalizat' && !r.swap_id && (
                      <Tooltip label="Înregistrează schimbul de sezon">
                        <ActionIcon variant="light" color="teal" onClick={() => setSwapFor(r)} aria-label="Înregistrează schimbul">
                          <IconTransferIn size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    {r.swap_id && (
                      <Badge variant="light" color="teal" size="sm">
                        Schimb înregistrat
                      </Badge>
                    )}
                    <ActionIcon variant="subtle" color="gray" aria-label="Editează programarea" onClick={() => openEdit(r)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Group>
                ),
              },
            ]}
          />
        )}
      </Card>

      <AppointmentFormModal
        key={editing?.id ?? 'new'}
        opened={modalOpen}
        appointment={editing}
        presetDate={selectedDate}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />

      <SwapFormModal
        key={swapFor ? `swap-${swapFor.id}` : 'swap-none'}
        opened={!!swapFor}
        presetVehicleId={swapFor?.vehicle_id}
        presetVehicleLabel={swapFor ? `${swapFor.plate_number} — ${swapFor.client_name}` : undefined}
        presetAppointmentId={swapFor?.id}
        presetSeason={swapFor?.season}
        onClose={() => setSwapFor(null)}
        onSaved={() => {
          setSwapFor(null);
          reload();
        }}
      />
    </Stack>
  );
}
