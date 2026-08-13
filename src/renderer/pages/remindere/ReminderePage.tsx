import { useState } from 'react';
import { Stack, SegmentedControl, Button, Card, Badge } from '@mantine/core';
import { PageHeader } from '../../components/PageHeader';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate, fmtDateTime } from '../../components/dateUtils';
import { EmptyState } from '../../components/EmptyState';
import {
  reminderChannelLabels,
  reminderStatusLabels,
  type ReminderListItem,
} from '../../../shared/schemas/reminder';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

export function ReminderePage() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<'today' | 'upcoming' | 'sent' | 'failed' | 'all'>('today');
  const [page, setPage] = useState(1);

  const { data, loading, reload } = useIpcQuery<Paginated<ReminderListItem>>(
    () => ddd.reminders.list({ window, page, pageSize: PAGE_SIZE }),
    [window, page],
  );

  return (
    <Stack gap="lg">
      <PageHeader
        title="Remindere"
        description="Notificările generate automat pentru intervențiile care ajung la termen."
      />

      <SegmentedControl
        value={window}
        onChange={(v) => {
          setWindow(v as typeof window);
          setPage(1);
        }}
        data={[
          { value: 'today', label: 'Astăzi' },
          { value: 'upcoming', label: 'Următoarele' },
          { value: 'sent', label: 'Trimise' },
          { value: 'failed', label: 'Eșuate' },
          { value: 'all', label: 'Toate' },
        ]}
      />

      <Card withBorder shadow="sm" padding="lg">
      {!loading && data && data.total === 0 ? (
        <EmptyState
          title="Niciun reminder în această categorie."
          description="Reminderele se generează automat când înregistrezi intervenții."
        />
      ) : (
        <DataTable
          minHeight={200}
          verticalSpacing="sm"
          records={data?.items ?? []}
          fetching={loading}
          totalRecords={data?.total ?? 0}
          recordsPerPage={PAGE_SIZE}
          page={page}
          onPageChange={setPage}
          highlightOnHover
          onRowClick={({ record }) => navigate(`/asociatii/${record.association_id}`)}
          noRecordsText="Niciun reminder."
          columns={[
            {
              accessor: 'scheduled_at',
              title: 'Data',
              render: (r) => fmtDateTime(r.scheduled_at),
            },
            { accessor: 'association_name', title: 'Asociație' },
            { accessor: 'service_name', title: 'Serviciu' },
            { accessor: 'due_date', title: 'Scadență', render: (r) => fmtDate(r.due_date) },
            {
              accessor: 'channel',
              title: 'Canal',
              render: (r) => reminderChannelLabels[r.channel],
            },
            {
              accessor: 'recipient_name',
              title: 'Destinatar',
              render: (r) =>
                r.recipient_name
                  ? `${r.recipient_name}${r.recipient_detail ? ` · ${r.recipient_detail}` : ''}`
                  : '—',
            },
            {
              accessor: 'status',
              title: 'Status',
              render: (r) => (
                <Badge
                  variant="light"
                  color={
                    r.status === 'failed'
                      ? 'red'
                      : r.status === 'sent'
                        ? 'teal'
                        : r.status === 'cancelled' || r.status === 'skipped'
                          ? 'gray'
                          : 'orange'
                  }
                >
                  {reminderStatusLabels[r.status]}
                </Badge>
              ),
            },
            {
              accessor: 'actions',
              title: '',
              render: (r) =>
                r.status === 'failed' ? (
                  <Button
                    size="compact-sm"
                    variant="light"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await runMutation(
                        ddd.reminders.retry({ id: r.id }),
                        'Reminderul va fi reîncercat.',
                      );
                      reload();
                    }}
                  >
                    Reîncearcă
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
      </Card>
    </Stack>
  );
}
