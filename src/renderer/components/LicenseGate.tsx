import { useEffect, useState, type ReactNode } from 'react';
import { Center, Stack, Text, TextInput, Button, Card, Group, Modal, UnstyledButton } from '@mantine/core';
import { IconLock, IconKey } from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { unwrap, runMutation } from '../api/useIpc';
import { fmtDate } from './dateUtils';
import { pluralRo } from '../../shared/text';
import logoUrl from '../assets/tonik-logo.png';

interface LicenseState {
  status: 'valid' | 'expired' | 'missing';
  expiresAt?: string;
  daysLeft?: number;
  warning?: boolean;
}

/**
 * Poarta de licență: aplicația funcționează doar cu o cheie validă.
 * La expirare, datele rămân intacte pe disc — doar accesul e blocat.
 */
export function LicenseGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LicenseState | null>(null);
  const [token, setToken] = useState('');
  const [activating, setActivating] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);

  const load = () =>
    unwrap<LicenseState>(ddd.license.check())
      .then(setState)
      .catch(() => setState({ status: 'missing' }));

  useEffect(() => {
    load();
    // Reverificare o dată pe oră, ca blocarea să se aplice și cu aplicația deschisă.
    const timer = setInterval(load, 60 * 60 * 1000);
    // Activarea unei chei (inclusiv din Setări → Licență) emite dataChanged —
    // banner-ul se actualizează imediat, nu la următoarea repornire.
    const unsubscribe = ddd.events.onDataChanged(load);
    return () => {
      clearInterval(timer);
      unsubscribe();
    };
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
      setRenewOpen(false);
    }
  };

  if (!state) return null; // o fracțiune de secundă la pornire

  if (state.status === 'valid') {
    return (
      <>
        {state.warning && (
          <UnstyledButton
            onClick={() => setRenewOpen(true)}
            style={{
              display: 'block',
              width: '100%',
              background: 'var(--warning-soft)',
              color: 'var(--warning)',
              fontSize: 'var(--fs-small)',
              fontWeight: 550,
              textAlign: 'center',
              padding: '6px 12px',
            }}
          >
            Licența aplicației expiră{' '}
            {state.daysLeft === 0
              ? 'astăzi'
              : `în ${pluralRo(state.daysLeft ?? 0, 'zi', 'zile')}`}{' '}
            ({fmtDate(state.expiresAt!)}). Ai deja cheia nouă? Apasă aici ca să o introduci.
          </UnstyledButton>
        )}
        {children}

        {/* Reînnoire înainte de expirare — cheia nouă se poate introduce oricând. */}
        <Modal
          opened={renewOpen}
          onClose={() => setRenewOpen(false)}
          title="Reînnoiește licența"
        >
          <Stack gap="var(--sp-3)">
            <Text size="var(--fs-body)" c="var(--text-muted)">
              Licența actuală este valabilă până la {fmtDate(state.expiresAt!)}. Introdu cheia
              nouă primită de la furnizor — se aplică imediat, fără întrerupere.
            </Text>
            <TextInput
              placeholder="TONIK-..."
              leftSection={<IconKey size={15} />}
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
              onKeyDown={(e) => e.key === 'Enter' && token.trim() && activate()}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRenewOpen(false)}>
                Renunță
              </Button>
              <Button onClick={activate} loading={activating} disabled={!token.trim()}>
                Activează
              </Button>
            </Group>
          </Stack>
        </Modal>
      </>
    );
  }

  return (
    <Center h="100vh" style={{ background: 'var(--bg-sidebar)' }}>
      <Card maw={440} w="100%" padding="var(--sp-6)" radius="lg">
        <Stack align="center" gap="var(--sp-4)">
          <img src={logoUrl} alt="Tonik" style={{ width: 160, height: 'auto' }} />
          <Group gap={8}>
            <IconLock size={18} color="var(--text-muted)" />
            <Text fw={650} fz="var(--fs-section)">
              {state.status === 'expired' ? 'Licența a expirat' : 'Aplicația necesită activare'}
            </Text>
          </Group>
          <Text size="var(--fs-body)" c="var(--text-muted)" ta="center">
            {state.status === 'expired'
              ? `Perioada de utilizare s-a încheiat pe ${fmtDate(state.expiresAt!)}. Datele tale sunt în siguranță și vor fi din nou accesibile după reactivare.`
              : 'Introdu cheia de activare primită de la furnizor pentru a folosi aplicația.'}
          </Text>
          <TextInput
            w="100%"
            placeholder="TONIK-..."
            leftSection={<IconKey size={15} />}
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && token.trim() && activate()}
          />
          <Button fullWidth onClick={activate} loading={activating} disabled={!token.trim()}>
            Activează
          </Button>
          <Text size="var(--fs-small)" c="var(--text-faint)" ta="center">
            Pentru o cheie nouă, contactează furnizorul aplicației.
          </Text>
        </Stack>
      </Card>
    </Center>
  );
}
