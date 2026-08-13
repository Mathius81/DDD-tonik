import { TextInput, Button, Stack, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconBuilding } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';

export function FirmaTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const form = useForm({ initialValues: settings.company });

  const submit = form.onSubmit(async (values) => {
    const saved = await runMutation(
      ddd.settings.update({ ...settings, company: values }),
      'Datele firmei au fost salvate.',
    );
    if (saved) onSaved();
  });

  return (
    <SectionCard
      title="Datele firmei"
      description="Aceste informații apar automat în mesajele trimise clienților (nume, telefon de contact)."
      icon={<IconBuilding size={21} stroke={1.7} />}
      maw={640}
    >
      <form onSubmit={submit}>
        <Stack gap="md">
          <Group grow align="flex-start">
            <TextInput label="Denumire firmă" placeholder="Tonik SRL" {...form.getInputProps('name')} />
            <TextInput label="CUI" placeholder="RO12345678" {...form.getInputProps('tax_id')} />
          </Group>
          <TextInput label="Adresă" {...form.getInputProps('address')} />
          <Group grow align="flex-start">
            <TextInput label="Telefon" placeholder="07xx xxx xxx" {...form.getInputProps('phone')} />
            <TextInput label="Email" placeholder="office@exemplu.ro" {...form.getInputProps('email')} />
          </Group>
          <TextInput label="Website" placeholder="https://" {...form.getInputProps('website')} />
          <Group justify="flex-end" mt="sm">
            <Button type="submit">Salvează</Button>
          </Group>
        </Stack>
      </form>
    </SectionCard>
  );
}
