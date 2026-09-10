/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useMemo, useState } from 'react';
import { Stack, Card, Text, TextInput, Group, Tooltip, ActionIcon } from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { IconSearch, IconUsersGroup, IconX } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { StatusBadge } from '../../components/StatusBadge';
import { unaccentRo } from '../../../shared/text';
import { AdminSituationWhatsappButton } from './AdminSituationWhatsappButton';
import { AdministratorDetailDrawer } from './AdministratorDetailDrawer';
import type { AdministratorGroup } from '../../../shared/schemas/contact';

/**
 * Administratorii care gestionează MAI MULTE asociații — identificați automat după
 * telefon (același număr = aceeași persoană), fără nicio schimbare de date: fiecare
 * asociație rămâne un contact separat, gruparea se face doar la afișare.
 * Permite trimiterea situației complete (toate asociațiile, ce e la zi și ce nu) într-un
 * singur mesaj WhatsApp, în loc de câte unul separat per asociație.
 */
export function AdministratoriPage() {
  const [search, setSearch] = useState('');
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);

  const { data, loading, reload } = useIpcQuery<AdministratorGroup[]>(
    () => ddd.administrators.list(),
    [],
  );

  // Grupul derivat din `data` (nu memorat separat): rămâne la zi automat după orice
  // reîncărcare (ex. după o trimitere WhatsApp reușită sau după `dataChanged`).
  const selectedGroup = useMemo(
    () => (selectedPhone ? (data?.find((g) => g.phone === selectedPhone) ?? null) : null),
    [data, selectedPhone],
  );

  const filtered = useMemo(() => {
    if (!data) return null;
    const term = unaccentRo(search.trim());
    if (!term) return data;
    const digits = term.replace(/\D/g, '');
    return data.filter((g) => {
      if (unaccentRo(g.display_name).includes(term)) return true;
      if (g.names.some((n) => unaccentRo(n).includes(term))) return true;
      if (digits && g.phone_display.replace(/\D/g, '').includes(digits)) return true;
      return false;
    });
  }, [data, search]);

  const noneAtAll = data && data.length === 0;

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Administratori"
        description="Persoanele de contact ale asociațiilor. Pentru cine administrează mai multe, situația completă pleacă într-un singur mesaj."
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            placeholder="Caută după nume sau telefon"
            leftSection={<IconSearch size={15} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setSearch('')}>
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            style={{ flex: 1, maxWidth: 420 }}
          />
        </Group>

        {filtered && filtered.length === 0 ? (
          <EmptyState
            icon={<IconUsersGroup size={24} stroke={1.5} />}
            title={
              noneAtAll
                ? 'Niciun administrator înregistrat încă.'
                : 'Niciun rezultat pentru căutarea curentă.'
            }
            description={
              noneAtAll
                ? 'Aici apare automat orice persoană al cărei telefon se regăsește la mai mult de o asociație.'
                : undefined
            }
          />
        ) : (
          <DataTable
            minHeight={160}
            records={filtered ?? []}
            fetching={loading}
            idAccessor="phone"
            highlightOnHover
            verticalSpacing={6}
            noRecordsText="Niciun administrator înregistrat încă."
            onRowClick={({ record }) => setSelectedPhone(record.phone)}
            rowStyle={() => ({ cursor: 'pointer' })}
            columns={[
              {
                accessor: 'display_name',
                title: 'Nume',
                render: (g) => (
                  <div>
                    <Text size="var(--fs-body)" fw={600}>
                      {g.display_name}
                    </Text>
                    {g.do_not_contact && <StatusBadge tone="danger">Nu contacta</StatusBadge>}
                    {g.names.length > 1 && (
                      <Text size="var(--fs-small)" c="var(--text-muted)">
                        cunoscut și ca: {g.names.filter((n) => n !== g.display_name).join(', ')}
                      </Text>
                    )}
                  </div>
                ),
              },
              {
                accessor: 'phone_display',
                title: 'Telefon',
                render: (g) => (
                  <Text size="var(--fs-body)" className="tonik-num">
                    {g.phone_display}
                  </Text>
                ),
              },
              {
                accessor: 'associations_count',
                title: 'Asociații',
                render: (g) => (
                  <Tooltip
                    withArrow
                    label={
                      <Stack gap={2}>
                        {g.associations.map((a) => (
                          <Text key={a.association_id} size="xs">
                            {a.association_name} —{' '}
                            {a.open_followups.length === 0
                              ? 'la zi'
                              : a.open_followups.map((f) => f.service_name).join(', ')}
                          </Text>
                        ))}
                      </Stack>
                    }
                  >
                    <Text size="var(--fs-body)">{g.associations_count}</Text>
                  </Tooltip>
                ),
              },
              {
                accessor: 'overdue_count',
                title: 'Restante',
                render: (g) =>
                  g.overdue_count > 0 ? (
                    <StatusBadge tone="danger">{g.overdue_count}</StatusBadge>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      0
                    </Text>
                  ),
              },
              {
                accessor: 'upcoming_count',
                title: 'Scadente',
                render: (g) =>
                  g.upcoming_count > 0 ? (
                    <StatusBadge tone="warning">{g.upcoming_count}</StatusBadge>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      0
                    </Text>
                  ),
              },
              {
                accessor: 'ok_count',
                title: 'La zi',
                render: (g) =>
                  g.ok_count > 0 ? (
                    <StatusBadge tone="success">{g.ok_count}</StatusBadge>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      0
                    </Text>
                  ),
              },
              {
                accessor: 'actions',
                title: '',
                render: (g) => (
                  <AdminSituationWhatsappButton
                    phone={g.phone_display}
                    label="Trimite situația"
                    subtitle={`${g.display_name} · ${g.phone_display} · ${g.associations_count} ${g.associations_count === 1 ? 'asociație' : 'asociații'}`}
                    onSent={reload}
                  />
                ),
              },
            ]}
          />
        )}
      </Card>

      <AdministratorDetailDrawer
        group={selectedGroup}
        opened={selectedPhone !== null}
        onClose={() => setSelectedPhone(null)}
        onSent={reload}
      />
    </Stack>
  );
}
