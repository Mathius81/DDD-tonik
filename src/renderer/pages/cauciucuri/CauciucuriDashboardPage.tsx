/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useState } from 'react';
import { Button, Card, Divider, Group, Stack, Text, UnstyledButton, Badge } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconPlus, IconBuildingWarehouse, IconCar, IconPackageImport, IconChevronRight } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { fmtDate } from '../../components/dateUtils';
import { StorageFormModal } from './StorageFormModal';
import { tyreSeasonColor } from './cauciucuri-ui';
import { tyreSeasonLabels, type TyreDashboardData, type TyreStorageListItem } from '../../../shared/schemas/tyre';

function SetRow({ set, onClick }: { set: TyreStorageListItem; onClick: () => void }) {
  return (
    <UnstyledButton
      onClick={onClick}
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <Group gap={8} wrap="nowrap">
          <Text size="var(--fs-body)" fw={600} truncate className="tonik-num">
            {set.plate_number}
          </Text>
          <Text size="var(--fs-body)" c="var(--text-muted)" truncate>
            {set.client_name}
          </Text>
          <Badge variant="light" color={tyreSeasonColor[set.season]} size="sm">
            {tyreSeasonLabels[set.season]}
          </Badge>
        </Group>
        <Text size="var(--fs-small)" c="var(--text-muted)">
          {set.size}
          {set.brand ? ` · ${set.brand}` : ''} · intrat {fmtDate(set.date_in)}
        </Text>
      </div>
      <IconChevronRight size={14} color="var(--text-faint)" />
    </UnstyledButton>
  );
}

export function CauciucuriDashboardPage() {
  const navigate = useNavigate();
  const [setOpen, setSetOpen] = useState(false);

  const { data, reload } = useIpcQuery<TyreDashboardData>(() => ddd.tyres.dashboard.get(), []);
  const counts = data?.counts;

  const openCreate = () => setSetOpen(true);

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Dashboard Cauciucuri"
        description="Vulcanizare și hotel de cauciucuri — ce ai în hotel acum."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Set nou în hotel
          </Button>
        }
      />

      <Group grow align="stretch">
        <StatCard
          label="Seturi în hotel"
          value={counts?.sets_in_storage ?? '…'}
          icon={<IconBuildingWarehouse size={20} stroke={1.7} />}
          color="blue"
          onClick={() => navigate('/cauciucuri/hotel')}
        />
        <StatCard
          label="Mașini înregistrate"
          value={counts?.vehicles_total ?? '…'}
          icon={<IconCar size={20} stroke={1.7} />}
          color="grape"
          onClick={() => navigate('/cauciucuri/masini')}
        />
        <StatCard
          label="Intrări în ultimele 30 zile"
          value={counts?.intakes_last_30_days ?? '…'}
          icon={<IconPackageImport size={20} stroke={1.7} />}
          color="teal"
        />
      </Group>

      <Card padding="var(--sp-4)">
        <Text size="var(--fs-micro)" fw={600} tt="uppercase" c="var(--text-muted)" style={{ letterSpacing: '0.09em' }}>
          În hotel
        </Text>
        <Divider my={6} />
        {(data?.inStorage ?? []).length === 0 ? (
          <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
            Niciun set în hotel momentan.
          </Text>
        ) : (
          <Stack gap={2}>
            {(data?.inStorage ?? []).map((s) => (
              <SetRow key={s.id} set={s} onClick={() => navigate('/cauciucuri/hotel')} />
            ))}
          </Stack>
        )}
      </Card>

      <Card padding="var(--sp-4)">
        <Text size="var(--fs-micro)" fw={600} tt="uppercase" c="var(--text-muted)" style={{ letterSpacing: '0.09em' }}>
          Intrări recente
        </Text>
        <Divider my={6} />
        {(data?.recentIntakes ?? []).length === 0 ? (
          <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
            Nicio intrare recentă.
          </Text>
        ) : (
          <Stack gap={2}>
            {(data?.recentIntakes ?? []).map((s) => (
              <SetRow key={s.id} set={s} onClick={() => navigate('/cauciucuri/hotel')} />
            ))}
          </Stack>
        )}
      </Card>

      <StorageFormModal
        opened={setOpen}
        onClose={() => setSetOpen(false)}
        onSaved={() => {
          setSetOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
