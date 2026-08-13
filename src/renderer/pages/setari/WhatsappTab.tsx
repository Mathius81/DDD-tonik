import { useState } from 'react';
import { TextInput, PasswordInput, Button, Stack, Group, Radio, Text, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import type { Settings } from '../../../shared/schemas/settings';

export function WhatsappTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [token, setToken] = useState('');
  const form = useForm({ initialValues: settings.whatsapp });

  const submit = form.onSubmit(async (values) => {
    if (token) {
      const ok = await runMutation(
        ddd.settings.setSecret({ key: 'whatsapp_access_token', value: token }),
      );
      if (ok === null) return;
      values.has_access_token = true;
    }
    const saved = await runMutation(
      ddd.settings.update({ ...settings, whatsapp: values }),
      'Setările WhatsApp au fost salvate.',
    );
    if (saved) {
      setToken('');
      onSaved();
    }
  });

  const mode = form.values.mode;

  return (
    <form onSubmit={submit}>
      <Stack maw={520}>
        <Radio.Group label="Mod de trimitere WhatsApp" {...form.getInputProps('mode')}>
          <Stack gap="xs" mt="xs">
            <Radio value="assisted" label="Asistat — aplicația pregătește mesajul, tu apeși Send în WhatsApp (recomandat)" />
            <Radio value="cloud_api" label="Automat — prin WhatsApp Business Cloud API" />
            <Radio value="disabled" label="Dezactivat" />
          </Stack>
        </Radio.Group>

        {mode === 'cloud_api' && (
          <>
            <Alert color="yellow" variant="light">
              Necesită cont WhatsApp Business Platform și un template de mesaj aprobat de Meta.
              Confirmările de livrare/citire nu sunt disponibile în acest mod local.
            </Alert>
            <TextInput label="Phone Number ID" {...form.getInputProps('phone_number_id')} />
            <TextInput label="Business Account ID" {...form.getInputProps('business_account_id')} />
            <PasswordInput
              label="Access Token"
              placeholder={settings.whatsapp.has_access_token ? '••••••••  (salvat)' : 'Token de acces'}
              value={token}
              onChange={(e) => setToken(e.currentTarget.value)}
            />
            <Text size="xs" c="dimmed">
              Token-ul este stocat criptat pe acest calculator.
            </Text>
            <Group grow>
              <TextInput label="Template reminder" {...form.getInputProps('template_name')} />
              <TextInput label="Limbă template" {...form.getInputProps('template_language')} />
            </Group>
          </>
        )}

        <Group justify="flex-end">
          <Button type="submit">Salvează</Button>
        </Group>
      </Stack>
    </form>
  );
}
