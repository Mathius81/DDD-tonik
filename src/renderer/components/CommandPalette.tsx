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
import { Modal, TextInput, Stack, Text, UnstyledButton, Kbd } from '@mantine/core';
import { useNavigate } from 'react-router-dom';
import { IconSearch, IconBuildingCommunity, IconPlus, IconDeviceFloppy } from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { unwrap, runMutation } from '../api/useIpc';
import { unaccentRo } from '../../shared/text';
import { useWorkspace, workspacePath } from '../workspace';
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

/**
 * Command palette (Cmd/Ctrl+K) — pagini, acțiuni și căutare, toate limitate
 * la spațiul de lucru curent (Brief: comutator de spații de lucru §7).
 */
export function CommandPalette({ opened, onClose, onAddIntervention }: Props) {
  const navigate = useNavigate();
  const { workspace, navItems } = useWorkspace();
  const [query, setQuery] = useState('');
  const [associations, setAssociations] = useState<AssociationListItem[]>([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!opened) {
      setQuery('');
      setHighlighted(0);
      setAssociations([]);
      return;
    }
    // Căutarea de asociații e specifică datelor DDD — nu are sens în celelalte spații.
    if (workspace !== 'ddd') {
      setAssociations([]);
      return;
    }
    unwrap<Paginated<AssociationListItem>>(
      ddd.associations.list({ status: 'all', page: 1, pageSize: 200 }),
    )
      .then((r) => setAssociations(r.items))
      .catch(() => undefined);
  }, [opened, workspace]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const baseCommands: Command[] = useMemo(() => {
    const pages: Command[] = navItems.map((item, i) => ({
      id: `nav-${item.key}`,
      label: item.label,
      hint: i < 9 ? `⌘${i + 1}` : undefined,
      icon: <item.icon size={16} />,
      run: () => go(workspacePath(workspace, item)),
    }));

    const actions: Command[] = [];
    // Adăugarea de intervenții e o acțiune specifică DDD — ascunsă în alte spații.
    if (workspace === 'ddd') {
      actions.push({
        id: 'act-interventie',
        label: 'Adaugă intervenție',
        hint: '⌘N',
        icon: <IconPlus size={16} />,
        run: () => {
          onClose();
          onAddIntervention();
        },
      });
    }
    actions.push({
      id: 'act-backup',
      label: 'Fă backup acum',
      icon: <IconDeviceFloppy size={16} />,
      run: async () => {
        onClose();
        await runMutation(ddd.backup.create(), 'Backup creat.');
      },
    });

    return [...pages, ...actions];
  }, [navItems, workspace]);

  const results: Command[] = useMemo(() => {
    const q = unaccentRo(query.trim());
    if (!q) return baseCommands;
    const commands = baseCommands.filter((c) => unaccentRo(c.label).includes(q));
    if (workspace !== 'ddd') return commands;
    const assocMatches = associations
      .filter((a) => unaccentRo(a.name).includes(q) || unaccentRo(a.address).includes(q))
      .slice(0, 8)
      .map((a) => ({
        id: `assoc-${a.id}`,
        label: a.name,
        hint: a.address,
        icon: <IconBuildingCommunity size={16} />,
        run: () => go(`/ddd/asociatii/${a.id}`),
      }));
    return [...assocMatches, ...commands];
  }, [query, baseCommands, associations, workspace]);

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
