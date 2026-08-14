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

  /** Salvează setările + parola (dacă a fost introdusă). Returnează true la succes. */
  const persist = async (values: typeof form.values, successMessage?: string): Promise<boolean> => {
    // Parola merge separat, criptată cu safeStorage; nu se salvează în setări.
    if (password) {
      const ok = await runMutation(ddd.settings.setSecret({ key: 'smtp_password', value: password }));
      if (ok === null) return false;
      values.has_password = true;
    }
    const saved = await runMutation(
      ddd.settings.update({ ...settings, smtp: values }),
      successMessage,
    );
    if (saved) {
      setPassword('');
      onSaved();
    }
    return !!saved;
  };

  const submit = form.onSubmit(async (values) => {
    await persist(values, 'Salvat.');
  });

  // Testul salvează întâi ce e în formular — altfel ar testa setările vechi.
  const testConnection = async () => {
    setTesting(true);
    const ok = await persist(form.values);
    if (!ok) {
      setTesting(false);
      return;
    }
    const result = await runMutation<{ ok: boolean }>(ddd.settings.testSmtp());
    setTesting(false);
    if (result) {
      notifications.show({ color: 'teal', message: 'Conexiunea SMTP funcționează.' });
    }
  };

  return (
    <SectionCard
      maw={640}
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
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Group grow align="flex-start">
            <TextInput
              label="Server SMTP"
              placeholder="ex.: smtp.exemplu.ro"
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
            <TextInput label="Utilizator" placeholder="ex.: nume@exemplu.ro" {...form.getInputProps('username')} />
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
            <TextInput label="Nume expeditor" placeholder="ex.: Tonik SRL" {...form.getInputProps('from_name')} />
            <TextInput
              label="Email expeditor"
              placeholder="ex.: office@exemplu.ro"
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
