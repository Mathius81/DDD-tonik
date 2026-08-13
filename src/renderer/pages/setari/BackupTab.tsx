import { useState } from 'react';
import { Button, Stack, Group, Switch, NumberInput, Text, Table, Alert } from '@mantine/core';
import { modals } from '@mantine/modals';
import { ddd } from '../../api/ddd';
import { runMutation, useIpcQuery } from '../../api/useIpc';
import { fmtDateTime } from '../../components/dateUtils';
import type { Settings } from '../../../shared/schemas/settings';

interface BackupInfo {
  file: string;
  name: string;
  created_at: string;
  size_bytes: number;
}

export function BackupTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [autoBackup, setAutoBackup] = useState(settings.backup.auto_backup);
  const [keepLast, setKeepLast] = useState(settings.backup.keep_last);
  const [creating, setCreating] = useState(false);

  const { data: backups, reload } = useIpcQuery<BackupInfo[]>(() => ddd.backup.list(), []);

  const save = async () => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        backup: { ...settings.backup, auto_backup: autoBackup, keep_last: keepLast },
      }),
      'Setările de backup au fost salvate.',
    );
    if (saved) onSaved();
  };

  const createBackup = async () => {
    setCreating(true);
    const result = await runMutation<BackupInfo>(ddd.backup.create(), 'Backup creat cu succes.');
    setCreating(false);
    if (result) reload();
  };

  const confirmRestore = (b: BackupInfo) =>
    modals.openConfirmModal({
      title: 'Restaurează backup',
      children: (
        <Text size="sm">
          Sigur restaurezi baza de date din backup-ul <b>{b.name}</b> din{' '}
          {fmtDateTime(b.created_at)}? Datele actuale vor fi înlocuite (se creează automat un backup
          al lor înainte). Aplicația va reporni.
        </Text>
      ),
      labels: { confirm: 'Restaurează', cancel: 'Renunță' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        await runMutation(ddd.backup.restore({ file: b.name }), 'Backup restaurat. Aplicația repornește...');
      },
    });

  return (
    <Stack maw={640}>
      <Switch
        label="Backup automat (o dată pe zi, la prima pornire)"
        checked={autoBackup}
        onChange={(e) => setAutoBackup(e.currentTarget.checked)}
      />
      <NumberInput
        label="Păstrează ultimele backup-uri"
        min={1}
        max={365}
        w={220}
        value={keepLast}
        onChange={(v) => setKeepLast(Number(v) || 30)}
      />
      <Group>
        <Button onClick={save}>Salvează setările</Button>
        <Button variant="default" onClick={createBackup} loading={creating}>
          Creează backup acum
        </Button>
      </Group>

      <Text fw={600} mt="md">
        Backup-uri existente
      </Text>
      {(backups ?? []).length === 0 ? (
        <Alert variant="light">Nu există încă backup-uri.</Alert>
      ) : (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Fișier</Table.Th>
              <Table.Th>Data</Table.Th>
              <Table.Th>Mărime</Table.Th>
              <Table.Th></Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {(backups ?? []).map((b) => (
              <Table.Tr key={b.name}>
                <Table.Td>{b.name}</Table.Td>
                <Table.Td>{fmtDateTime(b.created_at)}</Table.Td>
                <Table.Td>{(b.size_bytes / 1024 / 1024).toFixed(1)} MB</Table.Td>
                <Table.Td>
                  <Button size="compact-sm" variant="light" color="red" onClick={() => confirmRestore(b)}>
                    Restaurează
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
