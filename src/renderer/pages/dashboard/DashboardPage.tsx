import { useState } from 'react';
import { Title, Stack, Card, Text, SimpleGrid, Button, Menu } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import { FollowupStatusBadge, DaysRemainingBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { ScheduleFollowupModal } from '../interventii/ScheduleFollowupModal';
import { SendMessageModal } from '../mesaje/SendMessageModal';
import { DataTable } from 'mantine-datatable';
import type { DashboardData } from '../../../shared/schemas/dashboard';
import type { FollowupListItem } from '../../../shared/schemas/followup';

interface StatCard {
  label: string;
  icon: string;
  color: string;
  value: (d: DashboardData) => number;
}

const cards: StatCard[] = [
  { label: 'Restante', icon: '🔴', color: 'red', value: (d) => d.counts.overdue },
  { label: 'Următoarele 7 zile', icon: '🟠', color: 'orange', value: (d) => d.counts.next7 },
  { label: 'Următoarele 30 zile', icon: '🟡', color: 'yellow', value: (d) => d.counts.next30 },
  { label: 'Programate', icon: '🟢', color: 'green', value: (d) => d.counts.scheduled },
];

export function DashboardPage() {
  const navigate = useNavigate();
  const [scheduleFollowup, setScheduleFollowup] = useState<FollowupListItem | null>(null);
  const [messageFollowup, setMessageFollowup] = useState<FollowupListItem | null>(null);

  const { data, loading, reload } = useIpcQuery<DashboardData>(() => ddd.dashboard.get(), []);

  const markContacted = async (f: FollowupListItem) => {
    await runMutation(ddd.followups.markContacted({ id: f.id }), 'Marcat drept contactat.');
    reload();
  };

  return (
    <Stack>
      <Title order={2}>Dashboard</Title>

      <SimpleGrid cols={{ base: 2, md: data && data.counts.failed_messages > 0 ? 5 : 4 }}>
        {cards.map((c) => (
          <Card key={c.label} withBorder padding="md">
            <Text size="sm" c="dimmed">
              {c.icon} {c.label}
            </Text>
            <Text size="xl" fw={700}>
              {data ? c.value(data) : '…'}
            </Text>
          </Card>
        ))}
        {data && data.counts.failed_messages > 0 && (
          <Card
            withBorder
            padding="md"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/mesaje')}
          >
            <Text size="sm" c="red">
              ⚠ Mesaje eșuate
            </Text>
            <Text size="xl" fw={700} c="red">
              {data.counts.failed_messages}
            </Text>
          </Card>
        )}
      </SimpleGrid>

      <Title order={4}>Necesită atenție</Title>
      {!loading && data && data.attention.length === 0 ? (
        <EmptyState
          title="Totul este la zi."
          description="Nicio asociație nu trebuie contactată în următoarele 30 de zile."
        />
      ) : (
        <DataTable
          minHeight={160}
          records={data?.attention ?? []}
          fetching={loading}
          highlightOnHover
          noRecordsText=""
          columns={[
            {
              accessor: 'association_name',
              title: 'Asociație',
              render: (f) => (
                <Text
                  size="sm"
                  fw={500}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/asociatii/${f.association_id}`)}
                >
                  {f.association_name}
                </Text>
              ),
            },
            { accessor: 'service_name', title: 'Serviciu' },
            { accessor: 'due_date', title: 'Data următoare', render: (f) => fmtDate(f.due_date) },
            {
              accessor: 'days_remaining',
              title: 'Zile rămase',
              render: (f) => <DaysRemainingBadge days={f.days_remaining} />,
            },
            {
              accessor: 'status',
              title: 'Status',
              render: (f) => <FollowupStatusBadge status={f.status} />,
            },
            {
              accessor: 'primary_contact_name',
              title: 'Contact',
              render: (f) =>
                f.primary_contact_name
                  ? `${f.primary_contact_name}${f.primary_contact_phone ? ` · ${f.primary_contact_phone}` : ''}`
                  : '—',
            },
            {
              accessor: 'actions',
              title: 'Acțiuni',
              render: (f) => (
                <Menu withinPortal position="bottom-end">
                  <Menu.Target>
                    <Button size="compact-sm" variant="light">
                      Acțiuni
                    </Button>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => navigate(`/asociatii/${f.association_id}`)}>
                      Vezi
                    </Menu.Item>
                    <Menu.Item onClick={() => setMessageFollowup(f)}>Contactează</Menu.Item>
                    {f.status === 'pending' && (
                      <Menu.Item onClick={() => markContacted(f)}>Marchează contactat</Menu.Item>
                    )}
                    <Menu.Item onClick={() => setScheduleFollowup(f)}>Programează</Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              ),
            },
          ]}
        />
      )}

      <ScheduleFollowupModal
        followup={scheduleFollowup}
        onClose={() => setScheduleFollowup(null)}
        onSaved={() => {
          setScheduleFollowup(null);
          reload();
        }}
      />
      <SendMessageModal
        followup={messageFollowup}
        onClose={() => setMessageFollowup(null)}
        onSent={() => {
          setMessageFollowup(null);
          reload();
        }}
      />
    </Stack>
  );
}
