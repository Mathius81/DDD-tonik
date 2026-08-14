import { useEffect, useMemo, useState } from 'react';
import { Modal, TextInput, Stack, Text, UnstyledButton, Kbd } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import {
  IconSearch,
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconSpray,
  IconCalendarEvent,
  IconBellRinging,
  IconMailForward,
  IconSettings,
  IconPlus,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { unwrap, runMutation } from '../api/useIpc';
import { unaccentRo } from '../../shared/text';
import type { AssociationListItem } from '../../shared/schemas/association';
import type { Paginated } from '../../shared/schemas/common';

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

interface Props {
  opened: boolean;
  onClose: () => void;
  onAddIntervention: () => void;
}

/** Command palette (Cmd/Ctrl+K) — pagini, acțiuni și căutare de asociații (Brief §7.1). */
export function CommandPalette({ opened, onClose, onAddIntervention }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [associations, setAssociations] = useState<AssociationListItem[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!opened) {
      setQuery('');
      setHighlighted(0);
      return;
    }
    unwrap<Paginated<AssociationListItem>>(
      ddd.associations.list({ status: 'all', page: 1, pageSize: 200 }),
    )
      .then((r) => setAssociations(r.items))
      .catch(() => undefined);
  }, [opened]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const baseCommands: Command[] = useMemo(
    () => [
      { id: 'nav-dashboard', label: 'Dashboard', hint: '⌘1', icon: <IconLayoutDashboard size={16} />, run: () => go('/') },
      { id: 'nav-asociatii', label: 'Asociații', hint: '⌘2', icon: <IconBuildingCommunity size={16} />, run: () => go('/asociatii') },
      { id: 'nav-interventii', label: 'Intervenții', hint: '⌘3', icon: <IconSpray size={16} />, run: () => go('/interventii') },
      { id: 'nav-calendar', label: 'Calendar', hint: '⌘4', icon: <IconCalendarEvent size={16} />, run: () => go('/calendar') },
      { id: 'nav-remindere', label: 'Remindere', hint: '⌘5', icon: <IconBellRinging size={16} />, run: () => go('/remindere') },
      { id: 'nav-mesaje', label: 'Mesaje', hint: '⌘6', icon: <IconMailForward size={16} />, run: () => go('/mesaje') },
      { id: 'nav-setari', label: 'Setări', hint: '⌘7', icon: <IconSettings size={16} />, run: () => go('/setari') },
      {
        id: 'act-interventie',
        label: 'Adaugă intervenție',
        hint: '⌘N',
        icon: <IconPlus size={16} />,
        run: () => {
          onClose();
          onAddIntervention();
        },
      },
      {
        id: 'act-backup',
        label: 'Fă backup acum',
        icon: <IconDeviceFloppy size={16} />,
        run: async () => {
          onClose();
          await runMutation(ddd.backup.create(), 'Backup creat.');
        },
      },
    ],
    [],
  );

  const results: Command[] = useMemo(() => {
    const q = unaccentRo(query.trim());
    if (!q) return baseCommands;
    const commands = baseCommands.filter((c) => unaccentRo(c.label).includes(q));
    const assocMatches = associations
      .filter((a) => unaccentRo(a.name).includes(q) || unaccentRo(a.address).includes(q))
      .slice(0, 8)
      .map((a) => ({
        id: `assoc-${a.id}`,
        label: a.name,
        hint: a.address,
        icon: <IconBuildingCommunity size={16} />,
        run: () => go(`/asociatii/${a.id}`),
      }));
    return [...assocMatches, ...commands];
  }, [query, baseCommands, associations]);

  useEffect(() => setHighlighted(0), [results.length, query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && results[highlighted]) {
      results[highlighted].run();
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      size={520}
      yOffset={120}
    >
      <TextInput
        autoFocus
        placeholder="Caută asociații sau comenzi..."
        leftSection={<IconSearch size={16} />}
        rightSection={<Kbd size="xs">Esc</Kbd>}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={onKeyDown}
        variant="unstyled"
        px="var(--sp-3)"
        py="var(--sp-2)"
        styles={{ input: { fontSize: 'var(--fs-section)' } }}
      />
      <div style={{ borderTop: '1px solid var(--border)', maxHeight: 360, overflowY: 'auto' }}>
        {results.length === 0 ? (
          <Text p="var(--sp-4)" size="var(--fs-body)" c="var(--text-muted)">
            Niciun rezultat pentru „{query}”.
          </Text>
        ) : (
          <Stack gap={0} p={6}>
            {results.map((cmd, i) => (
              <UnstyledButton
                key={cmd.id}
                onClick={cmd.run}
                onMouseEnter={() => setHighlighted(i)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-md)',
                  background: i === highlighted ? 'var(--accent-soft)' : 'transparent',
                  color: i === highlighted ? 'var(--accent)' : 'var(--text)',
                }}
              >
                {cmd.icon}
                <Text size="var(--fs-body)" fw={550} style={{ flex: 1 }} truncate>
                  {cmd.label}
                </Text>
                {cmd.hint && (
                  <Text size="var(--fs-small)" c="var(--text-faint)" truncate maw={180}>
                    {cmd.hint}
                  </Text>
                )}
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </div>
    </Modal>
  );
}
