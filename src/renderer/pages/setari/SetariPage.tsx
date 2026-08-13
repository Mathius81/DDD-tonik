import { Title, Stack, Tabs } from '@mantine/core';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import type { Settings } from '../../../shared/schemas/settings';
import { FirmaTab } from './FirmaTab';
import { ServiciiTab } from './ServiciiTab';
import { RemindereTab } from './RemindereTab';
import { EmailTab } from './EmailTab';
import { WhatsappTab } from './WhatsappTab';
import { BackupTab } from './BackupTab';
import { AplicatieTab } from './AplicatieTab';

export function SetariPage() {
  const { data: settings, reload } = useIpcQuery<Settings>(() => ddd.settings.get(), []);

  if (!settings) return null;

  return (
    <Stack>
      <Title order={2}>Setări</Title>
      <Tabs defaultValue="firma">
        <Tabs.List>
          <Tabs.Tab value="firma">Firmă</Tabs.Tab>
          <Tabs.Tab value="servicii">Servicii</Tabs.Tab>
          <Tabs.Tab value="remindere">Remindere</Tabs.Tab>
          <Tabs.Tab value="email">Email</Tabs.Tab>
          <Tabs.Tab value="whatsapp">WhatsApp</Tabs.Tab>
          <Tabs.Tab value="backup">Backup</Tabs.Tab>
          <Tabs.Tab value="aplicatie">Aplicație</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="firma" pt="md">
          <FirmaTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="servicii" pt="md">
          <ServiciiTab />
        </Tabs.Panel>
        <Tabs.Panel value="remindere" pt="md">
          <RemindereTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="email" pt="md">
          <EmailTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="whatsapp" pt="md">
          <WhatsappTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="backup" pt="md">
          <BackupTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="aplicatie" pt="md">
          <AplicatieTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
