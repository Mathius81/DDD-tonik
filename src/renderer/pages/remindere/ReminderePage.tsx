/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useMemo, useState } from 'react';
import { Stack, SegmentedControl, Button, Card, Text, Anchor, Group, Tooltip } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconUsersGroup } from '@tabler/icons-react';
import { useNavigate, Link } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate, fmtDateTime } from '../../components/dateUtils';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { ServiceBadge } from '../../components/ServiceBadge';
import { AdminSituationWhatsappButton } from '../administratori/AdminSituationWhatsappButton';
import {
  reminderChannelLabels,
  reminderStatusLabels,
  type ReminderListItem,
  type ReminderStatus,
} from '../../../shared/schemas/reminder';
import type { AdministratorGroup } from '../../../shared/schemas/contact';
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

  // Telefoanele de pe reminderele WhatsApp afișate acum — folosite ca să depistăm dacă mai
  // multe remindere de pe pagina curentă aparțin de fapt ACELEIAȘI persoane (administrator cu
  // mai multe asociații), ca să-i putem trimite o singură situație agregată în loc de mai
  // multe mesaje separate. Normalizarea telefonului rămâne în main (`administrators.repo`);
  // aici lucrăm doar cu telefonul brut, așa cum apare pe reminder.
  const whatsappPhones = useMemo(() => {
    const set = new Set<string>();
    for (const r of data?.items ?? []) {
      if (r.channel === 'whatsapp' && r.recipient_detail) set.add(r.recipient_detail);
    }
    return Array.from(set);
  }, [data]);

  const { data: adminGroups } = useIpcQuery<Record<string, AdministratorGroup>>(
    () => ddd.administrators.getByPhones({ phones: whatsappPhones }),
    [whatsappPhones],
  );

  /** Grupurile cu mai mult de o asociație, prezente printre reminderele curente. */
  const multiAssociationGroups = useMemo(() => {
    if (!adminGroups) return [];
    const seen = new Map<string, AdministratorGroup>();
    for (const group of Object.values(adminGroups)) {
      if (group.associations_count > 1) seen.set(group.phone, group);
    }
    return Array.from(seen.values());
  }, [adminGroups]);

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

      {multiAssociationGroups.length > 0 && (
        <Card padding="var(--sp-4)" style={{ borderLeft: '3px solid var(--accent)' }}>
          <Stack gap="var(--sp-3)">
            <Group gap={8}>
              <IconUsersGroup size={17} color="var(--accent)" />
              <Text size="var(--fs-body)" fw={600}>
                {multiAssociationGroups.length === 1
                  ? 'O persoană de mai jos administrează mai multe asociații.'
                  : `${multiAssociationGroups.length} persoane de mai jos administrează mai multe asociații.`}
              </Text>
            </Group>
            <Text size="var(--fs-small)" c="var(--text-muted)">
              Trimite-i o singură situație completă, cu toate asociațiile ei, în loc de câte un
              mesaj separat pentru fiecare.
            </Text>
            <Stack gap={6}>
              {multiAssociationGroups.map((g) => (
                <Group key={g.phone} justify="space-between" wrap="nowrap">
                  <Text size="var(--fs-body)">
                    {g.display_name}{' '}
                    <Text span c="var(--text-muted)" size="var(--fs-small)" className="tonik-num">
                      ({g.phone_display}) · {g.associations_count} asociații
                    </Text>
                  </Text>
                  <AdminSituationWhatsappButton
                    phone={g.phone_display}
                    label="Trimite situația"
                    subtitle={`${g.display_name} · ${g.phone_display} · ${g.associations_count} asociații`}
                  />
                </Group>
              ))}
            </Stack>
          </Stack>
        </Card>
      )}

      <Card padding="var(--sp-4)">
        {data && data.total === 0 ? (
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
                render: (r) => {
                  const group =
                    r.channel === 'whatsapp' && r.recipient_detail
                      ? adminGroups?.[r.recipient_detail]
                      : undefined;
                  const isMulti = !!group && group.associations_count > 1;
                  return r.recipient_name ? (
                    <div>
                      <Group gap={4} wrap="nowrap">
                        <Text size="var(--fs-body)">{r.recipient_name}</Text>
                        {isMulti && (
                          <Tooltip label={`Administrează ${group!.associations_count} asociații`}>
                            <IconUsersGroup size={14} color="var(--accent)" />
                          </Tooltip>
                        )}
                      </Group>
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
                  );
                },
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
