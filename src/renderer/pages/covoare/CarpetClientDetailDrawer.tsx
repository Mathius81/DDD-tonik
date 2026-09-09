/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Drawer, Stack, Group, Text, Card, Divider, Center, Loader } from '@mantine/core';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { StatusBadge } from '../../components/StatusBadge';
import { CarpetClientWhatsappButton } from './CarpetClientWhatsappButton';
import { formatMp, formatLei, carpetOrderStatusTone } from './covoare-ui';
import { formatRo } from '../../../shared/dates';
import { pluralRo } from '../../../shared/text';
import {
  carpetItemTypeLabels,
  carpetOrderStatusLabels,
  type CarpetClientGroup,
  type CarpetClientOrderSummary,
} from '../../../shared/schemas/carpet';

interface Props {
  /** Clientul selectat (dintr-un rând din Comenzi); null când sertarul e închis. */
  clientId: number | null;
  opened: boolean;
  onClose: () => void;
  /** Apelat după o trimitere reușită de WhatsApp (ex. reîncarcă lista din spate). */
  onSent?: () => void;
}

function OrderCard({ order, muted }: { order: CarpetClientOrderSummary; muted?: boolean }) {
  return (
    <Card withBorder padding="var(--sp-3)" radius="var(--radius-md)" style={muted ? { opacity: 0.75 } : undefined}>
      <Stack gap="var(--sp-2)">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <Text size="var(--fs-small)" c="var(--text-muted)">
            Preluat {formatRo(order.pickup_date)}
            {order.due_date ? ` · Termen ${formatRo(order.due_date)}` : ''}
          </Text>
          <StatusBadge tone={carpetOrderStatusTone[order.status]}>
            {carpetOrderStatusLabels[order.status]}
          </StatusBadge>
        </Group>

        <Stack gap={4}>
          {order.items.map((item, i) => (
            <Group key={i} gap={6} wrap="nowrap" justify="space-between">
              <Text size="var(--fs-small)">
                {carpetItemTypeLabels[item.type]} · {item.length_m} × {item.width_m} m
              </Text>
              <Text size="var(--fs-small)" c="var(--text-muted)">
                {formatMp(item.sqm)}
              </Text>
            </Group>
          ))}
        </Stack>

        <Group justify="space-between" wrap="nowrap">
          <Text size="var(--fs-small)" fw={600}>
            {pluralRo(order.items.length, 'covor', 'covoare')} · {formatMp(order.total_sqm)}
          </Text>
          {order.total_price != null && (
            <Text size="var(--fs-small)" c="var(--text-muted)">
              {formatLei(order.total_price)}
            </Text>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

/**
 * Fișa detaliată a unui client Covoare: TOATE comenzile lui — deschise (cu starea fiecăreia,
 * data preluării, termenul, covoarele cu dimensiuni și mp) plus istoricul comenzilor deja
 * livrate. Deschis din rândul clicabil al `ComenziPage` (cerința clientului: „adunate per
 * client”, nu risipite pe rânduri separate). Buton de trimitere WhatsApp sus, în antet.
 */
export function CarpetClientDetailDrawer({ clientId, opened, onClose, onSent }: Props) {
  const { data: group, loading, reload } = useIpcQuery<CarpetClientGroup | null>(
    () =>
      clientId != null
        ? ddd.carpets.clientSituation.get({ client_id: clientId })
        : Promise.resolve({ ok: true as const, data: null }),
    [clientId],
  );

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
              {group.phone_display ?? 'fără telefon'} ·{' '}
              {pluralRo(group.open_orders.length, 'comandă deschisă', 'comenzi deschise')}
            </Text>
          </Stack>
        )
      }
    >
      {!group && loading && (
        <Center py="var(--sp-6)">
          <Loader size="sm" />
        </Center>
      )}

      {group && clientId != null && (
        <Stack gap="var(--sp-4)">
          <Group>
            <CarpetClientWhatsappButton
              clientId={clientId}
              label="Trimite situația"
              subtitle={`${group.display_name}${group.phone_display ? ` · ${group.phone_display}` : ''}`}
              onSent={() => {
                reload();
                onSent?.();
              }}
            />
          </Group>

          <Divider label="Comenzi deschise" labelPosition="left" />

          {group.open_orders.length === 0 ? (
            <Text size="var(--fs-small)" c="var(--text-faint)">
              Nicio comandă deschisă momentan.
            </Text>
          ) : (
            <Stack gap="var(--sp-3)">
              {group.open_orders.map((o) => (
                <OrderCard key={o.order_id} order={o} />
              ))}
            </Stack>
          )}

          <Card withBorder padding="var(--sp-3)" radius="var(--radius-md)" bg="var(--bg-subtle)">
            <Text size="var(--fs-body)" fw={600}>
              Total: {pluralRo(group.total_open_items, 'covor', 'covoare')} · {formatMp(group.total_open_sqm)}
            </Text>
          </Card>

          {group.delivered_orders.length > 0 && (
            <>
              <Divider label="Istoric — comenzi livrate" labelPosition="left" />
              <Stack gap="var(--sp-3)">
                {group.delivered_orders.map((o) => (
                  <OrderCard key={o.order_id} order={o} muted />
                ))}
              </Stack>
            </>
          )}
        </Stack>
      )}
    </Drawer>
  );
}
