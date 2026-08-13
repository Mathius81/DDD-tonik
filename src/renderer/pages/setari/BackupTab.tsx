import { useState } from 'react';
import {
  Button,
  Stack,
  Group,
  Switch,
  NumberInput,
  Text,
  Table,
  Alert,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconDatabase,
  IconDeviceFloppy,
  IconHistory,
  IconRestore,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, useIpcQuery } from '../../api/useIpc';
import { fmtDateTime } from '../../components/dateUtils';
import { SectionCard } from '../../components/SectionCard';
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
        await runMutation(
          ddd.backup.restore({ file: b.name }),
          'Backup restaurat. Aplicația repornește...',
        );
      },
    });

  return (
    <Stack gap="lg" maw={720}>
      <SectionCard
        title="Backup automat"
        description="Aplicația creează zilnic o copie de siguranță a datelor, la prima pornire din zi."
        icon={<IconDatabase size={21} stroke={1.7} />}
      >
        <Stack gap="md">
          <Switch
            label="Backup automat activ"
            checked={autoBackup}
            onChange={(e) => setAutoBackup(e.currentTarget.checked)}
          />
          <NumberInput
            label="Păstrează ultimele backup-uri"
            description="Copiile mai vechi se șterg automat"
            min={1}
            max={365}
            w={240}
            value={keepLast}
            onChange={(v) => setKeepLast(Number(v) || 30)}
          />
          <Group>
            <Button onClick={save}>Salvează setările</Button>
            <Button
              variant="default"
              onClick={createBackup}
              loading={creating}
              leftSection={<IconDeviceFloppy size={17} />}
            >
              Creează backup acum
            </Button>
          </Group>
        </Stack>
      </SectionCard>

      <SectionCard
        title="Backup-uri existente"
        description="Restaurarea aduce datele exact la momentul backup-ului ales."
        icon={<IconHistory size={21} stroke={1.7} />}
      >
        {(backups ?? []).length === 0 ? (
          <Alert variant="light" color="gray">
            Nu există încă backup-uri.
          </Alert>
        ) : (
          <Table verticalSpacing="sm" highlightOnHover>
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
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {b.name}
                    </Text>
                  </Table.Td>
                  <Table.Td>{fmtDateTime(b.created_at)}</Table.Td>
                  <Table.Td>{(b.size_bytes / 1024 / 1024).toFixed(1)} MB</Table.Td>
                  <Table.Td align="right">
                    <Button
                      size="compact-sm"
                      variant="light"
                      color="red"
                      leftSection={<IconRestore size={15} />}
                      onClick={() => confirmRestore(b)}
                    >
                      Restaurează
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </SectionCard>
    </Stack>
  );
}
