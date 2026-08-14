import { Fragment, useEffect, useState } from 'react';
import { Stack, Button, Select, Card, Text, Table, Group, Tooltip } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconSpray, IconNote } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ServiceBadge } from '../../components/ServiceBadge';
import { DueDate } from '../../components/DueDate';
import { pluralRo, roMediumDate } from '../../../shared/text';
import { daysBetween, todayIso } from '../../../shared/dates';
import { InterventionFormModal } from './InterventionFormModal';
import type { InterventionListItem } from '../../../shared/schemas/intervention';
import type { Paginated } from '../../../shared/schemas/common';
import type { Service } from '../../../shared/schemas/service';

const PAGE_SIZE = 100;

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
  const today = todayIso();

  // Grupare pe zile: separator când se schimbă data (Brief §5.4).
  const items = data?.items ?? [];
  const groups: Array<{ date: string; rows: InterventionListItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === item.performed_date) last.rows.push(item);
    else groups.push({ date: item.performed_date, rows: [item] });
  }

  const anyNotes = items.some((i) => i.notes);

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Intervenții"
        description="Istoricul lucrărilor efectuate. Fiecare intervenție generează automat următoarea scadență."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpen(true)}>
            Adaugă intervenție
          </Button>
        }
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <Select
            placeholder="Toate serviciile"
            clearable
            w={220}
            data={services.map((s) => ({ value: String(s.id), label: s.name }))}
            value={serviceId}
            onChange={(v) => {
              setServiceId(v);
              setPage(1);
            }}
          />
        </Group>

        {isEmpty ? (
          <EmptyState
            icon={<IconSpray size={24} stroke={1.5} />}
            title="Nicio intervenție înregistrată."
            description="Înregistrează prima intervenție — aplicația calculează automat următoarea scadență."
            actionLabel="Adaugă intervenție"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <Table verticalSpacing={6} highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Asociație</Table.Th>
                <Table.Th>Serviciu</Table.Th>
                <Table.Th>Repetare</Table.Th>
                <Table.Th>Următoarea scadență</Table.Th>
                {anyNotes && <Table.Th w={40}></Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {groups.map((group) => (
                <Fragment key={group.date}>
                  <Table.Tr>
                    <Table.Td
                      colSpan={anyNotes ? 5 : 4}
                      style={{
                        background: 'var(--bg-subtle)',
                        fontSize: 'var(--fs-small)',
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        padding: '4px 10px',
                      }}
                    >
                      {roMediumDate(group.date)} ·{' '}
                      {pluralRo(group.rows.length, 'intervenție', 'intervenții')}
                    </Table.Td>
                  </Table.Tr>
                  {group.rows.map((r) => (
                    <Table.Tr
                      key={r.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/asociatii/${r.association_id}`)}
                    >
                      <Table.Td>
                        <Text size="var(--fs-body)" fw={600}>
                          {r.association_name}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <ServiceBadge name={r.service_name} />
                      </Table.Td>
                      <Table.Td>
                        <Text size="var(--fs-body)" c="var(--text-muted)">
                          la {pluralRo(r.interval_months, 'lună', 'luni')}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        {r.next_due_date && r.next_status !== 'completed' && r.next_status !== 'cancelled' ? (
                          <DueDate
                            isoDate={r.next_due_date}
                            daysRemaining={daysBetween(today, r.next_due_date)}
                          />
                        ) : (
                          <Text size="var(--fs-small)" c="var(--text-faint)">
                            {r.next_status === 'completed' ? 'efectuată' : '—'}
                          </Text>
                        )}
                      </Table.Td>
                      {anyNotes && (
                        <Table.Td>
                          {r.notes && (
                            <Tooltip label={r.notes} withArrow multiline maw={320}>
                              <IconNote size={15} color="var(--text-faint)" />
                            </Tooltip>
                          )}
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Fragment>
              ))}
            </Table.Tbody>
          </Table>
        )}
        {data && data.total > PAGE_SIZE && (
          <Group justify="flex-end" mt="var(--sp-3)">
            <Button
              variant="default"
              size="compact-sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              ‹ Anterioare
            </Button>
            <Text size="var(--fs-small)" c="var(--text-muted)">
              Pagina {page} din {Math.ceil(data.total / PAGE_SIZE)}
            </Text>
            <Button
              variant="default"
              size="compact-sm"
              disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
              onClick={() => setPage(page + 1)}
            >
              Următoare ›
            </Button>
          </Group>
        )}
      </Card>

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
