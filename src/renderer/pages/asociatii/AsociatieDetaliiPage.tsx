import { useState } from 'react';
import {
  Title,
  Text,
  Stack,
  Group,
  Button,
  Card,
  Table,
  Badge,
  ActionIcon,
  Tabs,
  Menu,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useParams } from 'react-router-dom';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { fmtDate, fmtDateTime } from '../../components/dateUtils';
import { FollowupStatusBadge, DaysRemainingBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { AssociationFormModal } from './AssociationFormModal';
import { ContactFormModal } from './ContactFormModal';
import { InterventionFormModal } from '../interventii/InterventionFormModal';
import { ScheduleFollowupModal } from '../interventii/ScheduleFollowupModal';
import { SendMessageModal } from '../mesaje/SendMessageModal';
import type { Association } from '../../../shared/schemas/association';
import type { Contact } from '../../../shared/schemas/contact';
import type { FollowupListItem } from '../../../shared/schemas/followup';
import type { InterventionListItem } from '../../../shared/schemas/intervention';
import type { MessageLogListItem } from '../../../shared/schemas/message';
import { messageStatusLabels } from '../../../shared/schemas/message';

interface AssociationDetail {
  association: Association;
  contacts: Contact[];
  followups: FollowupListItem[];
  interventions: InterventionListItem[];
  messages: MessageLogListItem[];
}

export function AsociatieDetaliiPage() {
  const { id } = useParams();
  const associationId = Number(id);

  const [editOpen, setEditOpen] = useState(false);
  const [contactModal, setContactModal] = useState<{ open: boolean; contact: Contact | null }>({
    open: false,
    contact: null,
  });
  const [interventionModal, setInterventionModal] = useState<{
    open: boolean;
    followup: FollowupListItem | null;
  }>({ open: false, followup: null });
  const [scheduleFollowup, setScheduleFollowup] = useState<FollowupListItem | null>(null);
  const [messageFollowup, setMessageFollowup] = useState<FollowupListItem | null>(null);

  const { data, loading, reload } = useIpcQuery<AssociationDetail>(
    () => ddd.associations.get({ id: associationId }),
    [associationId],
  );

  if (loading || !data) {
    return <Text c="dimmed">Se încarcă...</Text>;
  }

  const { association, contacts, followups, interventions, messages } = data;
  const openFollowups = followups.filter((f) =>
    ['pending', 'contacted', 'scheduled'].includes(f.status),
  );

  const confirmDeleteContact = (contact: Contact) =>
    modals.openConfirmModal({
      title: 'Șterge contact',
      children: (
        <Text size="sm">
          Sigur vrei să ștergi contactul <b>{contact.name}</b>? Istoricul mesajelor rămâne păstrat.
        </Text>
      ),
      labels: { confirm: 'Șterge', cancel: 'Renunță' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await runMutation(ddd.contacts.delete({ id: contact.id }), 'Contactul a fost șters.');
        reload();
      },
    });

  const markContacted = async (f: FollowupListItem) => {
    await runMutation(ddd.followups.markContacted({ id: f.id }), 'Marcat drept contactat.');
    reload();
  };

  return (
    <Stack>
      <Group justify="space-between" align="flex-start">
        <div>
          <Group gap="sm">
            <Title order={2}>{association.name}</Title>
            {!association.active && <Badge color="gray">Inactivă</Badge>}
          </Group>
          <Text c="dimmed">
            {[association.address, association.city, association.county].filter(Boolean).join(', ')}
            {association.tax_id ? ` · CUI ${association.tax_id}` : ''}
          </Text>
        </div>
        <Group>
          <Button onClick={() => setInterventionModal({ open: true, followup: null })}>
            + Intervenție
          </Button>
          <Button variant="light" onClick={() => setContactModal({ open: true, contact: null })}>
            + Contact
          </Button>
          <Button variant="default" onClick={() => setEditOpen(true)}>
            Editare
          </Button>
        </Group>
      </Group>

      <Tabs defaultValue="urmatoarele">
        <Tabs.List>
          <Tabs.Tab value="urmatoarele">Următoarele intervenții</Tabs.Tab>
          <Tabs.Tab value="contacte">Contacte</Tabs.Tab>
          <Tabs.Tab value="istoric">Istoric intervenții</Tabs.Tab>
          <Tabs.Tab value="comunicare">Istoric comunicare</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="urmatoarele" pt="md">
          {openFollowups.length === 0 ? (
            <EmptyState
              title="Nicio intervenție viitoare."
              description="Înregistrează o intervenție pentru a genera automat următoarea programare."
              actionLabel="+ Intervenție"
              onAction={() => setInterventionModal({ open: true, followup: null })}
            />
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Serviciu</Table.Th>
                  <Table.Th>Data următoare</Table.Th>
                  <Table.Th>Zile rămase</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Programare</Table.Th>
                  <Table.Th>Acțiuni</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {openFollowups.map((f) => (
                  <Table.Tr key={f.id}>
                    <Table.Td>{f.service_name}</Table.Td>
                    <Table.Td>{fmtDate(f.due_date)}</Table.Td>
                    <Table.Td>
                      <DaysRemainingBadge days={f.days_remaining} />
                    </Table.Td>
                    <Table.Td>
                      <FollowupStatusBadge status={f.status} />
                    </Table.Td>
                    <Table.Td>
                      {f.scheduled_date
                        ? `${fmtDate(f.scheduled_date)}${f.scheduled_time ? ` ${f.scheduled_time}` : ''}`
                        : '—'}
                    </Table.Td>
                    <Table.Td>
                      <Menu withinPortal position="bottom-end">
                        <Menu.Target>
                          <Button size="compact-sm" variant="light">
                            Acțiuni
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {f.status === 'pending' && (
                            <Menu.Item onClick={() => markContacted(f)}>
                              Marchează contactat
                            </Menu.Item>
                          )}
                          {['pending', 'contacted'].includes(f.status) && (
                            <Menu.Item onClick={() => setScheduleFollowup(f)}>
                              Programează
                            </Menu.Item>
                          )}
                          {f.status === 'scheduled' && (
                            <Menu.Item
                              onClick={() => setInterventionModal({ open: true, followup: f })}
                            >
                              Marchează intervenția efectuată
                            </Menu.Item>
                          )}
                          <Menu.Item onClick={() => setMessageFollowup(f)}>
                            Trimite mesaj
                          </Menu.Item>
                          <Menu.Divider />
                          <Menu.Item
                            color="red"
                            onClick={() =>
                              modals.openConfirmModal({
                                title: 'Anulează follow-up',
                                children: (
                                  <Text size="sm">
                                    Sigur anulezi urmărirea pentru {f.service_name} din{' '}
                                    {fmtDate(f.due_date)}? Reminderele asociate vor fi anulate.
                                  </Text>
                                ),
                                labels: { confirm: 'Anulează follow-up', cancel: 'Renunță' },
                                confirmProps: { color: 'red' },
                                onConfirm: async () => {
                                  await runMutation(
                                    ddd.followups.cancel({ id: f.id }),
                                    'Follow-up-ul a fost anulat.',
                                  );
                                  reload();
                                },
                              })
                            }
                          >
                            Anulează
                          </Menu.Item>
                        </Menu.Dropdown>
                      </Menu>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="contacte" pt="md">
          {contacts.length === 0 ? (
            <EmptyState
              title="Niciun contact."
              description="Adaugă persoana de contact a asociației."
              actionLabel="+ Adaugă persoană de contact"
              onAction={() => setContactModal({ open: true, contact: null })}
            />
          ) : (
            <Stack>
              {contacts.map((c) => (
                <Card key={c.id} withBorder padding="sm">
                  <Group justify="space-between">
                    <div>
                      <Group gap="xs">
                        <Text fw={600}>{c.name}</Text>
                        <Badge variant="light">{c.role}</Badge>
                        {c.is_primary && <Badge color="teal">Principal</Badge>}
                        {c.do_not_contact && <Badge color="red">Nu contacta</Badge>}
                      </Group>
                      <Text size="sm" c="dimmed">
                        {[c.phone, c.email].filter(Boolean).join(' · ') || 'Fără date de contact'}
                      </Text>
                    </div>
                    <Group gap="xs">
                      <Button
                        size="compact-sm"
                        variant="default"
                        onClick={() => setContactModal({ open: true, contact: c })}
                      >
                        Editează
                      </Button>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => confirmDeleteContact(c)}
                        aria-label="Șterge contact"
                      >
                        ✕
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="istoric" pt="md">
          {interventions.length === 0 ? (
            <EmptyState title="Nicio intervenție înregistrată." />
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Serviciu</Table.Th>
                  <Table.Th>Repetare</Table.Th>
                  <Table.Th>Observații</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {interventions.map((i) => (
                  <Table.Tr key={i.id}>
                    <Table.Td>{fmtDate(i.performed_date)}</Table.Td>
                    <Table.Td>{i.service_name}</Table.Td>
                    <Table.Td>{i.interval_months} luni</Table.Td>
                    <Table.Td>{i.notes ?? '—'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="comunicare" pt="md">
          {messages.length === 0 ? (
            <EmptyState title="Niciun mesaj trimis către această asociație." />
          ) : (
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Data</Table.Th>
                  <Table.Th>Canal</Table.Th>
                  <Table.Th>Destinatar</Table.Th>
                  <Table.Th>Mesaj</Table.Th>
                  <Table.Th>Status</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {messages.map((m) => (
                  <Table.Tr key={m.id}>
                    <Table.Td>{fmtDateTime(m.created_at)}</Table.Td>
                    <Table.Td>{m.channel === 'whatsapp' ? 'WhatsApp' : m.channel === 'email' ? 'Email' : 'SMS'}</Table.Td>
                    <Table.Td>{m.contact_name ?? m.recipient}</Table.Td>
                    <Table.Td>
                      <Text size="sm" lineClamp={1} maw={300}>
                        {m.message_preview}
                      </Text>
                    </Table.Td>
                    <Table.Td>{messageStatusLabels[m.status]}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Tabs.Panel>
      </Tabs>

      {association.notes && (
        <Card withBorder>
          <Text fw={600} mb="xs">
            Observații
          </Text>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {association.notes}
          </Text>
        </Card>
      )}

      <AssociationFormModal
        opened={editOpen}
        onClose={() => setEditOpen(false)}
        association={association}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />
      <ContactFormModal
        opened={contactModal.open}
        onClose={() => setContactModal({ open: false, contact: null })}
        associationId={associationId}
        contact={contactModal.contact}
        onSaved={() => {
          setContactModal({ open: false, contact: null });
          reload();
        }}
      />
      <InterventionFormModal
        opened={interventionModal.open}
        onClose={() => setInterventionModal({ open: false, followup: null })}
        associationId={associationId}
        fromFollowup={interventionModal.followup}
        onSaved={() => {
          setInterventionModal({ open: false, followup: null });
          reload();
        }}
      />
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
