import { useEffect, useState } from 'react';
import { Button, Stack, Group, TextInput, Text } from '@mantine/core';
import { IconCertificate, IconKey } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { unwrap, runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import { StatusBadge } from '../../components/StatusBadge';
import { fmtDate } from '../../components/dateUtils';
import { pluralRo } from '../../../shared/text';

interface LicenseState {
  status: 'valid' | 'expired' | 'missing';
  expiresAt?: string;
  daysLeft?: number;
  warning?: boolean;
}

export function LicentaTab() {
  const [state, setState] = useState<LicenseState | null>(null);
  const [token, setToken] = useState('');
  const [activating, setActivating] = useState(false);

  const load = () =>
    unwrap<LicenseState>(ddd.license.check())
      .then(setState)
      .catch(() => undefined);

  useEffect(() => {
    load();
  }, []);

  const activate = async () => {
    setActivating(true);
    const result = await runMutation<LicenseState>(
      ddd.license.activate({ token: token.trim() }),
      'Licența a fost activată.',
    );
    setActivating(false);
    if (result) {
      setToken('');
      setState(result);
    }
  };

  return (
    <SectionCard
      maw={640}
      title="Licența aplicației"
      description="Starea licenței și introducerea unei chei noi. Cheia se aplică imediat, fără repornire."
      icon={<IconCertificate size={21} stroke={1.7} />}
      titleRight={
        state?.status === 'valid' ? (
          state.warning ? (
            <StatusBadge tone="warning">Expiră curând</StatusBadge>
          ) : (
            <StatusBadge tone="success">Activă</StatusBadge>
          )
        ) : state?.status === 'expired' ? (
          <StatusBadge tone="danger">Expirată</StatusBadge>
        ) : (
          <StatusBadge tone="neutral">Lipsă</StatusBadge>
        )
      }
    >
      <Stack gap="var(--sp-4)">
        {state?.status === 'valid' && (
          <Text size="var(--fs-body)">
            Licența este valabilă până la <b>{fmtDate(state.expiresAt!)}</b>
            {state.daysLeft !== undefined && (
              <Text component="span" c="var(--text-muted)">
                {' '}
                ({state.daysLeft === 0
                  ? 'expiră astăzi'
                  : `încă ${pluralRo(state.daysLeft, 'zi', 'zile')}`})
              </Text>
            )}
            .
          </Text>
        )}
        {state?.status === 'expired' && (
          <Text size="var(--fs-body)" c="var(--danger)">
            Licența a expirat pe {fmtDate(state.expiresAt!)}.
          </Text>
        )}

        <Group align="flex-end" gap="var(--sp-2)">
          <TextInput
            label="Cheie nouă"
            placeholder="TONIK-..."
            leftSection={<IconKey size={15} />}
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && token.trim() && activate()}
            style={{ flex: 1 }}
          />
          <Button onClick={activate} loading={activating} disabled={!token.trim()}>
            Activează
          </Button>
        </Group>
        <Text size="var(--fs-small)" c="var(--text-muted)">
          Poți introduce cheia nouă oricând înainte de expirare — valabilitatea nouă o
          înlocuiește pe cea veche, fără nicio întrerupere.
        </Text>
      </Stack>
    </SectionCard>
  );
}
