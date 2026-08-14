import { useEffect, useState } from 'react';
import {
  Badge,
  Drawer,
  Group,
  Stack,
  Text,
  ThemeIcon,
  UnstyledButton,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconBell,
  IconAlertTriangle,
  IconCalendarDue,
  IconClockHour4,
  IconTool,
  IconMailX,
  IconCircleCheck,
} from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { unwrap } from '../api/useIpc';
import { fmtDate } from './dateUtils';
import type { AppNotification, NotificationsData } from '../../shared/schemas/notifications';

const kindMeta: Record<
  string,
  { icon: typeof IconBell; color: string; label: (n: AppNotification) => string }
> = {
  overdue: {
    icon: IconAlertTriangle,
    color: 'red',
    label: (n) =>
      `Restant cu ${-n.followup!.days_remaining} ${-n.followup!.days_remaining === 1 ? 'zi' : 'zile'} — de contactat`,
  },
  due_today: {
    icon: IconCalendarDue,
    color: 'orange',
    label: () => 'Ajunge la termen astăzi — de contactat',
  },
  due_soon: {
    icon: IconClockHour4,
    color: 'yellow',
    label: (n) =>
      `Ajunge la termen în ${n.followup!.days_remaining} ${n.followup!.days_remaining === 1 ? 'zi' : 'zile'}`,
  },
  scheduled_today: {
    icon: IconTool,
    color: 'teal',
    label: (n) =>
      `Programată astăzi${n.followup!.scheduled_time ? ` la ${n.followup!.scheduled_time}` : ''} — de efectuat`,
  },
  failed_messages: {
    icon: IconMailX,
    color: 'red',
    label: (n) =>
      `${n.count} ${n.count === 1 ? 'mesaj eșuat necesită' : 'mesaje eșuate necesită'} atenție`,
  },
};

/**
 * Centrul de notificări din aplicație.
 * Sarcinile sunt derivate din date, deci persistă până sunt rezolvate —
 * nu dispar la restart și nu pot fi „ratate” ca notificările de sistem.
 */
export function NotificationCenter() {
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [data, setData] = useState<NotificationsData | null>(null);

  const load = () => {
    unwrap<NotificationsData>(ddd.dashboard.notifications())
      .then(setData)
      .catch(() => undefined);
  };

  useEffect(() => {
    load();
    // Reîncarcă la fiecare schimbare de date (scheduler, acțiuni utilizator).
    const unsubscribe = ddd.events.onDataChanged(load);
    // Și periodic, ca badge-ul să treacă natural pe „azi” după miezul nopții.
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);

  const badge = data?.badge ?? 0;

  return (
    <>
      <UnstyledButton
        onClick={() => setOpened(true)}
        className="tonik-todo-card"
        data-alert={badge > 0 || undefined}
        aria-label="Notificări"
      >
        <span className="tonik-todo-icon">
          <IconBell size={18} stroke={1.8} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" fw={600} c={badge > 0 ? '#e8f0ee' : '#9fb3af'} lh={1.2}>
            De făcut azi
          </Text>
          <Text size="xs" c={badge > 0 ? '#72d5c4' : '#546863'} lh={1.3}>
            {badge === 0
              ? 'Totul este la zi'
              : badge === 1
                ? 'o sarcină te așteaptă'
                : `${badge} sarcini te așteaptă`}
          </Text>
        </div>
        {badge > 0 && (
          <Badge size="lg" color="red" variant="filled" circle>
            {badge > 99 ? '99+' : badge}
          </Badge>
        )}
      </UnstyledButton>

      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        title={
          <Text fw={650} size="lg">
            De făcut
          </Text>
        }
        position="right"
        size={420}
        overlayProps={{ backgroundOpacity: 0.35, blur: 2 }}
      >
        {!data || data.items.length === 0 ? (
          <Stack align="center" py={48} gap="sm">
            <ThemeIcon variant="light" color="teal" size={56} radius="xl">
              <IconCircleCheck size={30} stroke={1.5} />
            </ThemeIcon>
            <Text fw={600}>Totul este la zi.</Text>
            <Text size="sm" c="dimmed" ta="center">
              Nu ai nimic urgent de făcut. Sarcinile noi apar aici automat.
            </Text>
          </Stack>
        ) : (
          <Stack gap="xs">
            {data.items.map((n, i) => {
              const meta = kindMeta[n.kind];
              const Icon = meta.icon;
              return (
                <UnstyledButton
                  key={i}
                  onClick={() => {
                    setOpened(false);
                    navigate(
                      n.kind === 'failed_messages'
                        ? '/mesaje'
                        : `/asociatii/${n.followup!.association_id}`,
                    );
                  }}
                  p="sm"
                  style={{
                    borderRadius: 10,
                    border: '1px solid var(--mantine-color-gray-2)',
                    transition: 'background-color 100ms ease',
                  }}
                  className="tonik-hover-card"
                >
                  <Group gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon variant="light" color={meta.color} size={34} radius="md">
                      <Icon size={18} stroke={1.7} />
                    </ThemeIcon>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {n.followup ? (
                        <>
                          <Text size="sm" fw={600} truncate>
                            {n.followup.association_name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {n.followup.service_name} · scadent {fmtDate(n.followup.due_date)}
                          </Text>
                        </>
                      ) : (
                        <Text size="sm" fw={600}>
                          Mesaje eșuate
                        </Text>
                      )}
                      <Text size="xs" c={`${meta.color}.8`} fw={550} mt={2}>
                        {meta.label(n)}
                      </Text>
                    </div>
                  </Group>
                </UnstyledButton>
              );
            })}
          </Stack>
        )}
      </Drawer>
    </>
  );
}
