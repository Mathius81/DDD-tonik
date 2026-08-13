import { useState } from 'react';
import { TextInput, PasswordInput, NumberInput, Button, Stack, Group, Switch, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { notifications } from '@mantine/notifications';
import type { Settings } from '../../../shared/schemas/settings';

export function EmailTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const form = useForm({ initialValues: settings.smtp });

  const submit = form.onSubmit(async (values) => {
    // Parola merge separat, criptată cu safeStorage; nu se salvează în setări.
    if (password) {
      const ok = await runMutation(ddd.settings.setSecret({ key: 'smtp_password', value: password }));
      if (ok === null) return;
      values.has_password = true;
    }
    const saved = await runMutation(
      ddd.settings.update({ ...settings, smtp: values }),
      'Setările de email au fost salvate.',
    );
    if (saved) {
      setPassword('');
      onSaved();
    }
  });

  const testConnection = async () => {
    setTesting(true);
    const result = await runMutation<{ ok: boolean }>(ddd.settings.testSmtp());
    setTesting(false);
    if (result) {
      notifications.show({ color: 'teal', message: 'Conexiunea SMTP funcționează.' });
    }
  };

  return (
    <form onSubmit={submit}>
      <Stack maw={520}>
        <Group grow>
          <TextInput label="SMTP Host" placeholder="smtp.exemplu.ro" {...form.getInputProps('host')} />
          <NumberInput label="Port" min={1} max={65535} {...form.getInputProps('port')} />
        </Group>
        <Switch
          label="Conexiune securizată (SSL/TLS)"
          {...form.getInputProps('secure', { type: 'checkbox' })}
        />
        <TextInput label="Utilizator" {...form.getInputProps('username')} />
        <PasswordInput
          label="Parolă"
          placeholder={settings.smtp.has_password ? '••••••••  (salvată)' : 'Parola contului'}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          Parola este stocată criptat pe acest calculator și nu apare în setări.
        </Text>
        <Group grow>
          <TextInput label="Nume expeditor" {...form.getInputProps('from_name')} />
          <TextInput label="Email expeditor" {...form.getInputProps('from_email')} />
        </Group>
        <Group justify="space-between">
          <Button variant="default" onClick={testConnection} loading={testing}>
            Testează conexiunea
          </Button>
          <Button type="submit">Salvează</Button>
        </Group>
      </Stack>
    </form>
  );
}
