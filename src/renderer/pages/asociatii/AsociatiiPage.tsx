import { useState } from 'react';
import { Stack, Group, Button, TextInput, SegmentedControl, Text, Card, Badge } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import { IconPlus, IconSearch, IconBuildingCommunity } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
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
    <Stack gap="lg">
      <PageHeader
        title="Asociații"
        description="Clienții tăi și următoarele lor intervenții."
        actions={
          <Button leftSection={<IconPlus size={17} />} onClick={() => setModalOpen(true)}>
            Adaugă asociație
          </Button>
        }
      />

      <Card withBorder shadow="sm" padding="lg">
        <Group mb="md">
          <TextInput
            placeholder="Caută după denumire, adresă, administrator sau telefon"
            leftSection={<IconSearch size={16} />}
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
            icon={<IconBuildingCommunity size={28} stroke={1.5} />}
            title="Nu există încă asociații."
            description="Adaugă prima asociație pentru a începe."
            actionLabel="Adaugă asociație"
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
            verticalSpacing="sm"
            noRecordsText="Nicio asociație nu corespunde căutării."
            columns={[
              {
                accessor: 'name',
                title: 'Denumire',
                render: (r) => (
                  <Text size="sm" fw={550}>
                    {r.name}
                  </Text>
                ),
              },
              {
                accessor: 'address',
                title: 'Adresă',
                render: (r) => (
                  <Text size="sm" c="dimmed">
                    {[r.address, r.city].filter(Boolean).join(', ')}
                  </Text>
                ),
              },
              {
                accessor: 'primary_contact_name',
                title: 'Contact principal',
                render: (r) =>
                  r.primary_contact_name ? (
                    <div>
                      <Text size="sm">{r.primary_contact_name}</Text>
                      {r.primary_contact_phone && (
                        <Text size="xs" c="dimmed">
                          {r.primary_contact_phone}
                        </Text>
                      )}
                    </div>
                  ) : (
                    '—'
                  ),
              },
              {
                accessor: 'next_due_date',
                title: 'Următoarea intervenție',
                render: (r) =>
                  r.next_due_date ? (
                    <div>
                      <Text size="sm">{fmtDate(r.next_due_date)}</Text>
                      <Text size="xs" c="dimmed">
                        {r.next_service_name}
                      </Text>
                    </div>
                  ) : (
                    '—'
                  ),
              },
              {
                accessor: 'active',
                title: 'Status',
                render: (r) =>
                  r.active ? (
                    <Badge color="teal" variant="light">
                      Activă
                    </Badge>
                  ) : (
                    <Badge color="gray" variant="light">
                      Inactivă
                    </Badge>
                  ),
              },
            ]}
          />
        )}
      </Card>

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
