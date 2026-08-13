import { useState } from 'react';
import {
  TextInput,
  PasswordInput,
  NumberInput,
  Button,
  Stack,
  Group,
  Switch,
  Badge,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMail, IconPlugConnected } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { notifications } from '@mantine/notifications';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';

export function EmailTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const form = useForm({ initialValues: settings.smtp });

  const configured = !!settings.smtp.host;

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
    <SectionCard
      title="Configurare email"
      description="Trimite remindere și mesaje prin serverul de email al firmei. Fără configurare, mesajele se deschid în aplicația ta de email, gata de trimis."
      icon={<IconMail size={21} stroke={1.7} />}
      titleRight={
        configured ? (
          <Badge color="teal" variant="light">
            Configurată
          </Badge>
        ) : (
          <Badge color="gray" variant="light">
            Neconfigurată
          </Badge>
        )
      }
      maw={640}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Group grow align="flex-start">
            <TextInput
              label="Server SMTP"
              placeholder="smtp.exemplu.ro"
              {...form.getInputProps('host')}
            />
            <NumberInput label="Port" min={1} max={65535} {...form.getInputProps('port')} />
          </Group>
          <Switch
            label="Conexiune securizată (SSL/TLS)"
            description="Recomandat pentru portul 465. Pentru 587 se folosește STARTTLS automat."
            {...form.getInputProps('secure', { type: 'checkbox' })}
          />

          <Divider label="Autentificare" labelPosition="left" my={4} />

          <Group grow align="flex-start">
            <TextInput label="Utilizator" placeholder="nume@exemplu.ro" {...form.getInputProps('username')} />
            <PasswordInput
              label="Parolă"
              placeholder={settings.smtp.has_password ? '••••••••  (salvată)' : 'Parola contului'}
              description="Stocată criptat pe acest calculator"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
          </Group>

          <Divider label="Expeditor" labelPosition="left" my={4} />

          <Group grow align="flex-start">
            <TextInput label="Nume expeditor" placeholder="Tonik SRL" {...form.getInputProps('from_name')} />
            <TextInput
              label="Email expeditor"
              placeholder="office@exemplu.ro"
              {...form.getInputProps('from_email')}
            />
          </Group>

          <Group justify="space-between" mt="sm">
            <Button
              variant="default"
              onClick={testConnection}
              loading={testing}
              leftSection={<IconPlugConnected size={17} />}
            >
              Testează conexiunea
            </Button>
            <Button type="submit">Salvează</Button>
          </Group>
        </Stack>
      </form>
    </SectionCard>
  );
}
