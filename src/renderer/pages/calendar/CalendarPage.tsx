import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Group,
  Select,
  Card,
  Text,
  Badge,
  SimpleGrid,
  Modal,
  ActionIcon,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap } from '../../api/useIpc';
import { fmtDate } from '../../components/dateUtils';
import { PageHeader } from '../../components/PageHeader';
import type { CalendarDayEntry } from '../../../shared/schemas/dashboard';
import type { Service } from '../../../shared/schemas/service';

const monthNames = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
const weekDays = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

export function CalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    unwrap<Service[]>(ddd.services.list()).then(setServices);
  }, []);

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const { data } = useIpcQuery<CalendarDayEntry[]>(
    () =>
      ddd.dashboard.calendarMonth({
        month: monthKey,
        service_id: serviceId ? Number(serviceId) : undefined,
      }),
    [monthKey, serviceId],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDayEntry[]>();
    for (const e of data ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [data]);

  // Grila lunii: începe luni.
  const gridDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7; // luni = 0
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(startOffset).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${monthKey}-${String(d).padStart(2, '0')}`);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month, monthKey]);

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else setMonth(month + 1);
  };

  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const selectedEntries = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  return (
    <Stack gap="lg">
      <PageHeader
        title="Calendar"
        description="Scadențele și programările lunii, într-o singură privire."
        actions={
          <Select
            placeholder="Toate serviciile"
            clearable
            w={220}
            data={services.map((s) => ({ value: String(s.id), label: s.name }))}
            value={serviceId}
            onChange={setServiceId}
          />
        }
      />

      <Card withBorder shadow="sm" padding="lg">
        <Group justify="center" mb="lg" gap="md">
          <ActionIcon variant="default" size="lg" onClick={prevMonth} aria-label="Luna anterioară">
            <IconChevronLeft size={18} />
          </ActionIcon>
          <Text fw={650} fz="lg" w={200} ta="center" style={{ letterSpacing: '-0.01em' }}>
            {monthNames[month]} {year}
          </Text>
          <ActionIcon variant="default" size="lg" onClick={nextMonth} aria-label="Luna următoare">
            <IconChevronRight size={18} />
          </ActionIcon>
        </Group>

        <SimpleGrid cols={7} spacing={6}>
          {weekDays.map((d) => (
            <Text key={d} ta="center" size="xs" c="dimmed" fw={600} tt="uppercase" pb={4}>
              {d}
            </Text>
          ))}
          {gridDays.map((day, i) =>
            day === null ? (
              <div key={`empty-${i}`} />
            ) : (
              <Card
                key={day}
                withBorder
                padding={8}
                radius="md"
                mih={92}
                className="tonik-hover-card"
                style={{
                  cursor: 'pointer',
                  borderColor: day === todayIso ? 'var(--mantine-color-tonik-5)' : undefined,
                  backgroundColor: day === todayIso ? 'var(--mantine-color-tonik-0)' : undefined,
                }}
                onClick={() => setSelectedDay(day)}
              >
                <Text size="sm" fw={day === todayIso ? 700 : 500} c={day === todayIso ? 'tonik.8' : undefined}>
                  {Number(day.slice(-2))}
                </Text>
                <Stack gap={3} mt={4}>
                  {(byDay.get(day) ?? []).slice(0, 3).map((e, j) => (
                    <Badge
                      key={j}
                      size="sm"
                      fullWidth
                      variant="light"
                      radius="sm"
                      color={e.kind === 'scheduled' ? 'teal' : 'orange'}
                      style={{ justifyContent: 'flex-start' }}
                    >
                      {e.association_name}
                    </Badge>
                  ))}
                  {(byDay.get(day)?.length ?? 0) > 3 && (
                    <Text size="xs" c="dimmed" pl={2}>
                      +{byDay.get(day)!.length - 3} altele
                    </Text>
                  )}
                </Stack>
              </Card>
            ),
          )}
        </SimpleGrid>

        <Group gap="lg" mt="lg">
          <Group gap={6}>
            <Badge color="orange" variant="light" size="xs" circle>
              {' '}
            </Badge>
            <Text size="sm" c="dimmed">
              Ajunge la termen
            </Text>
          </Group>
          <Group gap={6}>
            <Badge color="teal" variant="light" size="xs" circle>
              {' '}
            </Badge>
            <Text size="sm" c="dimmed">
              Programată
            </Text>
          </Group>
        </Group>
      </Card>

      <Modal
        opened={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? fmtDate(selectedDay) : ''}
      >
        {selectedEntries.length === 0 ? (
          <Text c="dimmed" size="sm">
            Nimic programat în această zi.
          </Text>
        ) : (
          <Stack gap="sm">
            {selectedEntries.map((e, i) => (
              <Card
                key={i}
                withBorder
                padding="sm"
                className="tonik-hover-card"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedDay(null);
                  navigate(`/asociatii/${e.association_id}`);
                }}
              >
                <Group justify="space-between">
                  <div>
                    <Text fw={600}>{e.association_name}</Text>
                    <Text size="sm" c="dimmed">
                      {e.service_name}
                    </Text>
                  </div>
                  <Badge color={e.kind === 'scheduled' ? 'teal' : 'orange'} variant="light">
                    {e.kind === 'scheduled'
                      ? `Programată${e.scheduled_time ? ` ${e.scheduled_time}` : ''}`
                      : 'Ajunge la termen'}
                  </Badge>
                </Group>
              </Card>
            ))}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
