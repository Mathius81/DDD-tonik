/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useRef, useState } from 'react';
import { Stack, Group, Button, TextInput, SegmentedControl, Text, Card, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { modals } from '@mantine/modals';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconPlus,
  IconSearch,
  IconBuildingWarehouse,
  IconX,
  IconNote,
  IconPencil,
  IconPackageExport,
  IconArrowBackUp,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDate } from '../../components/dateUtils';
import { StorageFormModal } from './StorageFormModal';
import { TyreWhatsappButton } from './TyreWhatsappButton';
import { defaultStorageWhatsappMessage, tyreStorageStatusTone, tyreSeasonColor } from './cauciucuri-ui';
import {
  tyreStorageStatusLabels,
  tyreSeasonLabels,
  type TyreStorageListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const statusFilterValues = ['in_depozit', 'ridicat', 'all'] as const;

/**
 * Hotel cauciucuri — pagina unică pentru custodia seturilor lăsate de clienți (fostul
 * „Depozit”, redenumit: nu există o distincție reală între „inventar fizic” și „hotel”
 * pentru acest atelier — un singur loc, un singur flux, mai simplu pentru cel de la tejghea).
 */
export function HotelPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<(typeof statusFilterValues)[number]>('in_depozit');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TyreStorageListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, loading, reload } = useIpcQuery<Paginated<TyreStorageListItem>>(
    () =>
      ddd.tyres.storage.list({
        status,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [status, debouncedSearch, page],
  );

  const isEmpty = data && data.total === 0 && !debouncedSearch && status === 'in_depozit';

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (r: TyreStorageListItem) => {
    setEditing(r);
    setModalOpen(true);
  };

  const pickup = (r: TyreStorageListItem) => {
    modals.openConfirmModal({
      title: 'Ridicare set',
      children: (
        <Text size="sm">
          Confirmi că setul <b>{r.size}</b> pentru <b>{r.plate_number}</b> a fost ridicat astăzi,{' '}
          {fmtDate(todayIso())}?
        </Text>
      ),
      labels: { confirm: 'Ridicat', cancel: 'Renunță' },
      onConfirm: async () => {
        const saved = await runMutation(
          ddd.tyres.storage.pickup({ id: r.id, date_out: todayIso() }),
          'Setul a fost marcat ca ridicat.',
        );
        if (saved) reload();
      },
    });
  };

  const returnToStorage = (r: TyreStorageListItem) => {
    modals.openConfirmModal({
      title: 'Readu în depozit',
      children: (
        <Text size="sm">
          Anulezi ridicarea setului <b>{r.size}</b> pentru <b>{r.plate_number}</b> și îl treci înapoi „În depozit”?
        </Text>
      ),
      labels: { confirm: 'Readu în depozit', cancel: 'Renunță' },
      onConfirm: async () => {
        const saved = await runMutation(ddd.tyres.storage.returnToStorage({ id: r.id }), 'Setul este din nou în depozit.');
        if (saved) reload();
      },
    });
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Hotel cauciucuri"
        description="Seturile lăsate în custodie de clienți — intrare, ridicare, istoric."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Set nou în depozit
          </Button>
        }
      />

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v as typeof status);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'in_depozit', label: tyreStorageStatusLabels.in_depozit },
          { value: 'ridicat', label: tyreStorageStatusLabels.ridicat },
          { value: 'all', label: 'Toate' },
        ]}
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            ref={searchRef}
            placeholder="Caută după număr, nume sau telefon  ·  /"
            leftSection={<IconSearch size={15} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setSearch('')}>
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1, maxWidth: 480 }}
          />
        </Group>

        {isEmpty ? (
          <EmptyState
            icon={<IconBuildingWarehouse size={24} stroke={1.5} />}
            title="Niciun set în depozit."
            description="Adaugă un set când un client lasă cauciucurile în custodie."
            actionLabel="Adaugă primul set"
            onAction={openCreate}
          />
        ) : (
          <DataTable
            minHeight={160}
            records={data?.items ?? []}
            fetching={loading}
            totalRecords={data?.total ?? 0}
            recordsPerPage={PAGE_SIZE}
            page={page}
            onPageChange={setPage}
            onRowClick={({ record }) => openEdit(record)}
            highlightOnHover
            verticalSpacing={6}
            noRecordsText="Niciun set nu corespunde filtrelor."
            columns={[
              {
                accessor: 'plate_number',
                title: 'Număr',
                render: (r) => (
                  <Text size="var(--fs-body)" fw={700} className="tonik-num">
                    {r.plate_number}
                  </Text>
                ),
              },
              {
                accessor: 'client_name',
                title: 'Client',
                render: (r) => (
                  <div>
                    <Text size="var(--fs-body)" fw={600}>
                      {r.client_name}
                    </Text>
                    {r.client_phone && (
                      <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                        {r.client_phone}
                      </Text>
                    )}
                  </div>
                ),
              },
              {
                accessor: 'size',
                title: 'Set',
                render: (r) => (
                  <Group gap={6} wrap="nowrap">
                    <Text size="var(--fs-body)">
                      {r.size}
                      {r.brand ? ` · ${r.brand}` : ''}
                    </Text>
                    <Badge variant="light" color={tyreSeasonColor[r.season]} size="sm">
                      {tyreSeasonLabels[r.season]}
                    </Badge>
                  </Group>
                ),
              },
              {
                accessor: 'quantity',
                title: 'Buc.',
                width: 60,
                render: (r) => <Text size="var(--fs-body)">{r.quantity}</Text>,
              },
              {
                accessor: 'date_in',
                title: 'Intrare',
                render: (r) => <Text size="var(--fs-body)">{fmtDate(r.date_in)}</Text>,
              },
              {
                accessor: 'date_out',
                title: 'Ieșire',
                render: (r) => (
                  <Text size="var(--fs-body)" c="var(--text-muted)">
                    {r.date_out ? fmtDate(r.date_out) : '—'}
                  </Text>
                ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 110,
                render: (r) => (
                  <StatusBadge tone={tyreStorageStatusTone[r.status]}>{tyreStorageStatusLabels[r.status]}</StatusBadge>
                ),
              },
              {
                accessor: 'notes',
                title: '',
                width: 36,
                render: (r) =>
                  r.notes ? (
                    <Tooltip label={r.notes} withArrow multiline maw={320}>
                      <IconNote size={15} color="var(--text-faint)" />
                    </Tooltip>
                  ) : null,
              },
              {
                accessor: 'actions',
                title: '',
                width: 120,
                render: (r) => (
                  <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    <TyreWhatsappButton
                      clientId={r.client_id}
                      phone={r.client_phone}
                      subtitle={`${r.client_name} · ${r.plate_number}`}
                      defaultMessage={defaultStorageWhatsappMessage(r.client_name, r.plate_number, r.size)}
                    />
                    {r.status === 'in_depozit' ? (
                      <Tooltip label="Marchează ridicat">
                        <ActionIcon variant="subtle" color="teal" onClick={() => pickup(r)} aria-label="Ridicare set">
                          <IconPackageExport size={16} />
                        </ActionIcon>
                      </Tooltip>
                    ) : (
                      <Tooltip label="Readu în depozit">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          onClick={() => returnToStorage(r)}
                          aria-label="Readu în depozit"
                        >
                          <IconArrowBackUp size={16} />
                        </ActionIcon>
                      </Tooltip>
                    )}
                    <ActionIcon variant="subtle" color="gray" aria-label="Editează setul" onClick={() => openEdit(r)}>
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Group>
                ),
              },
            ]}
          />
        )}
      </Card>

      <StorageFormModal
        key={editing?.id ?? 'new'}
        opened={modalOpen}
        set={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
