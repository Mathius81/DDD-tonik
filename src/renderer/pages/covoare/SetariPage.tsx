/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect } from 'react';
import { Stack, Card, Text, Group, Switch, NumberInput, Button } from '@mantine/core';
import { useForm } from '@mantine/form';
import { PageHeader } from '../../components/PageHeader';
import { ddd } from '../../api/ddd';
import { useIpcQuery, runMutation } from '../../api/useIpc';
import type { CarpetSettings } from '../../../shared/schemas/carpet';

/** Valorile formularului local: NumberInput nu acceptă `null`, deci folosim '' ca gol (la fel ca în OrderFormModal). */
interface FormValues {
  default_price_per_sqm: number | '';
  default_due_days: number | '';
  notify_on_ready: boolean;
  revisit_months: number | '';
}

function toFormValues(s: CarpetSettings): FormValues {
  return {
    default_price_per_sqm: s.default_price_per_sqm ?? '',
    default_due_days: s.default_due_days ?? '',
    notify_on_ready: s.notify_on_ready,
    revisit_months: s.revisit_months ?? '',
  };
}

/**
 * Setările spațiului Covoare — doar ce ține de fluxul spălătoriei: preț/mp și
 * termen implicite (propuse la o comandă nouă) și cele două remindere simple
 * (vezi pagina „Remindere"). Fără facturare, fără câmpuri generice.
 */
export function SetariPage() {
  const { data: settings, reload } = useIpcQuery<CarpetSettings>(() => ddd.carpets.settings.get(), []);

  const form = useForm<FormValues>({
    initialValues: {
      default_price_per_sqm: '',
      default_due_days: '',
      notify_on_ready: true,
      revisit_months: '',
    },
  });

  useEffect(() => {
    if (settings) form.setValues(toFormValues(settings));
  }, [settings]);

  if (!settings) return null;

  const submit = form.onSubmit(async (values) => {
    const saved = await runMutation(
      ddd.carpets.settings.update({
        default_price_per_sqm: typeof values.default_price_per_sqm === 'number' ? values.default_price_per_sqm : null,
        default_due_days: typeof values.default_due_days === 'number' ? values.default_due_days : null,
        notify_on_ready: values.notify_on_ready,
        revisit_months: typeof values.revisit_months === 'number' ? values.revisit_months : null,
      }),
      'Setările au fost salvate.',
    );
    if (saved) reload();
  });

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Setări"
        description="Valori implicite pentru comenzi noi și regulile pentru remindere."
      />

      <form onSubmit={submit}>
        <Stack gap="var(--sp-4)">
          <Card padding="var(--sp-4)">
            <Text fw={600} mb={4}>
              Valori implicite pentru o comandă nouă
            </Text>
            <Text size="sm" c="dimmed" mb="sm">
              Doar propuse la adăugarea unei comenzi — pot fi schimbate oricând acolo. Prețul e
              strict informativ, nu generează factură.
            </Text>
            <Group grow align="flex-start">
              <NumberInput
                label="Preț / mp implicit (opțional)"
                placeholder="ex.: 15"
                suffix=" lei"
                min={0}
                max={100000}
                decimalScale={2}
                {...form.getInputProps('default_price_per_sqm')}
              />
              <NumberInput
                label="Termen implicit (zile de la preluare, opțional)"
                placeholder="ex.: 3"
                suffix=" zile"
                min={1}
                max={365}
                {...form.getInputProps('default_due_days')}
              />
            </Group>
          </Card>

          <Card padding="var(--sp-4)">
            <Group justify="space-between">
              <div>
                <Text fw={600}>Anunță „gata de livrat”</Text>
                <Text size="sm" c="dimmed">
                  Comenzile marcate „Gata de livrat” apar pe pagina Remindere, ca să nu uiți să
                  anunți clientul.
                </Text>
              </div>
              <Switch size="md" {...form.getInputProps('notify_on_ready', { type: 'checkbox' })} />
            </Group>
          </Card>

          <Card padding="var(--sp-4)">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={600}>Reamintire de recontactare</Text>
                <Text size="sm" c="dimmed">
                  Clienții care n-au mai comandat de atâtea luni apar pe pagina Remindere, ca
                  „de recontactat”. Lasă gol ca să o oprești.
                </Text>
              </div>
              <NumberInput
                w={160}
                placeholder="dezactivat"
                suffix=" luni"
                min={1}
                max={60}
                {...form.getInputProps('revisit_months')}
              />
            </Group>
          </Card>

          <Group justify="flex-end">
            <Button type="submit">Salvează setările</Button>
          </Group>
        </Stack>
      </form>
    </Stack>
  );
}
