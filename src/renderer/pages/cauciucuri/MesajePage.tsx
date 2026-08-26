/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  Text,
  Card,
  Badge,
  ActionIcon,
  SegmentedControl,
  Modal,
  Select,
  Textarea,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useDebouncedValue } from '@mantine/hooks';
import { IconSearch, IconX, IconMailForward, IconBrandWhatsapp, IconPlus } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap, runMutation } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDateTime } from '../../components/dateUtils';
import {
  tyreMessageLogSources,
  tyreMessageLogSourceLabels,
  tyreSeasonLabels,
} from '../../../shared/schemas/tyre';
import type {
  TyreMessageLogListItem,
  TyreMessageLogStatus,
  TyreClientListItem,
} from '../../../shared/schemas/tyre';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

const statusTone: Record<TyreMessageLogStatus, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  prepared: 'info',
  sent: 'success',
  failed: 'danger',
};
const statusLabels: Record<TyreMessageLogStatus, string> = {
  prepared: 'Pregătit',
  sent: 'Trimis',
  failed: 'Eșuat',
};

/** Trimitere manuală liberă — alegi orice client, fără să pleci de la o mașină/set anume. */
function ManualSendModal({ opened, onClose, onSent }: { opened: boolean; onClose: () => void; onSent: () => void }) {
  const [clients, setClients] = useState<TyreClientListItem[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setClientId(null);
    setMessage('');
    unwrap<Paginated<TyreClientListItem>>(ddd.tyres.clients.list({ page: 1, pageSize: 300 })).then((r) =>
      setClients(r.items),
    );
  }, [opened]);

  const clientOptions = useMemo(
    () => clients.filter((c) => c.phone).map((c) => ({ value: String(c.id), label: `${c.name} · ${c.phone}` })),
    [clients],
  );
  const selectedClient = clients.find((c) => String(c.id) === clientId) ?? null;

  const send = async () => {
    if (!clientId || !message.trim()) return;
    setSending(true);
    const saved = await runMutation(
      ddd.tyres.whatsapp.send({ client_id: Number(clientId), message, source: 'manual' }),
      'WhatsApp s-a deschis cu mesajul pregătit. Apasă Send acolo pentru a-l trimite.',
    );
    setSending(false);
    if (saved) {
      onSent();
      onClose();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Trimite mesaj nou" size="lg">
      <Stack>
        <Select
          label="Client"
          description="Doar clienții cu telefon salvat apar aici."
          placeholder="Alege clientul"
          searchable
          data={clientOptions}
          value={clientId}
          onChange={setClientId}
        />
        <Textarea
          label="Mesaj"
          autosize
          minRows={5}
          disabled={!clientId}
          value={message}
          onChange={(e) => setMessage(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Renunță
          </Button>
          <Button
            leftSection={<IconBrandWhatsapp size={16} />}
            color="green"
            disabled={!clientId || !selectedClient?.phone || !message.trim() || sending}
            onClick={send}
          >
            Deschide WhatsApp
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

/** Istoricul mesajelor WhatsApp (manuale + remindere automate de sezon) + trimitere manuală nouă. */
export function MesajePage() {
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [source, setSource] = useState<(typeof tyreMessageLogSources)[number] | 'all'>('all');
  const [page, setPage] = useState(1);
  const [sendOpen, setSendOpen] = useState(false);

  const { data, loading, reload } = useIpcQuery<Paginated<TyreMessageLogListItem>>(
    () => ddd.tyres.messages.list({ source, search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
    [source, debouncedSearch, page],
  );

  const isEmpty = !loading && data && data.total === 0 && !debouncedSearch && source === 'all';

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Mesaje"
        description="Istoricul mesajelor WhatsApp trimise clienților — manual sau prin remindere automate."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setSendOpen(true)}>
            Trimite mesaj nou
          </Button>
        }
      />

      <Group justify="space-between" wrap="wrap">
        <SegmentedControl
          value={source}
          onChange={(v) => {
            setSource(v as typeof source);
            setPage(1);
          }}
          data={[
            { value: 'all', label: 'Toate' },
            ...tyreMessageLogSources.map((s) => ({ value: s, label: tyreMessageLogSourceLabels[s] })),
          ]}
        />
      </Group>

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            ref={searchRef}
            placeholder="Caută după client sau text mesaj  ·  /"
            leftSection={<IconSearch size={15} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setSearch('')}>
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1, maxWidth: 480 }}
          />
        </Group>

        {isEmpty ? (
          <EmptyState
            icon={<IconMailForward size={24} stroke={1.5} />}
            title="Niciun mesaj trimis încă."
            description="Mesajele trimise manual sau prin remindere automate de sezon apar aici."
            actionLabel="Trimite primul mesaj"
            onAction={() => setSendOpen(true)}
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
            noRecordsText="Niciun mesaj nu corespunde filtrelor."
            columns={[
              {
                accessor: 'created_at',
                title: 'Data',
                render: (r) => <Text size="var(--fs-body)">{fmtDateTime(r.created_at)}</Text>,
              },
              {
                accessor: 'client_name',
                title: 'Client',
                render: (r) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {r.client_name}
                  </Text>
                ),
              },
              {
                accessor: 'source',
                title: 'Sursă',
                render: (r) => (
                  <Group gap={6} wrap="nowrap">
                    <Badge variant="light" color={r.source === 'season_reminder' ? 'grape' : 'gray'} size="sm">
                      {tyreMessageLogSourceLabels[r.source]}
                    </Badge>
                    {r.season && (
                      <Text size="var(--fs-small)" c="dimmed">
                        ({tyreSeasonLabels[r.season].toLowerCase()})
                      </Text>
                    )}
                  </Group>
                ),
              },
              {
                accessor: 'message_preview',
                title: 'Mesaj',
                render: (r) => (
                  <Text size="var(--fs-small)" c="dimmed" truncate maw={360}>
                    {r.message_preview}
                  </Text>
                ),
              },
              {
                accessor: 'status',
                title: 'Status',
                width: 100,
                render: (r) => <StatusBadge tone={statusTone[r.status]}>{statusLabels[r.status]}</StatusBadge>,
              },
            ]}
          />
        )}
      </Card>

      <ManualSendModal
        opened={sendOpen}
        onClose={() => setSendOpen(false)}
        onSent={reload}
      />
    </Stack>
  );
}
