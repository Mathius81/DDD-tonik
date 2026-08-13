import { useState } from 'react';
import { Title, Stack, Group, Button, TextInput, SegmentedControl, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { fmtDate } from '../../components/dateUtils';
import { AssociationFormModal } from './AssociationFormModal';
import type { AssociationListItem } from '../../../shared/schemas/association';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

export function AsociatiiPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, loading, reload } = useIpcQuery<Paginated<AssociationListItem>>(
    () =>
      ddd.associations.list({
        search: debouncedSearch || undefined,
        status,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, status, page],
  );

  const isEmpty = !loading && data && data.total === 0 && !debouncedSearch && status === 'active';

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Asociații</Title>
        <Button onClick={() => setModalOpen(true)}>+ Adaugă asociație</Button>
      </Group>

      <Group>
        <TextInput
          placeholder="Caută după denumire, adresă, administrator sau telefon"
          value={search}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            setPage(1);
          }}
          style={{ flex: 1 }}
        />
        <SegmentedControl
          value={status}
          onChange={(v) => {
            setStatus(v as typeof status);
            setPage(1);
          }}
          data={[
            { value: 'all', label: 'Toate' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
        />
      </Group>

      {isEmpty ? (
        <EmptyState
          title="Nu există încă asociații."
          description="Adaugă prima asociație pentru a începe."
          actionLabel="+ Adaugă asociație"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <DataTable
          minHeight={200}
          records={data?.items ?? []}
          fetching={loading}
          totalRecords={data?.total ?? 0}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          onRowClick={({ record }) => navigate(`/asociatii/${record.id}`)}
          highlightOnHover
          noRecordsText="Nicio asociație nu corespunde căutării."
          columns={[
            { accessor: 'name', title: 'Denumire' },
            {
              accessor: 'address',
              title: 'Adresă',
              render: (r) => [r.address, r.city].filter(Boolean).join(', '),
            },
            {
              accessor: 'primary_contact_name',
              title: 'Contact principal',
              render: (r) => r.primary_contact_name ?? '—',
            },
            {
              accessor: 'primary_contact_phone',
              title: 'Telefon',
              render: (r) => r.primary_contact_phone ?? '—',
            },
            {
              accessor: 'next_due_date',
              title: 'Următoarea intervenție',
              render: (r) =>
                r.next_due_date ? (
                  <Text size="sm">
                    {fmtDate(r.next_due_date)} · {r.next_service_name}
                  </Text>
                ) : (
                  '—'
                ),
            },
            {
              accessor: 'active',
              title: 'Status',
              render: (r) => (r.active ? 'Activă' : 'Inactivă'),
            },
          ]}
        />
      )}

      <AssociationFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(a) => {
          setModalOpen(false);
          reload();
          navigate(`/asociatii/${a.id}`);
        }}
      />
    </Stack>
  );
}
