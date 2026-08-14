import { useState } from 'react';
import { Stack, Text, Button, Card, Group, Grid, Divider, UnstyledButton } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconBrandWhatsapp, IconMail, IconChevronRight } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { ServiceDot, ServiceBadge } from '../../components/ServiceBadge';
import { EmptyState } from '../../components/EmptyState';
import { roLongDate, roShortDay, dueContext } from '../../../shared/text';
import { InterventionFormModal } from '../interventii/InterventionFormModal';
import { AssociationFormModal } from '../asociatii/AssociationFormModal';
import { SendMessageModal } from '../mesaje/SendMessageModal';
import { ScheduleFollowupModal } from '../interventii/ScheduleFollowupModal';
import type { DashboardData } from '../../../shared/schemas/dashboard';
import type { FollowupListItem } from '../../../shared/schemas/followup';

/** O statistică din bara orizontală: cifra colorată doar când e diferită de zero. */
function Stat({
  label,
  value,
  color,
  onClick,
}: {
  label: string;
  value: number | undefined;
  color: string;
  onClick: () => void;
}) {
  const active = (value ?? 0) > 0;
  return (
    <UnstyledButton
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '2px 4px' }}
    >
      <Text
        fz={20}
        fw={700}
        className="tonik-num"
        c={active ? color : 'var(--text-faint)'}
        lh={1}
      >
        {value ?? '…'}
      </Text>
      <Text size="var(--fs-small)" c="var(--text-muted)">
        {label}
      </Text>
    </UnstyledButton>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [associationOpen, setAssociationOpen] = useState(false);
  const [messageFollowup, setMessageFollowup] = useState<FollowupListItem | null>(null);
  const [scheduleFollowup, setScheduleFollowup] = useState<FollowupListItem | null>(null);

  const { data, reload } = useIpcQuery<DashboardData>(() => ddd.dashboard.get(), []);
  const counts = data?.counts;

  // Timeline: astăzi + următoarele 7 zile, din lista de atenție + programările de azi.
  const today = data?.scheduledToday ?? [];
  const next7 = (data?.attention ?? []).filter(
    (f) => f.days_remaining >= 0 && f.days_remaining <= 7,
  );
  const overdue = (data?.attention ?? []).filter((f) => f.days_remaining < 0);

  const markSentQuick = async (id: number) => {
    await runMutation(ddd.messages.markSent({ id }), 'Marcat trimis.');
    reload();
  };

  const timelineRow = (f: FollowupListItem, showDay: boolean) => (
    <UnstyledButton
      key={`${f.id}-${f.status}`}
      onClick={() => navigate(`/asociatii/${f.association_id}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 8px',
        borderRadius: 'var(--radius-md)',
        width: '100%',
      }}
      className="tonik-hover-row"
    >
      {showDay && (
        <Text size="var(--fs-small)" c="var(--text-muted)" w={46} className="tonik-num">
          {roShortDay(f.status === 'scheduled' && f.scheduled_date ? f.scheduled_date : f.due_date)}
        </Text>
      )}
      <ServiceDot name={f.service_name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={8} wrap="nowrap">
          <Text size="var(--fs-body)" fw={600} truncate>
            {f.association_name}
          </Text>
          <ServiceBadge name={f.service_name} />
          {f.scheduled_time && (
            <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
              {f.scheduled_time}
            </Text>
          )}
        </Group>
        {f.days_remaining < 0 && (
          <Text size="var(--fs-small)" c="var(--danger)" fw={550}>
            {dueContext(f.days_remaining).label}
          </Text>
        )}
      </div>
      <IconChevronRight size={14} color="var(--text-faint)" />
    </UnstyledButton>
  );

  return (
    <Stack gap="var(--sp-4)">
      <Group justify="space-between" align="flex-start">
        <div>
          <Text component="h1" fz="var(--fs-page-title)" fw={600} lh={1.3} m={0}>
            Dashboard
          </Text>
          <Text size="var(--fs-small)" c="var(--text-muted)">
            {roLongDate(new Date())}
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setInterventionOpen(true)}>
          Adaugă intervenție
        </Button>
      </Group>

      {/* Bara de statistici — o singură linie, fiecare clicabilă (Brief §5.2) */}
      <Card padding="var(--sp-3)">
        <Group gap="var(--sp-5)">
          <Stat
            label="restante"
            value={counts?.overdue}
            color="var(--danger)"
            onClick={() => navigate('/remindere')}
          />
          <Divider orientation="vertical" />
          <Stat
            label="în 7 zile"
            value={counts?.next7}
            color="var(--warning)"
            onClick={() => navigate('/calendar')}
          />
          <Divider orientation="vertical" />
          <Stat
            label="în 30 de zile"
            value={counts?.next30}
            color="var(--text)"
            onClick={() => navigate('/calendar')}
          />
          <Divider orientation="vertical" />
          <Stat
            label="programate"
            value={counts?.scheduled}
            color="var(--accent)"
            onClick={() => navigate('/calendar')}
          />
          {(counts?.failed_messages ?? 0) > 0 && (
            <>
              <Divider orientation="vertical" />
              <Stat
                label="mesaje eșuate"
                value={counts?.failed_messages}
                color="var(--danger)"
                onClick={() => navigate('/mesaje')}
              />
            </>
          )}
        </Group>
      </Card>

      <Grid>
        {/* Coloana stângă: timeline (Brief §5.2) */}
        <Grid.Col span={{ base: 12, md: 7.5 }}>
          <Card padding="var(--sp-4)">
            <Text size="var(--fs-micro)" fw={600} tt="uppercase" c="var(--text-muted)" style={{ letterSpacing: '0.09em' }}>
              Astăzi
            </Text>
            <Divider my={6} />
            {today.length === 0 && overdue.length === 0 ? (
              <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
                Nicio programare astăzi.
              </Text>
            ) : (
              <Stack gap={2}>
                {overdue.map((f) => timelineRow(f, false))}
                {today.map((f) => timelineRow(f, false))}
              </Stack>
            )}

            <Text
              size="var(--fs-micro)"
              fw={600}
              tt="uppercase"
              c="var(--text-muted)"
              mt="var(--sp-4)"
              style={{ letterSpacing: '0.09em' }}
            >
              Următoarele 7 zile
            </Text>
            <Divider my={6} />
            {next7.length === 0 ? (
              <EmptyState
                title="Nicio scadență în următoarele 7 zile."
                description="Vezi calendarul pentru perspectiva completă a lunii."
                actionLabel="Vezi calendarul"
                onAction={() => navigate('/calendar')}
              />
            ) : (
              <Stack gap={2}>{next7.map((f) => timelineRow(f, true))}</Stack>
            )}
          </Card>
        </Grid.Col>

        {/* Coloana dreaptă: de trimis + acțiuni rapide */}
        <Grid.Col span={{ base: 12, md: 4.5 }}>
          <Stack gap="var(--sp-4)">
            <Card padding="var(--sp-4)">
              <Text size="var(--fs-micro)" fw={600} tt="uppercase" c="var(--text-muted)" style={{ letterSpacing: '0.09em' }}>
                De trimis
              </Text>
              <Divider my={6} />
              {(data?.pendingMessages ?? []).length === 0 ? (
                <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
                  Niciun mesaj în așteptare.
                </Text>
              ) : (
                <Stack gap="var(--sp-2)">
                  {(data?.pendingMessages ?? []).map((m) => (
                    <Group key={m.id} justify="space-between" wrap="nowrap">
                      <div style={{ minWidth: 0 }}>
                        <Group gap={6} wrap="nowrap">
                          {m.channel === 'whatsapp' ? (
                            <IconBrandWhatsapp size={14} color="var(--success)" />
                          ) : (
                            <IconMail size={14} color="var(--svc-dezinfectie)" />
                          )}
                          <Text size="var(--fs-body)" fw={550} truncate>
                            {m.association_name ?? m.recipient}
                          </Text>
                        </Group>
                        <Text size="var(--fs-small)" c="var(--text-muted)">
                          {m.contact_name ?? m.recipient} · pregătit
                        </Text>
                      </div>
                      <Button size="compact-sm" variant="light" onClick={() => markSentQuick(m.id)}>
                        Marchează trimis
                      </Button>
                    </Group>
                  ))}
                </Stack>
              )}
            </Card>

            <Card padding="var(--sp-4)">
              <Text size="var(--fs-micro)" fw={600} tt="uppercase" c="var(--text-muted)" style={{ letterSpacing: '0.09em' }}>
                Acțiuni rapide
              </Text>
              <Divider my={6} />
              <Group gap="var(--sp-2)">
                <Button variant="default" size="compact-md" onClick={() => setInterventionOpen(true)}>
                  + Intervenție
                </Button>
                <Button variant="default" size="compact-md" onClick={() => setAssociationOpen(true)}>
                  + Asociație
                </Button>
                <Button variant="default" size="compact-md" onClick={() => navigate('/calendar')}>
                  Calendar
                </Button>
              </Group>
            </Card>
          </Stack>
        </Grid.Col>
      </Grid>

      <InterventionFormModal
        opened={interventionOpen}
        onClose={() => setInterventionOpen(false)}
        onSaved={() => {
          setInterventionOpen(false);
          reload();
        }}
      />
      <AssociationFormModal
        opened={associationOpen}
        onClose={() => setAssociationOpen(false)}
        onSaved={(a) => {
          setAssociationOpen(false);
          navigate(`/asociatii/${a.id}`);
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
      <ScheduleFollowupModal
        followup={scheduleFollowup}
        onClose={() => setScheduleFollowup(null)}
        onSaved={() => {
          setScheduleFollowup(null);
          reload();
        }}
      />
    </Stack>
  );
}
