import { useState } from 'react';
import { Title, Stack, SegmentedControl, Button, Text } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDateTime } from '../../components/dateUtils';
import { EmptyState } from '../../components/EmptyState';
import { messageStatusLabels, type MessageLogListItem } from '../../../shared/schemas/message';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

const channelLabels: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };

export function MesajePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'all' | 'prepared' | 'failed'>('all');
  const [page, setPage] = useState(1);

  const { data, loading, reload } = useIpcQuery<Paginated<MessageLogListItem>>(
    () => ddd.messages.log({ status, page, pageSize: PAGE_SIZE }),
    [status, page],
  );

  return (
    <Stack>
      <Title order={2}>Mesaje</Title>

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v as typeof status);
          setPage(1);
        }}
        data={[
          { value: 'all', label: 'Toate' },
          { value: 'prepared', label: 'De confirmat' },
          { value: 'failed', label: 'Eșuate' },
        ]}
      />

      {!loading && data && data.total === 0 ? (
        <EmptyState
          title="Niciun mesaj."
          description="Mesajele trimise sau pregătite pentru clienți vor apărea aici."
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
          onRowClick={({ record }) =>
            record.association_id && navigate(`/asociatii/${record.association_id}`)
          }
          noRecordsText="Niciun mesaj."
          columns={[
            { accessor: 'created_at', title: 'Data', render: (m) => fmtDateTime(m.created_at) },
            {
              accessor: 'association_name',
              title: 'Asociație',
              render: (m) => m.association_name ?? '—',
            },
            {
              accessor: 'contact_name',
              title: 'Destinatar',
              render: (m) => m.contact_name ?? m.recipient,
            },
            { accessor: 'channel', title: 'Canal', render: (m) => channelLabels[m.channel] },
            {
              accessor: 'message_preview',
              title: 'Mesaj',
              render: (m) => (
                <Text size="sm" lineClamp={1} maw={280}>
                  {m.message_preview}
                </Text>
              ),
            },
            {
              accessor: 'status',
              title: 'Status',
              render: (m) => messageStatusLabels[m.status],
            },
            {
              accessor: 'actions',
              title: '',
              render: (m) =>
                m.status === 'prepared' || m.status === 'opened' ? (
                  <Button
                    size="compact-sm"
                    variant="light"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await runMutation(
                        ddd.messages.markSent({ id: m.id }),
                        'Mesajul a fost marcat ca trimis.',
                      );
                      reload();
                    }}
                  >
                    Marchează ca trimis
                  </Button>
                ) : null,
            },
          ]}
        />
      )}
    </Stack>
  );
}
