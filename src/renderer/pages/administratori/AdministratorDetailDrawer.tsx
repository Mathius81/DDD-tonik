/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Drawer, Stack, Group, Text, Card, Badge, Divider, Anchor } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../../components/StatusBadge';
import { ServiceBadge } from '../../components/ServiceBadge';
import { AdminSituationWhatsappButton } from './AdminSituationWhatsappButton';
import { formatRo } from '../../../shared/dates';
import type { AdministratorAssociationSummary, AdministratorGroup } from '../../../shared/schemas/contact';

interface Props {
  /** Grupul afișat; null când sertarul e închis sau nu s-a selectat încă niciun rând. */
  group: AdministratorGroup | null;
  opened: boolean;
  onClose: () => void;
  /** Apelat după o trimitere reușită de WhatsApp (ex. reîncarcă lista din spate). */
  onSent?: () => void;
}

/** Starea vizibilă dintr-o privire a unei asociații: restantă (cel puțin un follow-up trecut de scadență) > scadentă > la zi. */
function associationStatus(
  a: AdministratorAssociationSummary,
): { tone: 'danger' | 'warning' | 'success'; label: string } {
  if (a.open_followups.length === 0) return { tone: 'success', label: 'La zi' };
  if (a.open_followups.some((f) => f.overdue)) return { tone: 'danger', label: 'Restantă' };
  return { tone: 'warning', label: 'Scadentă' };
}

/**
 * Fișa detaliată a unui administrator: TOATE asociațiile lui, cu starea fiecăreia,
 * ce s-a făcut deja (ultima intervenție per serviciu) și ce urmează (follow-up-urile
 * deschise, cu scadență). Deschis din rândul clicabil al `AdministratoriPage`
 * (cerința clientului: „să văd și ce asociații are și în ce stadiu sunt”).
 */
export function AdministratorDetailDrawer({ group, opened, onClose, onSent }: Props) {
  const navigate = useNavigate();

  const goToAssociation = (associationId: number) => {
    onClose();
    navigate(`/ddd/asociatii/${associationId}`);
  };

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size={480}
      overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      title={
        group && (
          <Stack gap={2}>
            <Text fw={650} size="lg">
              {group.display_name}
            </Text>
            <Text size="var(--fs-small)" c="var(--text-muted)">
              {group.phone_display} ·{' '}
              {group.associations_count === 1
                ? '1 asociație'
                : `${group.associations_count} asociații`}
            </Text>
          </Stack>
        )
      }
    >
      {group && (
        <Stack gap="var(--sp-4)">
          <Group>
            <AdminSituationWhatsappButton
              phone={group.phone_display}
              label="Trimite situația"
              subtitle={`${group.display_name} · ${group.phone_display} · ${
                group.associations_count === 1 ? '1 asociație' : `${group.associations_count} asociații`
              }`}
              onSent={onSent}
            />
          </Group>

          <Divider />

          <Stack gap="var(--sp-3)">
            {group.associations.map((a) => {
              const status = associationStatus(a);
              return (
                <Card key={a.association_id} withBorder padding="var(--sp-3)" radius="var(--radius-md)">
                  <Stack gap="var(--sp-2)">
                    <Group justify="space-between" wrap="nowrap" align="flex-start">
                      <Group gap={6} wrap="nowrap">
                        <Anchor
                          component="button"
                          type="button"
                          fw={600}
                          size="var(--fs-body)"
                          underline="hover"
                          onClick={() => goToAssociation(a.association_id)}
                        >
                          {a.association_name}
                        </Anchor>
                        {!a.association_active && (
                          <Badge color="gray" variant="light" size="sm">
                            Inactivă
                          </Badge>
                        )}
                      </Group>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </Group>

                    <div>
                      <Text size="var(--fs-small)" fw={600} c="var(--text-muted)" mb={4}>
                        Ce s-a făcut
                      </Text>
                      {a.last_interventions.length === 0 ? (
                        <Text size="var(--fs-small)" c="var(--text-faint)">
                          Nicio intervenție înregistrată încă.
                        </Text>
                      ) : (
                        <Stack gap={4}>
                          {a.last_interventions.map((li) => (
                            <Group key={li.service_name} gap={6} wrap="nowrap">
                              <ServiceBadge name={li.service_name} />
                              <Text size="var(--fs-small)" c="var(--text-muted)">
                                făcută pe {formatRo(li.last_performed_date)}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      )}
                    </div>

                    <div>
                      <Text size="var(--fs-small)" fw={600} c="var(--text-muted)" mb={4}>
                        Ce urmează
                      </Text>
                      {a.open_followups.length === 0 ? (
                        <Text size="var(--fs-small)" c="var(--success)">
                          Nimic în așteptare.
                        </Text>
                      ) : (
                        <Stack gap={4}>
                          {a.open_followups.map((f) => (
                            <Group key={`${f.service_name}-${f.due_date}`} gap={6} wrap="nowrap">
                              <ServiceBadge name={f.service_name} />
                              <Text
                                size="var(--fs-small)"
                                c={f.overdue ? 'var(--danger)' : 'var(--text-muted)'}
                                fw={f.overdue ? 600 : 400}
                              >
                                {f.overdue
                                  ? `restantă din ${formatRo(f.due_date)}`
                                  : `scadentă pe ${formatRo(f.due_date)}`}
                              </Text>
                            </Group>
                          ))}
                        </Stack>
                      )}
                    </div>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        </Stack>
      )}
    </Drawer>
  );
}
