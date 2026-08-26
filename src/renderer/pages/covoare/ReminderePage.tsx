/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Stack, Group, Text, Card, Table, Alert } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconBellRinging, IconSettings, IconPackageExport, IconHistory } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { fmtDate } from '../../components/dateUtils';
import { CarpetWhatsappButton } from './CarpetWhatsappButton';
import { defaultReadyWhatsappMessage, defaultRevisitWhatsappMessage } from './covoare-ui';
import type { CarpetRemindersData } from '../../../shared/schemas/carpet';

/**
 * Remindere simple pentru Covoare, calculate la cerere (fără scheduler):
 * 1) comenzi „gata de livrat" — de anunțat clientul;
 * 2) clienți „de recontactat" — n-au mai comandat de N luni (setat în Setări).
 * Trimiterea rămâne mereu manuală, printr-un click pe WhatsApp.
 */
export function ReminderePage() {
  const navigate = useNavigate();
  const { data, loading, reload } = useIpcQuery<CarpetRemindersData>(
    () => ddd.carpets.reminders.get(),
    [],
  );

  if (loading || !data) return null;

  const { settings, readyToNotify, revisitDue } = data;

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Remindere"
        description="Cui trebuie să-i scrii acum: comenzi gata de livrat și clienți de recontactat."
      />

      {!settings.notify_on_ready && (
        <Alert icon={<IconSettings size={16} />} color="yellow" variant="light" title="Anunțul „gata de livrat” e oprit din Setări">
          <Group justify="space-between" align="center">
            <Text size="sm">Poți porni această listă din Setări, ca să nu uiți clienții cu comenzi gata.</Text>
            <Text
              size="sm"
              fw={600}
              c="var(--accent)"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/covoare/setari')}
            >
              Mergi la Setări →
            </Text>
          </Group>
        </Alert>
      )}

      <Card padding="var(--sp-4)">
        <Group gap={8} mb="sm">
          <IconPackageExport size={18} color="var(--accent)" />
          <Text fw={600}>Gata de livrat — de anunțat clientul</Text>
        </Group>

        {readyToNotify.length === 0 ? (
          <EmptyState
            icon={<IconBellRinging size={24} stroke={1.5} />}
            title="Nimic de anunțat momentan."
            description="Comenzile marcate „Gata de livrat” apar aici automat."
          />
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Client</Table.Th>
                <Table.Th>Preluat</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {readyToNotify.map((o) => (
                <Table.Tr key={o.id}>
                  <Table.Td>
                    <Text size="var(--fs-body)" fw={600}>
                      {o.client_name}
                    </Text>
                    <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                      {o.client_phone ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="var(--fs-small)" c="dimmed">
                      {fmtDate(o.pickup_date)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <CarpetWhatsappButton
                      clientId={o.client_id}
                      phone={o.client_phone}
                      subtitle={o.client_name}
                      defaultMessage={defaultReadyWhatsappMessage(o.client_name)}
                      onSent={reload}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>

      <Card padding="var(--sp-4)">
        <Group gap={8} mb="sm">
          <IconHistory size={18} color="var(--text-muted)" />
          <Text fw={600}>De recontactat</Text>
          {settings.revisit_months != null && (
            <Text size="var(--fs-small)" c="var(--text-muted)">
              — n-au mai comandat de {settings.revisit_months} {settings.revisit_months === 1 ? 'lună' : 'luni'}
            </Text>
          )}
        </Group>

        {settings.revisit_months == null ? (
          <Text size="var(--fs-small)" c="var(--text-muted)">
            Reamintirea de recontactare e oprită. O poți activa din Setări.
          </Text>
        ) : revisitDue.length === 0 ? (
          <EmptyState
            icon={<IconBellRinging size={24} stroke={1.5} />}
            title="Niciun client de recontactat momentan."
            description="Clienții care n-au mai comandat de mult timp apar aici automat."
          />
        ) : (
          <Table verticalSpacing="xs" highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Client</Table.Th>
                <Table.Th>Ultima comandă</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {revisitDue.map((c) => (
                <Table.Tr key={c.id}>
                  <Table.Td>
                    <Text size="var(--fs-body)" fw={600}>
                      {c.name}
                    </Text>
                    <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                      {c.phone ?? '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="var(--fs-small)" c="dimmed">
                      {fmtDate(c.last_order_date)}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <CarpetWhatsappButton
                      clientId={c.id}
                      phone={c.phone}
                      subtitle={c.name}
                      defaultMessage={defaultRevisitWhatsappMessage(c.name)}
                      onSent={reload}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Card>
    </Stack>
  );
}
