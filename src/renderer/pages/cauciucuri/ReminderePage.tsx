/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Stack, Group, Text, Card, Badge, Alert, Table, Tooltip } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconBellRinging, IconSnowflake, IconSun, IconSettings, IconInfoCircle } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { TyreWhatsappButton } from './TyreWhatsappButton';
import { tyreSeasonLabels, renderTyreSeasonReminderMessage } from '../../../shared/schemas/tyre';
import type { TyreSeasonReminderStatus, TyreSeasonReminderEligibleReason } from '../../../shared/schemas/tyre';

const reasonLabels: Record<TyreSeasonReminderEligibleReason, string> = {
  storage: 'Are cauciucuri în depozit',
  past_swap: 'A mai făcut schimb de sezon',
};

/**
 * Vederea operațională a reminder-elor: cine e eligibil ACUM, în fereastra activă,
 * și trimiterea cu un click. Configurarea ferestrelor/mesajului e în Setări.
 */
export function ReminderePage() {
  const navigate = useNavigate();
  const { data, loading, reload } = useIpcQuery<TyreSeasonReminderStatus>(
    () => ddd.tyres.seasonReminders.status(),
    [],
  );

  if (loading || !data) return null;

  const { settings, activeWindow, eligible } = data;

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Remindere de sezon"
        description="Clienții cărora li se poate trimite acum mesajul de schimb de sezon."
      />

      {!settings.enabled && (
        <Alert
          icon={<IconSettings size={16} />}
          color="yellow"
          variant="light"
          title="Reminderele automate sunt oprite"
        >
          <Group justify="space-between" align="center">
            <Text size="sm">Poți trimite manual mai jos, dar nimic nu pleacă automat.</Text>
            <Text
              size="sm"
              fw={600}
              c="var(--accent)"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/cauciucuri/setari')}
            >
              Mergi la Setări →
            </Text>
          </Group>
        </Alert>
      )}

      {activeWindow ? (
        <Card padding="var(--sp-4)">
          <Group gap={8} mb="sm">
            {activeWindow === 'iarna' ? (
              <IconSnowflake size={18} color="var(--accent)" />
            ) : (
              <IconSun size={18} color="orange" />
            )}
            <Text fw={600}>
              Fereastră activă acum: schimb de {tyreSeasonLabels[activeWindow].toLowerCase()}
            </Text>
          </Group>

          {eligible.length === 0 ? (
            <EmptyState
              icon={<IconBellRinging size={24} stroke={1.5} />}
              title="Niciun client eligibil momentan."
              description="Clienții cu cauciucuri în depozit sau cu un schimb de sezon anterior apar aici automat."
            />
          ) : (
            <Table verticalSpacing="xs" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Client</Table.Th>
                  <Table.Th>Motiv</Table.Th>
                  <Table.Th>Stare</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {eligible.map((c) => (
                  <Table.Tr key={c.client_id}>
                    <Table.Td>
                      <Text size="var(--fs-body)" fw={600}>
                        {c.client_name}
                      </Text>
                      <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                        {c.client_phone ?? '—'}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <Text size="var(--fs-small)" c="dimmed">
                        {reasonLabels[c.reason]}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {c.already_sent ? (
                        <Badge variant="light" color="teal" size="sm">
                          Trimis deja
                        </Badge>
                      ) : c.failed_attempts > 0 ? (
                        <Tooltip
                          label={c.last_error ?? 'Trimiterea automată a eșuat.'}
                          multiline
                          w={280}
                          events={{ hover: true, focus: true, touch: true }}
                        >
                          <Badge variant="light" color="red" size="sm">
                            {c.failed_attempts === 1
                              ? 'Eșuat automat (o încercare)'
                              : `Eșuat automat (${c.failed_attempts} încercări)`}
                          </Badge>
                        </Tooltip>
                      ) : (
                        <Badge variant="light" color="gray" size="sm">
                          Netrimis
                        </Badge>
                      )}
                    </Table.Td>
                    <Table.Td>
                      {!c.already_sent && (
                        <TyreWhatsappButton
                          clientId={c.client_id}
                          phone={c.client_phone}
                          subtitle={c.client_name}
                          source="season_reminder"
                          season={activeWindow}
                          defaultMessage={renderTyreSeasonReminderMessage(settings.message_template, {
                            name: c.client_name,
                            season: activeWindow,
                          })}
                          onSent={reload}
                        />
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Card>
      ) : (
        <EmptyState
          icon={<IconInfoCircle size={24} stroke={1.5} />}
          title="Nu suntem în nicio fereastră de sezon acum."
          description="Ferestrele de start/sfârșit se configurează din Setări."
        />
      )}
    </Stack>
  );
}
