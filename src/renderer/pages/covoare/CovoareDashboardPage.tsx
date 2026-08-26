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
import { Button, Card, Divider, Group, Stack, Text, UnstyledButton } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconPlus,
  IconTool,
  IconPackageExport,
  IconClipboardCheck,
  IconChevronRight,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { fmtDate } from '../../components/dateUtils';
import { OrderFormModal } from './OrderFormModal';
import { formatMp, carpetOrderStatusTone } from './covoare-ui';
import { carpetOrderStatusLabels, type CarpetDashboardData, type CarpetOrderListItem, type CarpetOrderWithItems } from '../../../shared/schemas/carpet';
import { StatusBadge } from '../../components/StatusBadge';
import { pluralRo } from '../../../shared/text';

function OrderRow({ order, onClick }: { order: CarpetOrderListItem; onClick: () => void }) {
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
          <Text size="var(--fs-body)" fw={600} truncate>
            {order.client_name}
          </Text>
          <StatusBadge tone={carpetOrderStatusTone[order.status]}>
            {carpetOrderStatusLabels[order.status]}
          </StatusBadge>
        </Group>
        <Text size="var(--fs-small)" c="var(--text-muted)">
          {pluralRo(order.item_count, 'covor', 'covoare')} · {formatMp(order.total_sqm)} · preluat{' '}
          {fmtDate(order.pickup_date)}
        </Text>
      </div>
      <IconChevronRight size={14} color="var(--text-faint)" />
    </UnstyledButton>
  );
}

export function CovoareDashboardPage() {
  const navigate = useNavigate();
  const [orderOpen, setOrderOpen] = useState(false);
  const [editing, setEditing] = useState<CarpetOrderWithItems | null>(null);

  const { data, reload } = useIpcQuery<CarpetDashboardData>(() => ddd.carpets.dashboard.get(), []);
  const counts = data?.counts;

  const openOrder = async (row: CarpetOrderListItem) => {
    const result = await ddd.carpets.orders.get({ id: row.id });
    if (result.ok) {
      setEditing(result.data);
      setOrderOpen(true);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setOrderOpen(true);
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Dashboard Covoare"
        description="Ce trebuie făcut astăzi în spălătorie."
        actions={
          <Button leftSection={<IconPlus size={16} />} onClick={openCreate}>
            Adaugă comandă
          </Button>
        }
      />

      <Group grow align="stretch">
        <StatCard
          label="În lucru"
          value={counts?.in_lucru ?? '…'}
          icon={<IconTool size={20} stroke={1.7} />}
          color="blue"
          onClick={() => navigate('/covoare/comenzi?status=in_lucru')}
        />
        <StatCard
          label="Gata de livrat"
          value={counts?.gata ?? '…'}
          icon={<IconPackageExport size={20} stroke={1.7} />}
          color="yellow"
          emphasized={(counts?.gata ?? 0) > 0}
          onClick={() => navigate('/covoare/comenzi?status=gata')}
        />
        <StatCard
          label="Preluate azi"
          value={counts?.preluate_azi ?? '…'}
          icon={<IconClipboardCheck size={20} stroke={1.7} />}
          color="teal"
        />
      </Group>

      <Card padding="var(--sp-4)">
        <Text
          size="var(--fs-micro)"
          fw={600}
          tt="uppercase"
          c="var(--text-muted)"
          style={{ letterSpacing: '0.09em' }}
        >
          Gata de livrat
        </Text>
        <Divider my={6} />
        {(data?.readyToDeliver ?? []).length === 0 ? (
          <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
            Nicio comandă gata de livrat momentan.
          </Text>
        ) : (
          <Stack gap={2}>
            {(data?.readyToDeliver ?? []).map((o) => (
              <OrderRow key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
          </Stack>
        )}
      </Card>

      <Card padding="var(--sp-4)">
        <Text
          size="var(--fs-micro)"
          fw={600}
          tt="uppercase"
          c="var(--text-muted)"
          style={{ letterSpacing: '0.09em' }}
        >
          Preluate azi
        </Text>
        <Divider my={6} />
        {(data?.todayPickups ?? []).length === 0 ? (
          <Text size="var(--fs-small)" c="var(--text-faint)" py={8}>
            Nicio comandă preluată astăzi.
          </Text>
        ) : (
          <Stack gap={2}>
            {(data?.todayPickups ?? []).map((o) => (
              <OrderRow key={o.id} order={o} onClick={() => openOrder(o)} />
            ))}
          </Stack>
        )}
      </Card>

      <OrderFormModal
        key={editing?.id ?? 'new'}
        opened={orderOpen}
        order={editing}
        onClose={() => setOrderOpen(false)}
        onSaved={() => {
          setOrderOpen(false);
          reload();
        }}
      />
    </Stack>
  );
}
