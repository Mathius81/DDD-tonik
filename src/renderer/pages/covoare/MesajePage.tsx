/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useMemo, useState } from 'react';
import { Stack, Group, Text, Card, Button, Modal, Select, Textarea } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconBrandWhatsapp, IconPlus } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap, runMutation } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { fmtDateTime } from '../../components/dateUtils';
import { defaultClientWhatsappMessage } from './covoare-ui';
import type { CarpetClientListItem, CarpetMessageLogItem } from '../../../shared/schemas/carpet';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

/** Modal „mesaj nou": alege clientul (căutare pe nume/telefon), apoi editează textul. */
function NewMessageModal({ opened, onClose, onSent }: { opened: boolean; onClose: () => void; onSent: () => void }) {
  const [clients, setClients] = useState<CarpetClientListItem[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!opened) return;
    setClientId(null);
    setMessage('');
    unwrap<Paginated<CarpetClientListItem>>(ddd.carpets.clients.list({ page: 1, pageSize: 200 })).then((r) =>
      setClients(r.items),
    );
  }, [opened]);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.phone ? `${c.name} · ${c.phone}` : c.name })),
    [clients],
  );

  const selectedClient = clients.find((c) => String(c.id) === clientId) ?? null;

  const pickClient = (id: string | null) => {
    setClientId(id);
    const client = clients.find((c) => String(c.id) === id);
    setMessage(client ? defaultClientWhatsappMessage(client.name) : '');
  };

  const send = async () => {
    if (!clientId) return;
    setSending(true);
    const result = await runMutation(
      ddd.carpets.whatsapp.send({ client_id: Number(clientId), message }),
      'WhatsApp s-a deschis cu mesajul pregătit. Apasă Send acolo pentru a-l trimite.',
    );
    setSending(false);
    if (result) {
      onClose();
      onSent();
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Trimite mesaj nou" size="lg">
      <Stack>
        <Select
          label="Client"
          placeholder="Caută după nume sau telefon"
          description="Numărul de telefon este cel mai rapid mod de a găsi clientul."
          searchable
          required
          data={clientOptions}
          value={clientId}
          onChange={pickClient}
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
            onClick={send}
            disabled={!clientId || !selectedClient?.phone || !message.trim() || sending}
          >
            Deschide WhatsApp
          </Button>
        </Group>
        {clientId && !selectedClient?.phone && (
          <Text size="var(--fs-small)" c="var(--danger)">
            Acest client nu are număr de telefon completat.
          </Text>
        )}
      </Stack>
    </Modal>
  );
}

/**
 * Istoricul mesajelor WhatsApp trimise din Covoare + trimitere manuală nouă.
 * Vezi jurnalul propriu `carpet_message_logs` — izolat de DDD și de Cauciucuri.
 */
export function MesajePage() {
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const { data, loading, reload } = useIpcQuery<Paginated<CarpetMessageLogItem>>(
    () => ddd.carpets.messages.list({ page, pageSize: PAGE_SIZE }),
    [page],
  );

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Mesaje"
        description="Istoricul mesajelor WhatsApp trimise clienților din Covoare."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpen(true)}>
            Trimite mesaj nou
          </Button>
        }
      />

      <Card padding="var(--sp-4)">
        {!loading && data && data.total === 0 ? (
          <EmptyState
            icon={<IconBrandWhatsapp size={24} stroke={1.5} />}
            title="Niciun mesaj trimis încă."
            description="Mesajele trimise manual sau din pagina Remindere apar aici."
            actionLabel="Trimite primul mesaj"
            onAction={() => setModalOpen(true)}
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
            noRecordsText="Niciun mesaj."
            columns={[
              {
                accessor: 'created_at',
                title: 'Data',
                width: 150,
                render: (m) => (
                  <Text size="var(--fs-small)" className="tonik-num" c="var(--text-muted)">
                    {fmtDateTime(m.created_at)}
                  </Text>
                ),
              },
              {
                accessor: 'client_name',
                title: 'Client',
                render: (m) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {m.client_name ?? '—'}
                  </Text>
                ),
              },
              {
                accessor: 'recipient',
                title: 'Telefon',
                render: (m) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                    {m.recipient}
                  </Text>
                ),
              },
              {
                accessor: 'message_preview',
                title: 'Mesaj',
                render: (m) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)" lineClamp={1} maw={380}>
                    {m.message_preview}
                  </Text>
                ),
              },
            ]}
          />
        )}
      </Card>

      <NewMessageModal opened={modalOpen} onClose={() => setModalOpen(false)} onSent={reload} />
    </Stack>
  );
}
