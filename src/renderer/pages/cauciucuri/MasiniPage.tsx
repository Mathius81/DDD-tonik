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
import { Stack, Group, Button, TextInput, Text, Card, ActionIcon, Tooltip, Badge } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useSearchParams } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconCar, IconX, IconNote, IconPencil, IconTransferIn } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { pluralRo } from '../../../shared/text';
import { VehicleFormModal } from './VehicleFormModal';
import { SwapFormModal } from './SwapFormModal';
import { TyreWhatsappButton } from './TyreWhatsappButton';
import { defaultVehicleWhatsappMessage } from './cauciucuri-ui';
import type { TyreVehicleListItem } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

/**
 * Pagina Mașini — funcția cea mai folosită a spațiului Cauciucuri: căutare rapidă
 * după număr de înmatriculare, nume sau telefon, direct la ghișeu, cu clientul în față.
 */
export function MasiniPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const clientIdParam = searchParams.get('client');
  const clientId = clientIdParam ? Number(clientIdParam) : undefined;

  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<TyreVehicleListItem | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  // Drumul cel mai scurt către schimbul de sezon: caută numărul, apasă schimb — fără
  // să treacă mai întâi printr-o programare fictivă (vezi și pagina Schimburi).
  const [swapFor, setSwapFor] = useState<TyreVehicleListItem | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, loading, reload } = useIpcQuery<Paginated<TyreVehicleListItem>>(
    () =>
      ddd.tyres.vehicles.list({
        client_id: clientId,
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [clientId, debouncedSearch, page],
  );

  const isEmpty = data && data.total === 0 && !debouncedSearch && !clientId;
  const filteredClientName = clientId ? data?.items[0]?.client_name : undefined;

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (v: TyreVehicleListItem) => {
    setEditing(v);
    setModalOpen(true);
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
        title="Mașini"
        description="Caută rapid după număr de înmatriculare, nume sau telefon."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Adaugă mașină
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
            size="md"
          />
        </Group>

        {isEmpty ? (
          <EmptyState
            icon={<IconCar size={24} stroke={1.5} />}
            title="Nicio mașină încă."
            description="Adaugă prima mașină — dacă numele clientului e nou, se creează automat, într-un singur pas."
            actionLabel="Adaugă prima mașină"
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
            noRecordsText="Nicio mașină nu corespunde căutării."
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
                accessor: 'make',
                title: 'Marcă / Model',
                render: (r) => (
                  <Text size="var(--fs-body)" c={r.make || r.model ? undefined : 'var(--text-faint)'}>
                    {[r.make, r.model].filter(Boolean).join(' ') || '—'}
                  </Text>
                ),
              },
              {
                accessor: 'sets_in_storage',
                title: 'În depozit',
                render: (r) =>
                  r.sets_in_storage > 0 ? (
                    <Badge variant="light" color="blue" size="sm">
                      {pluralRo(r.sets_in_storage, 'set', 'seturi')}
                    </Badge>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      —
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
                width: 110,
                render: (r) => (
                  <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                    <TyreWhatsappButton
                      clientId={r.client_id}
                      phone={r.client_phone}
                      subtitle={`${r.client_name} · ${r.plate_number}`}
                      defaultMessage={defaultVehicleWhatsappMessage(r.client_name, r.plate_number)}
                    />
                    <Tooltip label="Înregistrează schimbul de sezon">
                      <ActionIcon
                        variant="light"
                        color="teal"
                        aria-label="Înregistrează schimbul de sezon"
                        onClick={() => setSwapFor(r)}
                      >
                        <IconTransferIn size={16} />
                      </ActionIcon>
                    </Tooltip>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label="Editează mașina"
                      onClick={() => openEdit(r)}
                    >
                      <IconPencil size={16} />
                    </ActionIcon>
                  </Group>
                ),
              },
            ]}
          />
        )}
      </Card>

      <VehicleFormModal
        key={editing?.id ?? 'new'}
        opened={modalOpen}
        vehicle={editing}
        presetClientId={clientId ?? null}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />

      <SwapFormModal
        key={swapFor ? `swap-${swapFor.id}` : 'swap-none'}
        opened={!!swapFor}
        presetVehicleId={swapFor?.id}
        presetVehicleLabel={swapFor ? `${swapFor.plate_number} — ${swapFor.client_name}` : undefined}
        onClose={() => setSwapFor(null)}
        onSaved={() => {
          setSwapFor(null);
          reload();
        }}
      />
    </Stack>
  );
}
