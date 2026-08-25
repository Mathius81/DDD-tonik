import { useEffect, useRef, useState } from 'react';
import { Stack, Group, Button, TextInput, SegmentedControl, Text, Card, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconTruckDelivery, IconX, IconNote, IconPencil } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDate } from '../../components/dateUtils';
import { OrderFormModal } from './OrderFormModal';
import { formatMp, formatLei, carpetOrderStatusTone } from './covoare-ui';
import {
  carpetOrderStatuses,
  carpetOrderStatusLabels,
  type CarpetOrderListItem,
  type CarpetOrderWithItems,
} from '../../../shared/schemas/carpet';
import { pluralRo } from '../../../shared/text';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

const statusFilterValues = ['all', ...carpetOrderStatuses] as const;
function initialStatusFromParams(sp: URLSearchParams): (typeof statusFilterValues)[number] {
  const raw = sp.get('status');
  return (statusFilterValues as readonly string[]).includes(raw ?? '')
    ? (raw as (typeof statusFilterValues)[number])
    : 'all';
}

export function ComenziPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const clientIdParam = searchParams.get('client');
  const clientId = clientIdParam ? Number(clientIdParam) : undefined;

  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<(typeof carpetOrderStatuses)[number] | 'all'>(() =>
    initialStatusFromParams(searchParams),
  );
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CarpetOrderWithItems | null>(null);
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

  const { data, loading, reload } = useIpcQuery<Paginated<CarpetOrderListItem>>(
    () =>
      ddd.carpets.orders.list({
        client_id: clientId,
        status,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [clientId, debouncedSearch, status, page],
  );

  const isEmpty = !loading && data && data.total === 0 && !debouncedSearch && status === 'all' && !clientId;
  const filteredClientName = clientId ? data?.items[0]?.client_name : undefined;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = async (row: CarpetOrderListItem) => {
    const result = await ddd.carpets.orders.get({ id: row.id });
    if (result.ok) {
      setEditing(result.data);
      setModalOpen(true);
    }
  };
  const clearClientFilter = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('client');
      return next;
    });
    setPage(1);
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Comenzi"
        description="Comenzile de spălare covoare — de la preluare până la livrare."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Adaugă comandă
          </Button>
        }
      />

      {clientId && (
        <Group gap="xs">
          <Badge variant="light" color="gray" size="lg">
            Filtrat: {filteredClientName ?? `client #${clientId}`}
          </Badge>
          <Button variant="subtle" size="compact-xs" onClick={clearClientFilter}>
            Șterge filtrul
          </Button>
        </Group>
      )}

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v as typeof status);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'all', label: 'Toate' },
          ...carpetOrderStatuses.map((s) => ({ value: s, label: carpetOrderStatusLabels[s] })),
        ]}
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            ref={searchRef}
            placeholder="Caută după nume sau telefon client  ·  /"
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
            icon={<IconTruckDelivery size={24} stroke={1.5} />}
            title="Nicio comandă încă."
            description="Adaugă prima comandă pentru a începe să urmărești covoarele preluate."
            actionLabel="Adaugă prima comandă"
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
            noRecordsText="Nicio comandă nu corespunde filtrelor."
            columns={[
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
                accessor: 'pickup_date',
                title: 'Preluare',
                render: (r) => <Text size="var(--fs-body)">{fmtDate(r.pickup_date)}</Text>,
              },
              {
                accessor: 'due_date',
                title: 'Termen',
                render: (r) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {r.due_date ? fmtDate(r.due_date) : '—'}
                  </Text>
                ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 120,
                render: (r) => (
                  <StatusBadge tone={carpetOrderStatusTone[r.status]}>
                    {carpetOrderStatusLabels[r.status]}
                  </StatusBadge>
                ),
              },
              {
                accessor: 'item_count',
                title: 'Covoare',
                render: (r) => (
                  <Text size="var(--fs-body)">
                    {pluralRo(r.item_count, 'covor', 'covoare')} · {formatMp(r.total_sqm)}
                  </Text>
                ),
              },
              {
                accessor: 'total_price',
                title: 'Total informativ',
                render: (r) => (
                  <Text size="var(--fs-body)" c="var(--text-muted)">
                    {r.total_price != null ? formatLei(r.total_price) : '—'}
                  </Text>
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
                width: 44,
                render: (r) => (
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label="Editează comanda"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(r);
                    }}
                  >
                    <IconPencil size={16} />
                  </ActionIcon>
                ),
              },
            ]}
          />
        )}
      </Card>

      <OrderFormModal
        key={editing?.id ?? 'new'}
        opened={modalOpen}
        order={editing}
        presetClientId={clientId ?? null}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
