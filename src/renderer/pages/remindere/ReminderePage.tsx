import { useState } from 'react';
import { Stack, SegmentedControl, Button, Card, Text, Anchor } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate, Link } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate, fmtDateTime } from '../../components/dateUtils';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { ServiceBadge } from '../../components/ServiceBadge';
import {
  reminderChannelLabels,
  reminderStatusLabels,
  type ReminderListItem,
  type ReminderStatus,
} from '../../../shared/schemas/reminder';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

type WindowKey = 'today' | 'upcoming' | 'sent' | 'failed' | 'all';

function statusTone(s: ReminderStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (s === 'failed') return 'danger';
  if (s === 'sent') return 'success';
  if (s === 'cancelled' || s === 'skipped') return 'neutral';
  return 'warning';
}

export function ReminderePage() {
  const navigate = useNavigate();
  const [window, setWindow] = useState<WindowKey>('today');
  const [page, setPage] = useState(1);

  const { data, loading, reload } = useIpcQuery<Paginated<ReminderListItem>>(
    () => ddd.reminders.list({ window, page, pageSize: PAGE_SIZE }),
    [window, page],
  );
  const { data: counts } = useIpcQuery<Record<WindowKey, number>>(
    () => ddd.reminders.counts(),
    [],
  );

  const tabLabel = (key: WindowKey, label: string) =>
    counts ? `${label} ${counts[key]}` : label;

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Remindere"
        description="Notificările generate automat pentru intervențiile care ajung la termen."
      />

      <Text size="var(--fs-small)" c="var(--text-muted)">
        Reminderele se creează automat la înregistrarea unei intervenții, cu numărul de zile ales
        înainte de scadență.{' '}
        <Anchor component={Link} to="/setari" size="var(--fs-small)" c="var(--accent)">
          Vezi regulile în Setări → Remindere
        </Anchor>
      </Text>

      <SegmentedControl
        value={window}
        onChange={(v) => {
          setWindow(v as WindowKey);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'today', label: tabLabel('today', 'Astăzi') },
          { value: 'upcoming', label: tabLabel('upcoming', 'Următoarele') },
          { value: 'sent', label: tabLabel('sent', 'Trimise') },
          { value: 'failed', label: tabLabel('failed', 'Eșuate') },
          { value: 'all', label: tabLabel('all', 'Toate') },
        ]}
      />

      <Card padding="var(--sp-4)">
        {!loading && data && data.total === 0 ? (
          <EmptyState
            title="Niciun reminder aici."
            description="Reminderele apar automat când înregistrezi o intervenție."
            actionLabel="Adaugă intervenție"
            onAction={() => navigate('/interventii')}
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
            onRowClick={({ record }) => navigate(`/asociatii/${record.association_id}`)}
            noRecordsText="Niciun reminder."
            columns={[
              {
                accessor: 'scheduled_at',
                title: 'Programat',
                width: 140,
                render: (r) => (
                  <Text size="var(--fs-small)" className="tonik-num" c="var(--text-muted)">
                    {fmtDateTime(r.scheduled_at)}
                  </Text>
                ),
              },
              {
                accessor: 'association_name',
                title: 'Asociație',
                render: (r) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {r.association_name}
                  </Text>
                ),
              },
              {
                accessor: 'service_name',
                title: 'Serviciu',
                render: (r) => <ServiceBadge name={r.service_name} />,
              },
              {
                accessor: 'due_date',
                title: 'Scadență',
                width: 110,
                render: (r) => (
                  <Text size="var(--fs-body)" className="tonik-num">
                    {fmtDate(r.due_date)}
                  </Text>
                ),
              },
              {
                accessor: 'channel',
                title: 'Canal',
                width: 130,
                render: (r) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {reminderChannelLabels[r.channel]}
                  </Text>
                ),
              },
              {
                accessor: 'recipient_name',
                title: 'Destinatar',
                render: (r) =>
                  r.recipient_name ? (
                    <div>
                      <Text size="var(--fs-body)">{r.recipient_name}</Text>
                      {r.recipient_detail && (
                        <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                          {r.recipient_detail}
                        </Text>
                      )}
                    </div>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      —
                    </Text>
                  ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 120,
                render: (r) => (
                  <StatusBadge tone={statusTone(r.status)}>
                    {reminderStatusLabels[r.status]}
                  </StatusBadge>
                ),
              },
              {
                accessor: 'actions',
                title: '',
                width: 110,
                render: (r) =>
                  r.status === 'failed' ? (
                    <Button
                      size="compact-sm"
                      variant="light"
                      onClick={async (e) => {
                        e.stopPropagation();
                        await runMutation(ddd.reminders.retry({ id: r.id }), 'Repus în coadă.');
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
