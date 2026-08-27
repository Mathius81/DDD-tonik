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
import { Stack, Group, Button, TextInput, Text, Card, ActionIcon, Tooltip } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconUsers, IconX, IconNote, IconPencil } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { fmtDate } from '../../components/dateUtils';
import { pluralRo } from '../../../shared/text';
import { ClientFormModal } from './ClientFormModal';
import type { CarpetClient, CarpetClientListItem } from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

export function ClientiPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<CarpetClient | null>(null);
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

  const { data, loading, reload } = useIpcQuery<Paginated<CarpetClientListItem>>(
    () => ddd.carpets.clients.list({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, page],
  );

  const isEmpty = data && data.total === 0 && !debouncedSearch;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (c: CarpetClientListItem) => {
    setEditing(c);
    setModalOpen(true);
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Clienți"
        description="Clienții spălătoriei de covoare — nume, telefon, adresă și observații."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Adaugă client
          </Button>
        }
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            ref={searchRef}
            placeholder="Caută după nume sau telefon  ·  /"
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
            icon={<IconUsers size={24} stroke={1.5} />}
            title="Niciun client încă."
            description="Adaugă primul client pentru a începe să înregistrezi comenzi."
            actionLabel="Adaugă primul client"
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
            noRecordsText="Niciun client nu corespunde căutării."
            columns={[
              {
                accessor: 'name',
                title: 'Nume',
                render: (r) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {r.name}
                  </Text>
                ),
              },
              {
                accessor: 'phone',
                title: 'Telefon',
                render: (r) => (
                  <Text size="var(--fs-body)" className="tonik-num">
                    {r.phone ?? '—'}
                  </Text>
                ),
              },
              {
                accessor: 'address',
                title: 'Adresă',
                render: (r) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {r.address ?? '—'}
                  </Text>
                ),
              },
              {
                accessor: 'orders_count',
                title: 'Comenzi',
                render: (r) => (
                  <Text size="var(--fs-body)">
                    {r.orders_count > 0 ? pluralRo(r.orders_count, 'comandă', 'comenzi') : '—'}
                  </Text>
                ),
              },
              {
                accessor: 'last_order_date',
                title: 'Ultima comandă',
                render: (r) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {r.last_order_date ? fmtDate(r.last_order_date) : '—'}
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
                    aria-label="Editează clientul"
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

      <ClientFormModal
        key={editing?.id ?? 'new'}
        opened={modalOpen}
        client={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
