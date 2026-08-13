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
  Anchor,
  Breadcrumbs,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { useParams, Link } from 'react-router-dom';
import {
  IconPlus,
  IconUserPlus,
  IconPencil,
  IconDotsVertical,
  IconTrash,
  IconMapPin,
  IconCalendarRepeat,
  IconUsers,
  IconHistory,
  IconMessages,
} from '@tabler/icons-react';
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
    <Stack gap="lg">
      <Breadcrumbs separatorMargin={6}>
        <Anchor component={Link} to="/asociatii" size="sm" c="dimmed">
          Asociații
        </Anchor>
        <Text size="sm" c="dimmed">
          {association.name}
        </Text>
      </Breadcrumbs>

      <Card withBorder shadow="sm" padding="xl">
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Stack gap={6}>
            <Group gap="sm">
              <Title order={2} style={{ letterSpacing: '-0.02em' }}>
                {association.name}
              </Title>
              {!association.active && (
                <Badge color="gray" variant="light">
                  Inactivă
                </Badge>
              )}
            </Group>
            <Group gap={6}>
              <IconMapPin size={15} color="var(--mantine-color-gray-5)" />
              <Text size="sm" c="dimmed">
                {[association.address, association.city, association.county]
                  .filter(Boolean)
                  .join(', ')}
                {association.tax_id ? ` · CUI ${association.tax_id}` : ''}
              </Text>
            </Group>
          </Stack>
          <Group gap="sm">
            <Button
              leftSection={<IconPlus size={17} />}
              onClick={() => setInterventionModal({ open: true, followup: null })}
            >
              Intervenție
            </Button>
            <Button
              variant="light"
              leftSection={<IconUserPlus size={17} />}
              onClick={() => setContactModal({ open: true, contact: null })}
            >
              Contact
            </Button>
            <Button
              variant="default"
              leftSection={<IconPencil size={16} />}
              onClick={() => setEditOpen(true)}
            >
              Editare
            </Button>
          </Group>
        </Group>
      </Card>

      <Tabs defaultValue="urmatoarele" variant="pills" radius="md" color="tonik">
        <Tabs.List mb="lg" style={{ gap: 4 }}>
          <Tabs.Tab value="urmatoarele" leftSection={<IconCalendarRepeat size={16} stroke={1.7} />}>
            Următoarele intervenții
          </Tabs.Tab>
          <Tabs.Tab value="contacte" leftSection={<IconUsers size={16} stroke={1.7} />}>
            Contacte
          </Tabs.Tab>
          <Tabs.Tab value="istoric" leftSection={<IconHistory size={16} stroke={1.7} />}>
            Istoric intervenții
          </Tabs.Tab>
          <Tabs.Tab value="comunicare" leftSection={<IconMessages size={16} stroke={1.7} />}>
            Istoric comunicare
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="urmatoarele">
          <Card withBorder shadow="sm" padding="lg">
            {openFollowups.length === 0 ? (
              <EmptyState
                title="Nicio intervenție viitoare."
                description="Înregistrează o intervenție pentru a genera automat următoarea programare."
                actionLabel="Adaugă intervenție"
                onAction={() => setInterventionModal({ open: true, followup: null })}
              />
            ) : (
              <Table verticalSpacing="sm" highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Serviciu</Table.Th>
                    <Table.Th>Data următoare</Table.Th>
                    <Table.Th>Zile rămase</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th>Programare</Table.Th>
                    <Table.Th></Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {openFollowups.map((f) => (
                    <Table.Tr key={f.id}>
                      <Table.Td>
                        <Text size="sm" fw={550}>
                          {f.service_name}
                        </Text>
                      </Table.Td>
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
                      <Table.Td align="right">
                        <Menu withinPortal position="bottom-end" shadow="md">
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label="Acțiuni">
                              <IconDotsVertical size={17} />
                            </ActionIcon>
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
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="contacte">
          {contacts.length === 0 ? (
            <Card withBorder shadow="sm" padding="lg">
              <EmptyState
                title="Niciun contact."
                description="Adaugă persoana de contact a asociației."
                actionLabel="Adaugă persoană de contact"
                onAction={() => setContactModal({ open: true, contact: null })}
              />
            </Card>
          ) : (
            <Stack gap="sm">
              {contacts.map((c) => (
                <Card key={c.id} withBorder shadow="xs" padding="md">
                  <Group justify="space-between">
                    <div>
                      <Group gap="xs">
                        <Text fw={600}>{c.name}</Text>
                        <Badge variant="light" color="gray">
                          {c.role}
                        </Badge>
                        {c.is_primary && (
                          <Badge color="teal" variant="light">
                            Principal
                          </Badge>
                        )}
                        {c.do_not_contact && (
                          <Badge color="red" variant="light">
                            Nu contacta
                          </Badge>
                        )}
                      </Group>
                      <Text size="sm" c="dimmed" mt={2}>
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
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>
                </Card>
              ))}
            </Stack>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="istoric">
          <Card withBorder shadow="sm" padding="lg">
            {interventions.length === 0 ? (
              <EmptyState title="Nicio intervenție înregistrată." />
            ) : (
              <Table verticalSpacing="sm" highlightOnHover>
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
                      <Table.Td>
                        <Text size="sm" fw={550}>
                          {i.service_name}
                        </Text>
                      </Table.Td>
                      <Table.Td>{i.interval_months} luni</Table.Td>
                      <Table.Td>
                        <Text size="sm" c="dimmed">
                          {i.notes ?? '—'}
                        </Text>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>

        <Tabs.Panel value="comunicare">
          <Card withBorder shadow="sm" padding="lg">
            {messages.length === 0 ? (
              <EmptyState title="Niciun mesaj trimis către această asociație." />
            ) : (
              <Table verticalSpacing="sm" highlightOnHover>
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
                      <Table.Td>
                        {m.channel === 'whatsapp'
                          ? 'WhatsApp'
                          : m.channel === 'email'
                            ? 'Email'
                            : 'SMS'}
                      </Table.Td>
                      <Table.Td>{m.contact_name ?? m.recipient}</Table.Td>
                      <Table.Td>
                        <Text size="sm" lineClamp={1} maw={300} c="dimmed">
                          {m.message_preview}
                        </Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={m.status === 'failed' ? 'red' : 'teal'}>
                          {messageStatusLabels[m.status]}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        </Tabs.Panel>
      </Tabs>

      {association.notes && (
        <Card withBorder shadow="sm" padding="lg">
          <Text fw={650} mb="xs">
            Observații
          </Text>
          <Text size="sm" c="dimmed" style={{ whiteSpace: 'pre-wrap' }}>
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
