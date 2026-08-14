import { useState } from 'react';
import {
  Stack,
  SegmentedControl,
  Button,
  Text,
  Card,
  Drawer,
  Group,
  Divider,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { IconBrandWhatsapp, IconMail, IconMessage2 } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDateTime } from '../../components/dateUtils';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { messageStatusLabels, type MessageLogListItem } from '../../../shared/schemas/message';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

function ChannelIcon({ channel }: { channel: string }) {
  if (channel === 'whatsapp') return <IconBrandWhatsapp size={15} color="var(--success)" />;
  if (channel === 'email') return <IconMail size={15} color="var(--svc-dezinfectie)" />;
  return <IconMessage2 size={15} color="var(--text-muted)" />;
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (status === 'failed') return 'danger';
  if (status === 'prepared' || status === 'opened') return 'warning';
  return 'success';
}

export function MesajePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'all' | 'prepared' | 'failed'>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MessageLogListItem | null>(null);

  const { data, loading, reload } = useIpcQuery<Paginated<MessageLogListItem>>(
    () => ddd.messages.log({ status, page, pageSize: PAGE_SIZE }),
    [status, page],
  );
  const { data: counts } = useIpcQuery<{ all: number; prepared: number; failed: number }>(
    () => ddd.messages.counts(),
    [],
  );

  const markSent = async (m: MessageLogListItem) => {
    await runMutation(ddd.messages.markSent({ id: m.id }), 'Marcat ca trimis.');
    setSelected(null);
    reload();
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Mesaje"
        description="Istoricul mesajelor trimise sau pregătite pentru clienți."
      />

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v as typeof status);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'all', label: `Toate ${counts?.all ?? ''}`.trim() },
          { value: 'prepared', label: `De confirmat ${counts?.prepared ?? ''}`.trim() },
          { value: 'failed', label: `Eșuate ${counts?.failed ?? ''}`.trim() },
        ]}
      />

      <Card padding="var(--sp-4)">
        {!loading && data && data.total === 0 ? (
          <EmptyState
            title="Niciun mesaj aici."
            description="Mesajele trimise sau pregătite pentru clienți apar automat."
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
            onRowClick={({ record }) => setSelected(record)}
            noRecordsText="Niciun mesaj."
            columns={[
              {
                accessor: 'created_at',
                title: 'Data',
                width: 140,
                render: (m) => (
                  <Text size="var(--fs-small)" className="tonik-num" c="var(--text-muted)">
                    {fmtDateTime(m.created_at)}
                  </Text>
                ),
              },
              {
                accessor: 'association_name',
                title: 'Asociație',
                render: (m) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {m.association_name ?? '—'}
                  </Text>
                ),
              },
              {
                accessor: 'contact_name',
                title: 'Destinatar',
                render: (m) => (
                  <Text size="var(--fs-body)">{m.contact_name ?? m.recipient}</Text>
                ),
              },
              {
                accessor: 'channel',
                title: 'Canal',
                width: 90,
                render: (m) => (
                  <Group gap={5} wrap="nowrap">
                    <ChannelIcon channel={m.channel} />
                    <Text size="var(--fs-small)" c="var(--text-muted)">
                      {m.channel === 'whatsapp' ? 'WhatsApp' : m.channel === 'email' ? 'Email' : 'SMS'}
                    </Text>
                  </Group>
                ),
              },
              {
                accessor: 'message_preview',
                title: 'Mesaj',
                render: (m) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)" lineClamp={1} maw={280}>
                    {m.message_preview}
                  </Text>
                ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 130,
                render: (m) => (
                  <StatusBadge tone={statusTone(m.status)}>
                    {messageStatusLabels[m.status]}
                  </StatusBadge>
                ),
              },
            ]}
          />
        )}
      </Card>

      {/* Panou lateral cu mesajul complet (Brief §5.7) */}
      <Drawer
        opened={!!selected}
        onClose={() => setSelected(null)}
        position="right"
        size={440}
        title={
          <Text fw={600} size="var(--fs-section)">
            Detalii mesaj
          </Text>
        }
      >
        {selected && (
          <Stack gap="var(--sp-3)">
            <div>
              <Text size="var(--fs-small)" c="var(--text-muted)">
                Asociație
              </Text>
              <Text
                fw={600}
                style={{ cursor: selected.association_id ? 'pointer' : 'default' }}
                c={selected.association_id ? 'var(--accent)' : undefined}
                onClick={() =>
                  selected.association_id && navigate(`/asociatii/${selected.association_id}`)
                }
              >
                {selected.association_name ?? '—'}
              </Text>
            </div>
            <Group gap="var(--sp-5)">
              <div>
                <Text size="var(--fs-small)" c="var(--text-muted)">
                  Destinatar
                </Text>
                <Text size="var(--fs-body)">{selected.contact_name ?? selected.recipient}</Text>
                <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                  {selected.recipient}
                </Text>
              </div>
              <div>
                <Text size="var(--fs-small)" c="var(--text-muted)">
                  Canal
                </Text>
                <Group gap={5}>
                  <ChannelIcon channel={selected.channel} />
                  <Text size="var(--fs-body)">
                    {selected.channel === 'whatsapp'
                      ? 'WhatsApp'
                      : selected.channel === 'email'
                        ? 'Email'
                        : 'SMS'}
                  </Text>
                </Group>
              </div>
              <div>
                <Text size="var(--fs-small)" c="var(--text-muted)">
                  Status
                </Text>
                <StatusBadge tone={statusTone(selected.status)}>
                  {messageStatusLabels[selected.status]}
                </StatusBadge>
              </div>
            </Group>
            {selected.error_message && (
              <Text size="var(--fs-small)" c="var(--danger)">
                {selected.error_message}
              </Text>
            )}
            <Divider />
            <div>
              <Text size="var(--fs-small)" c="var(--text-muted)" mb={4}>
                Mesaj · {fmtDateTime(selected.created_at)}
              </Text>
              <Card padding="var(--sp-3)" bg="var(--bg-subtle)" withBorder={false} shadow="none">
                <Text size="var(--fs-body)" style={{ whiteSpace: 'pre-wrap' }}>
                  {selected.message_preview}
                </Text>
              </Card>
            </div>
            {['prepared', 'opened'].includes(selected.status) && (
              <Button onClick={() => markSent(selected)}>Marchează trimis</Button>
            )}
          </Stack>
        )}
      </Drawer>
    </Stack>
  );
}
