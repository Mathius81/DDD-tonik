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
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconTransferIn, IconX, IconNote } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { fmtDate } from '../../components/dateUtils';
import { SwapFormModal } from './SwapFormModal';
import { tyreSeasonColor } from './cauciucuri-ui';
import {
  tyreSeasons,
  tyreSeasonLabels,
  tyreSwapMountedSourceLabels,
  tyreSwapRemovedDispositionLabels,
} from '../../../shared/schemas/tyre';
import type { TyreSwapListItem, TyreSeason } from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

const seasonFilterValues = ['all', ...tyreSeasons] as const;
type SeasonFilter = (typeof seasonFilterValues)[number];

/**
 * Schimburi — istoricul tuturor schimburilor de sezon, indiferent dacă au pornit
 * dintr-o programare sau au fost înregistrate direct la ghișeu (buton „Schimb nou”,
 * fără nicio programare prealabilă — vezi și butonul rapid din pagina Mașini).
 */
export function SchimburiPage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [season, setSeason] = useState<SeasonFilter>('all');
  const [page, setPage] = useState(1);
  const [swapModalOpen, setSwapModalOpen] = useState(false);

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

  const { data, loading, reload } = useIpcQuery<Paginated<TyreSwapListItem>>(
    () =>
      ddd.tyres.swaps.list({
        to_season: season === 'all' ? undefined : (season as TyreSeason),
        search: debouncedSearch || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [season, debouncedSearch, page],
  );

  // Nu comutăm între „stare goală” și tabel cât timp se încarcă — vezi useIpc.ts:
  // decizia se ia doar pe datele cunoscute, indicatorul de încărcare rămâne `fetching`.
  const isEmpty = data && data.total === 0 && !debouncedSearch && season === 'all';

  const openCreate = () => setSwapModalOpen(true);

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Schimburi de sezon"
        description="Istoricul schimburilor efectuate — cel mai recent primul."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Schimb nou
          </Button>
        }
      />

      <SegmentedControl
        value={season}
        onChange={(v) => {
          setSeason(v as SeasonFilter);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'all', label: 'Toate' },
          ...tyreSeasons.map((s) => ({ value: s, label: tyreSeasonLabels[s] })),
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
            icon={<IconTransferIn size={24} stroke={1.5} />}
            title="Niciun schimb înregistrat încă."
            description="Înregistrează un schimb nou — nu e nevoie de o programare în prealabil."
            actionLabel="Schimb nou"
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
            highlightOnHover
            verticalSpacing={6}
            noRecordsText="Niciun schimb nu corespunde filtrelor."
            columns={[
              {
                accessor: 'swap_date',
                title: 'Data',
                render: (r) => (
                  <div>
                    <Text size="var(--fs-body)" fw={700} className="tonik-num">
                      {fmtDate(r.swap_date)}
                    </Text>
                    {!r.appointment_id && (
                      <Text size="var(--fs-micro)" c="var(--text-faint)">
                        Fără programare
                      </Text>
                    )}
                  </div>
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
                accessor: 'to_season',
                title: 'Sezon',
                width: 100,
                render: (r) => (
                  <Badge variant="light" color={tyreSeasonColor[r.to_season]} size="sm">
                    {tyreSeasonLabels[r.to_season]}
                  </Badge>
                ),
              },
              {
                accessor: 'mounted_source',
                title: 'Ce s-a întâmplat cu fiecare set',
                render: (r) => (
                  <div>
                    <Text size="var(--fs-small)">Montat: {tyreSwapMountedSourceLabels[r.mounted_source]}</Text>
                    <Text size="var(--fs-small)" c="var(--text-muted)">
                      Demontat: {tyreSwapRemovedDispositionLabels[r.removed_disposition]}
                    </Text>
                  </div>
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
            ]}
          />
        )}
      </Card>

      <SwapFormModal
        opened={swapModalOpen}
        onClose={() => setSwapModalOpen(false)}
        onSaved={() => {
          setSwapModalOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
