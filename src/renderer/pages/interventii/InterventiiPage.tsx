import { useEffect, useState } from 'react';
import { Title, Stack, Group, Button, Select } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { fmtDate } from '../../components/dateUtils';
import { InterventionFormModal } from './InterventionFormModal';
import type { InterventionListItem } from '../../../shared/schemas/intervention';
import type { Paginated } from '../../../shared/schemas/common';
import type { Service } from '../../../shared/schemas/service';

const PAGE_SIZE = 50;

export function InterventiiPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    unwrap<Service[]>(ddd.services.list()).then(setServices);
  }, []);

  const { data, loading, reload } = useIpcQuery<Paginated<InterventionListItem>>(
    () =>
      ddd.interventions.list({
        service_id: serviceId ? Number(serviceId) : undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    [serviceId, page],
  );

  const isEmpty = !loading && data && data.total === 0 && !serviceId;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Intervenții</Title>
        <Button onClick={() => setModalOpen(true)}>+ Adaugă intervenție</Button>
      </Group>

      <Select
        placeholder="Toate serviciile"
        clearable
        maw={260}
        data={services.map((s) => ({ value: String(s.id), label: s.name }))}
        value={serviceId}
        onChange={(v) => {
          setServiceId(v);
          setPage(1);
        }}
      />

      {isEmpty ? (
        <EmptyState
          title="Nicio intervenție înregistrată."
          description="Înregistrează prima intervenție — aplicația va calcula automat următoarea dată."
          actionLabel="+ Adaugă intervenție"
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
          highlightOnHover
          onRowClick={({ record }) => navigate(`/asociatii/${record.association_id}`)}
          noRecordsText="Nicio intervenție pentru filtrul ales."
          columns={[
            { accessor: 'performed_date', title: 'Data', render: (r) => fmtDate(r.performed_date) },
            { accessor: 'association_name', title: 'Asociație' },
            { accessor: 'service_name', title: 'Serviciu' },
            {
              accessor: 'interval_months',
              title: 'Repetare',
              render: (r) => `${r.interval_months} luni`,
            },
            { accessor: 'notes', title: 'Observații', render: (r) => r.notes ?? '—' },
          ]}
        />
      )}

      <InterventionFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
