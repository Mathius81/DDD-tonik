import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Group,
  Select,
  Card,
  Text,
  SimpleGrid,
  Modal,
  ActionIcon,
  Button,
  SegmentedControl,
  UnstyledButton,
  Divider,
} from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, unwrap } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import { ServiceDot, ServiceBadge } from '../../components/ServiceBadge';
import { EmptyState } from '../../components/EmptyState';
import { roMediumDate, pluralRo } from '../../../shared/text';
import type { CalendarDayEntry } from '../../../shared/schemas/dashboard';
import type { Service } from '../../../shared/schemas/service';

const monthNames = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
const weekDays = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function CalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [view, setView] = useState<'agenda' | 'month' | null>(null);

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

  // Agenda e implicită pentru luni cu puține evenimente (Brief §5.5).
  const effectiveView = view ?? ((data?.length ?? 0) < 10 ? 'agenda' : 'month');

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarDayEntry[]>();
    for (const e of data ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [data]);

  // Grila lunii, cu zilele lunilor adiacente în gri (Brief §5.5).
  const gridDays = useMemo(() => {
    const first = new Date(year, month, 1);
    const startOffset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    const cells: Array<{ date: string; inMonth: boolean }> = [];
    for (let i = startOffset - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      cells.push({ date: iso(py, pm, d), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: iso(year, month, d), inMonth: true });
    let nd = 1;
    while (cells.length % 7 !== 0) {
      const nm = month === 11 ? 0 : month + 1;
      const ny = month === 11 ? year + 1 : year;
      cells.push({ date: iso(ny, nm, nd++), inMonth: false });
    }
    return cells;
  }, [year, month]);

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
  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  // Navigare cu săgeți (Brief §5.5).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') prevMonth();
      if (e.key === 'ArrowRight') nextMonth();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [month, year]);

  const todayIso = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const selectedEntries = selectedDay ? (byDay.get(selectedDay) ?? []) : [];

  // Agendă: zilele lunii cu evenimente, cronologic.
  const agendaDays = useMemo(() => {
    const days = [...byDay.keys()].filter((d) => d.startsWith(monthKey)).sort();
    return days.map((d) => ({ date: d, entries: byDay.get(d)! }));
  }, [byDay, monthKey]);

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Calendar"
        description="Scadențele și programările lunii, într-o singură privire."
      />

      <Card padding="var(--sp-4)">
        {/* Bara de instrumente: navigare + filtre + legendă (Brief §4, §5.5) */}
        <Group justify="space-between" mb="var(--sp-4)" wrap="wrap">
          <Group gap="var(--sp-2)">
            <ActionIcon variant="default" onClick={prevMonth} aria-label="Luna anterioară">
              <IconChevronLeft size={16} />
            </ActionIcon>
            <Text fw={600} fz="var(--fs-section)" w={150} ta="center">
              {monthNames[month]} {year}
            </Text>
            <ActionIcon variant="default" onClick={nextMonth} aria-label="Luna următoare">
              <IconChevronRight size={16} />
            </ActionIcon>
            <Button variant="default" size="compact-sm" onClick={goToday}>
              Azi
            </Button>
          </Group>
          <Group gap="var(--sp-3)">
            <Select
              placeholder="Toate serviciile"
              clearable
              w={200}
              size="xs"
              data={services.map((s) => ({ value: String(s.id), label: s.name }))}
              value={serviceId}
              onChange={setServiceId}
            />
            <SegmentedControl
              size="xs"
              value={effectiveView}
              onChange={(v) => setView(v as 'agenda' | 'month')}
              data={[
                { value: 'agenda', label: 'Agendă' },
                { value: 'month', label: 'Lună' },
              ]}
            />
          </Group>
        </Group>

        <Group gap="var(--sp-4)" mb="var(--sp-3)">
          {services.map((s) => (
            <Group key={s.id} gap={5}>
              <ServiceDot name={s.name} size={7} />
              <Text size="var(--fs-small)" c="var(--text-muted)">
                {s.name}
              </Text>
            </Group>
          ))}
          <Divider orientation="vertical" />
          <Text size="var(--fs-small)" c="var(--text-muted)">
            contur = programată · plin = ajunge la termen
          </Text>
        </Group>

        {effectiveView === 'agenda' ? (
          agendaDays.length === 0 ? (
            <EmptyState
              title="Nicio scadență în această lună."
              description="Alege altă lună sau înregistrează o intervenție."
              actionLabel="Adaugă intervenție"
              onAction={() => navigate('/interventii')}
            />
          ) : (
            <Stack gap="var(--sp-3)">
              {agendaDays.map(({ date, entries }) => (
                <div key={date}>
                  <Text
                    size="var(--fs-small)"
                    fw={600}
                    c={date === todayIso ? 'var(--accent)' : 'var(--text-muted)'}
                    mb={4}
                  >
                    {roMediumDate(date)}
                    {date === todayIso && ' · astăzi'} ·{' '}
                    {pluralRo(entries.length, 'programare', 'programări')}
                  </Text>
                  <Stack gap={2}>
                    {entries.map((e, i) => (
                      <UnstyledButton
                        key={i}
                        className="tonik-hover-row"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '6px 8px',
                          borderRadius: 'var(--radius-md)',
                        }}
                        onClick={() => navigate(`/asociatii/${e.association_id}`)}
                      >
                        <ServiceDot name={e.service_name} />
                        <Text size="var(--fs-body)" fw={600}>
                          {e.association_name}
                        </Text>
                        <ServiceBadge name={e.service_name} />
                        <Text size="var(--fs-small)" c="var(--text-muted)">
                          {e.kind === 'scheduled'
                            ? `programată${e.scheduled_time ? ` la ${e.scheduled_time}` : ''}`
                            : 'ajunge la termen'}
                        </Text>
                      </UnstyledButton>
                    ))}
                  </Stack>
                </div>
              ))}
            </Stack>
          )
        ) : (
          <SimpleGrid cols={7} spacing={4}>
            {weekDays.map((d) => (
              <Text key={d} ta="center" size="var(--fs-micro)" c="var(--text-muted)" fw={600} tt="uppercase" pb={2}>
                {d}
              </Text>
            ))}
            {gridDays.map(({ date, inMonth }) => {
              const isToday = date === todayIso;
              const isSelected = date === selectedDay;
              const entries = byDay.get(date) ?? [];
              return (
                <UnstyledButton
                  key={date}
                  onClick={() => setSelectedDay(date)}
                  style={{
                    minHeight: 96,
                    padding: 6,
                    borderRadius: 'var(--radius-md)',
                    border: isSelected
                      ? '2px solid var(--accent)'
                      : '1px solid var(--border)',
                    background: inMonth ? 'var(--bg-surface)' : 'var(--bg-subtle)',
                    opacity: inMonth ? 1 : 0.6,
                    verticalAlign: 'top',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: isToday ? 'var(--accent)' : 'transparent',
                      color: isToday ? '#fff' : inMonth ? 'var(--text)' : 'var(--text-faint)',
                      fontSize: 'var(--fs-small)',
                      fontWeight: isToday ? 700 : 500,
                    }}
                    className="tonik-num"
                  >
                    {Number(date.slice(-2))}
                  </span>
                  <Stack gap={2} mt={3}>
                    {entries.slice(0, 3).map((e, j) => (
                      <div
                        key={j}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 'var(--fs-small)',
                          padding: '2px 5px',
                          borderRadius: 'var(--radius-sm)',
                          background:
                            e.kind === 'scheduled' ? 'transparent' : 'var(--bg-subtle)',
                          border:
                            e.kind === 'scheduled' ? '1px solid var(--border-strong)' : 'none',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <ServiceDot name={e.service_name} size={6} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.association_name}
                        </span>
                      </div>
                    ))}
                    {entries.length > 3 && (
                      <Text size="var(--fs-micro)" c="var(--text-faint)" pl={2}>
                        +{entries.length - 3}
                      </Text>
                    )}
                  </Stack>
                </UnstyledButton>
              );
            })}
          </SimpleGrid>
        )}
      </Card>

      <Modal
        opened={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? roMediumDate(selectedDay) : ''}
      >
        {selectedEntries.length === 0 ? (
          <Text c="var(--text-muted)" size="var(--fs-body)">
            Nimic programat în această zi.
          </Text>
        ) : (
          <Stack gap="var(--sp-2)">
            {selectedEntries.map((e, i) => (
              <UnstyledButton
                key={i}
                className="tonik-hover-row"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => {
                  setSelectedDay(null);
                  navigate(`/asociatii/${e.association_id}`);
                }}
              >
                <ServiceDot name={e.service_name} />
                <div style={{ flex: 1 }}>
                  <Text fw={600} size="var(--fs-body)">
                    {e.association_name}
                  </Text>
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {e.service_name} ·{' '}
                    {e.kind === 'scheduled'
                      ? `programată${e.scheduled_time ? ` la ${e.scheduled_time}` : ''}`
                      : 'ajunge la termen'}
                  </Text>
                </div>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
