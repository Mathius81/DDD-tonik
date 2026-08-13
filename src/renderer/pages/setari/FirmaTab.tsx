import { TextInput, Button, Stack, Group } from '@mantine/core';
import { useForm } from '@mantine/form';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
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
    <form onSubmit={submit}>
      <Stack maw={520}>
        <TextInput label="Denumire firmă" {...form.getInputProps('name')} />
        <TextInput label="CUI" {...form.getInputProps('tax_id')} />
        <TextInput label="Adresă" {...form.getInputProps('address')} />
        <Group grow>
          <TextInput label="Telefon" {...form.getInputProps('phone')} />
          <TextInput label="Email" {...form.getInputProps('email')} />
        </Group>
        <TextInput label="Website" {...form.getInputProps('website')} />
        <Group justify="flex-end">
          <Button type="submit">Salvează</Button>
        </Group>
      </Stack>
    </form>
  );
}
