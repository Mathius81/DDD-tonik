import { Stack, Tabs } from '@mantine/core';
import {
  IconBuilding,
  IconSpray,
  IconBellRinging,
  IconMail,
  IconBrandWhatsapp,
  IconDatabase,
  IconAdjustments,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import type { Settings } from '../../../shared/schemas/settings';
import { FirmaTab } from './FirmaTab';
import { ServiciiTab } from './ServiciiTab';
import { RemindereTab } from './RemindereTab';
import { EmailTab } from './EmailTab';
import { WhatsappTab } from './WhatsappTab';
import { BackupTab } from './BackupTab';
import { AplicatieTab } from './AplicatieTab';

const tabs = [
  { value: 'firma', label: 'Firmă', icon: IconBuilding },
  { value: 'servicii', label: 'Servicii', icon: IconSpray },
  { value: 'remindere', label: 'Remindere', icon: IconBellRinging },
  { value: 'email', label: 'Email', icon: IconMail },
  { value: 'whatsapp', label: 'WhatsApp', icon: IconBrandWhatsapp },
  { value: 'backup', label: 'Backup', icon: IconDatabase },
  { value: 'aplicatie', label: 'Aplicație', icon: IconAdjustments },
];

export function SetariPage() {
  const { data: settings, reload } = useIpcQuery<Settings>(() => ddd.settings.get(), []);

  if (!settings) return null;

  return (
    <Stack gap="lg">
      <PageHeader
        title="Setări"
        description="Configurează preferințele aplicației Tonik, canalele de comunicare și opțiunile de backup."
      />

      <Tabs defaultValue="firma" variant="pills" radius="md" color="tonik">
        <Tabs.List mb="xl" style={{ gap: 4 }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <Tabs.Tab key={t.value} value={t.value} leftSection={<Icon size={16} stroke={1.7} />}>
                {t.label}
              </Tabs.Tab>
            );
          })}
        </Tabs.List>

        <Tabs.Panel value="firma">
          <FirmaTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="servicii">
          <ServiciiTab />
        </Tabs.Panel>
        <Tabs.Panel value="remindere">
          <RemindereTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="email">
          <EmailTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="whatsapp">
          <WhatsappTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="backup">
          <BackupTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
        <Tabs.Panel value="aplicatie">
          <AplicatieTab settings={settings} onSaved={reload} />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
