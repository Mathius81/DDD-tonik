import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Button,
  TextInput,
  SegmentedControl,
  Text,
  Card,
  Menu,
  ActionIcon,
  Anchor,
  Tooltip,
} from '@mantine/core';
import { DataTable } from 'mantine-datatable';
import { useNavigate } from 'react-router-dom';
import { useDebouncedValue } from '@mantine/hooks';
import {
  IconPlus,
  IconSearch,
  IconBuildingCommunity,
  IconDotsVertical,
  IconX,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ServiceDot } from '../../components/ServiceBadge';
import { DueDate } from '../../components/DueDate';
import { StatusBadge } from '../../components/StatusBadge';
import { daysBetween, todayIso } from '../../../shared/dates';
import { AssociationFormModal } from './AssociationFormModal';
import type { AssociationListItem } from '../../../shared/schemas/association';
import type { Paginated } from '../../../shared/schemas/common';

const PAGE_SIZE = 50;

export function AsociatiiPage() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  // Scurtătura '/' focusează căutarea (Brief §5.3).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { data, loading, reload } = useIpcQuery<Paginated<AssociationListItem>>(
    () =>
      ddd.associations.list({
        search: debouncedSearch || undefined,
        status,
        page,
        pageSize: PAGE_SIZE,
      }),
    [debouncedSearch, status, page],
  );

  const isEmpty = !loading && data && data.total === 0 && !debouncedSearch && status === 'active';
  const today = todayIso();

  const deactivate = async (a: AssociationListItem) => {
    await runMutation(
      ddd.associations.setActive({ id: a.id, active: !a.active }),
      a.active ? 'Asociația a fost dezactivată.' : 'Asociația a fost reactivată.',
    );
    reload();
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Asociații"
        description="Clienții tăi și următoarele lor intervenții."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={() => setModalOpen(true)}>
            Adaugă asociație
          </Button>
        }
      />

      <SegmentedControl
        value={status}
        onChange={(v) => {
          setStatus(v as typeof status);
          setPage(1);
        }}
        w="fit-content"
        data={[
          { value: 'all', label: 'Toate' },
          { value: 'active', label: 'Active' },
          { value: 'inactive', label: 'Inactive' },
        ]}
      />

      <Card padding="var(--sp-4)">
        <Group mb="var(--sp-3)">
          <TextInput
            ref={searchRef}
            placeholder="Caută după denumire, adresă, administrator sau telefon  ·  /"
            leftSection={<IconSearch size={15} />}
            rightSection={
              search ? (
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => setSearch('')}>
                  <IconX size={14} />
                </ActionIcon>
              ) : null
            }
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1, maxWidth: 480 }}
          />
        </Group>

        {isEmpty ? (
          <EmptyState
            icon={<IconBuildingCommunity size={24} stroke={1.5} />}
            title="Nicio asociație încă."
            description="Adaugă prima asociație pentru a începe."
            actionLabel="Adaugă prima asociație"
            onAction={() => setModalOpen(true)}
          />
        ) : (
          <DataTable
            minHeight={160}
            records={data?.items ?? []}
            fetching={loading}
            totalRecords={data?.total ?? 0}
            recordsPerPage={PAGE_SIZE}
            page={page}
            onPageChange={setPage}
            onRowClick={({ record }) => navigate(`/asociatii/${record.id}`)}
            highlightOnHover
            verticalSpacing={6}
            noRecordsText="Nicio asociație nu corespunde căutării."
            columns={[
              {
                accessor: 'name',
                title: 'Denumire',
                render: (r) => (
                  <Text size="var(--fs-body)" fw={600}>
                    {r.name}
                  </Text>
                ),
              },
              {
                accessor: 'address',
                title: 'Adresă',
                render: (r) => (
                  <Text size="var(--fs-small)" c="var(--text-muted)">
                    {[r.address, r.city].filter(Boolean).join(', ')}
                  </Text>
                ),
              },
              {
                accessor: 'active_services',
                title: 'Servicii',
                render: (r) =>
                  r.active_services.length > 0 ? (
                    <Tooltip label={r.active_services.join(' · ')} withArrow>
                      <Group gap={4} wrap="nowrap">
                        {r.active_services.slice(0, 4).map((s) => (
                          <ServiceDot key={s} name={s} />
                        ))}
                      </Group>
                    </Tooltip>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      —
                    </Text>
                  ),
              },
              {
                accessor: 'primary_contact_name',
                title: 'Contact principal',
                render: (r) =>
                  r.primary_contact_name ? (
                    <div>
                      <Text size="var(--fs-body)">{r.primary_contact_name}</Text>
                      {r.primary_contact_phone && (
                        <Text size="var(--fs-small)" c="var(--text-muted)" className="tonik-num">
                          {r.primary_contact_phone}
                        </Text>
                      )}
                    </div>
                  ) : (
                    <Anchor
                      size="var(--fs-small)"
                      c="var(--accent)"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/asociatii/${r.id}`);
                      }}
                    >
                      Adaugă contact
                    </Anchor>
                  ),
              },
              {
                accessor: 'next_due_date',
                title: 'Următoarea intervenție',
                render: (r) =>
                  r.next_due_date ? (
                    <div>
                      <DueDate
                        isoDate={r.next_due_date}
                        daysRemaining={daysBetween(today, r.next_due_date)}
                      />
                      {r.next_service_name && (
                        <div style={{ marginTop: 2 }}>
                          <ServiceDot name={r.next_service_name} size={6} />{' '}
                          <Text component="span" size="var(--fs-small)" c="var(--text-muted)">
                            {r.next_service_name}
                          </Text>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Text size="var(--fs-small)" c="var(--text-faint)">
                      —
                    </Text>
                  ),
              },
              {
                accessor: 'active',
                title: 'Status',
                width: 90,
                render: (r) =>
                  r.active ? (
                    <StatusBadge tone="success">Activă</StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">Inactivă</StatusBadge>
                  ),
              },
              {
                accessor: 'actions',
                title: '',
                width: 44,
                render: (r) => (
                  <Menu withinPortal position="bottom-end" shadow="lg">
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Acțiuni"
                      >
                        <IconDotsVertical size={16} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item onClick={() => navigate(`/asociatii/${r.id}`)}>
                        Vezi detalii
                      </Menu.Item>
                      <Menu.Item
                        onClick={(e) => {
                          e.stopPropagation();
                          deactivate(r);
                        }}
                      >
                        {r.active ? 'Dezactivează' : 'Reactivează'}
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                ),
              },
            ]}
          />
        )}
      </Card>

      <AssociationFormModal
        opened={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={(a) => {
          setModalOpen(false);
          reload();
          navigate(`/asociatii/${a.id}`);
        }}
      />
    </Stack>
  );
}
