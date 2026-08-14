import { useState } from 'react';
import {
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Group,
  Radio,
  Alert,
  Badge,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBrandWhatsapp, IconInfoCircle } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';

const modeLabels: Record<string, string> = {
  assisted: 'Asistat',
  cloud_api: 'Automat (Cloud API)',
  disabled: 'Dezactivat',
};

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
    <SectionCard
      maw={640}
      title="Configurare WhatsApp"
      description="Alege cum trimiți mesajele WhatsApp către clienți."
      icon={<IconBrandWhatsapp size={21} stroke={1.7} />}
      titleRight={
        <Badge color={mode === 'disabled' ? 'gray' : 'teal'} variant="light">
          {modeLabels[settings.whatsapp.mode]}
        </Badge>
      }
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Radio.Group {...form.getInputProps('mode')}>
            <Stack gap="sm" mt={4}>
              <Radio
                value="assisted"
                label="Asistat (recomandat, gratuit)"
                description="Aplicația pregătește mesajul și deschide WhatsApp — tu doar apeși Send."
              />
              <Radio
                value="cloud_api"
                label="Automat — WhatsApp Business Cloud API"
                description="Mesajele pleacă automat, fără intervenția ta. Necesită cont Meta Business."
              />
              <Radio value="disabled" label="Dezactivat" description="Nu se trimit mesaje WhatsApp." />
            </Stack>
          </Radio.Group>

          {mode === 'cloud_api' && (
            <>
              <Divider my={4} />
              <Alert color="yellow" variant="light" icon={<IconInfoCircle size={17} />}>
                Necesită cont WhatsApp Business Platform și un template de mesaj aprobat de Meta.
                Confirmările de livrare/citire nu sunt disponibile în acest mod local.
              </Alert>
              <Group grow align="flex-start">
                <TextInput label="Phone Number ID" {...form.getInputProps('phone_number_id')} />
                <TextInput
                  label="Business Account ID"
                  {...form.getInputProps('business_account_id')}
                />
              </Group>
              <PasswordInput
                label="Access Token"
                placeholder={
                  settings.whatsapp.has_access_token ? '••••••••  (salvat)' : 'Token de acces'
                }
                description="Stocat criptat pe acest calculator"
                value={token}
                onChange={(e) => setToken(e.currentTarget.value)}
              />
              <Group grow align="flex-start">
                <TextInput label="Template reminder" {...form.getInputProps('template_name')} />
                <TextInput label="Limbă template" {...form.getInputProps('template_language')} />
              </Group>
            </>
          )}

          <Group justify="flex-end" mt="sm">
            <Button type="submit">Salvează</Button>
          </Group>
        </Stack>
      </form>
    </SectionCard>
  );
}
