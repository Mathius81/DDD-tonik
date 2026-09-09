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
import { Stack, Group, Card, Text, SimpleGrid, Modal, ActionIcon, Button, UnstyledButton } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { roMediumDate } from '../../../shared/text';
import { carpetOrderStatusLabels, type CarpetCalendarDayEntry } from '../../../shared/schemas/carpet';
import { carpetOrderStatusTone } from './covoare-ui';

const monthNames = [
  'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
const weekDays = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Calendarul lunii pentru Covoare: zilele de preluare (contur) și zilele cu termen
 * (plin) ale comenzilor — aceeași grilă lunară ca la DDD (vezi CalendarPage din DDD),
 * dar fără agendă/filtru de servicii, pentru că volumul e mult mai mic.
 */
export function CalendarPage() {
  const navigate = useNavigate();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const { data, loading } = useIpcQuery<CarpetCalendarDayEntry[]>(
    () => ddd.carpets.calendar.month({ month: monthKey }),
    [monthKey],
  );

  const byDay = useMemo(() => {
    const map = new Map<string, CarpetCalendarDayEntry[]>();
    for (const e of data ?? []) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return map;
  }, [data]);

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
  // Gardat pe `!loading`, la fel ca listele cu tabel: altfel, la schimbarea lunii, luna
  // veche (cu intrări) dispare instant, înlocuită de starea goală, până sosesc datele noi —
  // aceeași sclipire ca la tabele, doar că aici containerul e grila de calendar.
  const hasAnyEntries = loading || (data?.length ?? 0) > 0;

  // Nu există o rută de detalii per-comandă — deschidem lista Comenzi, unde comanda
  // poate fi găsită rapid după numele sau telefonul clientului (căutare live).
  const openOrders = () => {
    setSelectedDay(null);
    navigate('/covoare/comenzi');
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Calendar"
        description="Zilele de preluare și termenele comenzilor, într-o singură privire."
      />

      <Card padding="var(--sp-4)">
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
          <Text size="var(--fs-small)" c="var(--text-muted)">
            contur = preluare · plin = termen
          </Text>
        </Group>

        {/* Grila lunii se afișează ÎNTOTDEAUNA — un calendar gol tot e un calendar,
            iar înlocuirea lui cu un mesaj făcea pagina să pară stricată. Mesajul
            pentru lunile fără comenzi apare discret sub grilă. */}
        <SimpleGrid
            cols={7}
            spacing={4}
            style={{ opacity: loading ? 0.55 : 1, transition: 'opacity 120ms ease' }}
          >
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
                    border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
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
                          background: e.kind === 'pickup' ? 'transparent' : 'var(--bg-subtle)',
                          border: e.kind === 'pickup' ? '1px solid var(--border-strong)' : 'none',
                          overflow: 'hidden',
                          whiteSpace: 'nowrap',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {e.client_name}
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

        {!hasAnyEntries && (
          <Group justify="center" gap="var(--sp-2)" mt="var(--sp-4)">
            <Text size="var(--fs-small)" c="var(--text-muted)">
              Nicio comandă în această lună.
            </Text>
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => navigate('/covoare/comenzi')}
            >
              Mergi la Comenzi
            </Button>
          </Group>
        )}
      </Card>

      <Modal
        opened={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        title={selectedDay ? roMediumDate(selectedDay) : ''}
      >
        {selectedEntries.length === 0 ? (
          <Text c="var(--text-muted)" size="var(--fs-body)">
            Nimic în această zi.
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
                onClick={openOrders}
              >
                <div style={{ flex: 1 }}>
                  <Group gap={8}>
                    <Text fw={600} size="var(--fs-body)">
                      {e.client_name}
                    </Text>
                    <StatusBadge tone={carpetOrderStatusTone[e.status]}>
                      {carpetOrderStatusLabels[e.status]}
                    </StatusBadge>
                  </Group>
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {e.kind === 'pickup' ? 'zi de preluare' : 'termen de livrare'}
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
