import { useState } from 'react';
import { Stack, Text, SimpleGrid, Button, Menu, Card, Group } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconAlertTriangle,
  IconClockExclamation,
  IconCalendarTime,
  IconCalendarCheck,
  IconMailX,
  IconDotsVertical,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import { FollowupStatusBadge, DaysRemainingBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { ScheduleFollowupModal } from '../interventii/ScheduleFollowupModal';
import { SendMessageModal } from '../mesaje/SendMessageModal';
import { DataTable } from 'mantine-datatable';
import type { DashboardData } from '../../../shared/schemas/dashboard';
import type { FollowupListItem } from '../../../shared/schemas/followup';

export function DashboardPage() {
  const navigate = useNavigate();
  const [scheduleFollowup, setScheduleFollowup] = useState<FollowupListItem | null>(null);
  const [messageFollowup, setMessageFollowup] = useState<FollowupListItem | null>(null);

  const { data, loading, reload } = useIpcQuery<DashboardData>(() => ddd.dashboard.get(), []);

  const markContacted = async (f: FollowupListItem) => {
    await runMutation(ddd.followups.markContacted({ id: f.id }), 'Marcat drept contactat.');
    reload();
  };

  const counts = data?.counts;

  return (
    <Stack gap="xl">
      <PageHeader
        title="Dashboard"
        description="Privire de ansamblu asupra intervențiilor care ajung la termen și a clienților care trebuie contactați."
      />

      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        <StatCard
          label="Restante"
          value={counts?.overdue ?? '…'}
          color="red"
          icon={<IconAlertTriangle size={22} stroke={1.7} />}
          emphasized={(counts?.overdue ?? 0) > 0}
          onClick={() => navigate('/remindere')}
        />
        <StatCard
          label="Următoarele 7 zile"
          value={counts?.next7 ?? '…'}
          color="orange"
          icon={<IconClockExclamation size={22} stroke={1.7} />}
        />
        <StatCard
          label="Următoarele 30 zile"
          value={counts?.next30 ?? '…'}
          color="yellow"
          icon={<IconCalendarTime size={22} stroke={1.7} />}
        />
        <StatCard
          label="Programate"
          value={counts?.scheduled ?? '…'}
          color="tonik"
          icon={<IconCalendarCheck size={22} stroke={1.7} />}
          onClick={() => navigate('/calendar')}
        />
      </SimpleGrid>

      {counts && counts.failed_messages > 0 && (
        <Card
          withBorder
          padding="md"
          className="tonik-hover-card"
          style={{
            cursor: 'pointer',
            borderColor: 'var(--mantine-color-red-3)',
            backgroundColor: 'var(--mantine-color-red-0)',
          }}
          onClick={() => navigate('/mesaje')}
        >
          <Group gap="sm">
            <IconMailX size={20} color="var(--mantine-color-red-7)" />
            <Text size="sm" fw={550} c="red.8">
              {counts.failed_messages}{' '}
              {counts.failed_messages === 1 ? 'mesaj eșuat necesită' : 'mesaje eșuate necesită'}{' '}
              atenția ta
            </Text>
          </Group>
        </Card>
      )}

      <Card withBorder shadow="sm" padding="lg">
        <Text fw={650} size="md" mb="md">
          Necesită atenție
        </Text>
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
            verticalSpacing="sm"
            noRecordsText=""
            columns={[
              {
                accessor: 'association_name',
                title: 'Asociație',
                render: (f) => (
                  <Text
                    size="sm"
                    fw={550}
                    c="tonik.8"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/asociatii/${f.association_id}`)}
                  >
                    {f.association_name}
                  </Text>
                ),
              },
              { accessor: 'service_name', title: 'Serviciu' },
              {
                accessor: 'due_date',
                title: 'Data următoare',
                render: (f) => fmtDate(f.due_date),
              },
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
                  f.primary_contact_name ? (
                    <div>
                      <Text size="sm">{f.primary_contact_name}</Text>
                      {f.primary_contact_phone && (
                        <Text size="xs" c="dimmed">
                          {f.primary_contact_phone}
                        </Text>
                      )}
                    </div>
                  ) : (
                    '—'
                  ),
              },
              {
                accessor: 'actions',
                title: '',
                textAlign: 'right',
                render: (f) => (
                  <Menu withinPortal position="bottom-end" shadow="md">
                    <Menu.Target>
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        color="gray"
                        px={6}
                        aria-label="Acțiuni"
                      >
                        <IconDotsVertical size={17} />
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => navigate(`/asociatii/${f.association_id}`)}>
                        Vezi asociația
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
      </Card>

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
