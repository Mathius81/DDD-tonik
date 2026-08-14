import { useState } from 'react';
import { Stack, UnstyledButton, Group } from '@mantine/core';
import {
  IconBuilding,
  IconSpray,
  IconBellRinging,
  IconMail,
  IconBrandWhatsapp,
  IconDatabase,
  IconAdjustments,
  IconSunrise,
  IconCertificate,
} from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { useIpcQuery } from '../../api/useIpc';
import { PageHeader } from '../../components/PageHeader';
import type { Settings } from '../../../shared/schemas/settings';
import { FirmaTab } from './FirmaTab';
import { ServiciiTab } from './ServiciiTab';
import { RemindereTab } from './RemindereTab';
import { EmailTab } from './EmailTab';
import { RaportZilnicTab } from './RaportZilnicTab';
import { LicentaTab } from './LicentaTab';
import { WhatsappTab } from './WhatsappTab';
import { BackupTab } from './BackupTab';
import { AplicatieTab } from './AplicatieTab';

const sections = [
  { value: 'firma', label: 'Firmă', icon: IconBuilding },
  { value: 'servicii', label: 'Servicii', icon: IconSpray },
  { value: 'remindere', label: 'Remindere', icon: IconBellRinging },
  { value: 'email', label: 'Email', icon: IconMail },
  { value: 'raport', label: 'Raport zilnic', icon: IconSunrise },
  { value: 'whatsapp', label: 'WhatsApp', icon: IconBrandWhatsapp },
  { value: 'backup', label: 'Backup', icon: IconDatabase },
  { value: 'aplicatie', label: 'Aplicație', icon: IconAdjustments },
  { value: 'licenta', label: 'Licență', icon: IconCertificate },
];

const LAST_TAB_KEY = 'tonik.settings.lastTab';

export function SetariPage() {
  const { data: settings, reload } = useIpcQuery<Settings>(() => ddd.settings.get(), []);
  const [active, setActive] = useState(
    () => localStorage.getItem(LAST_TAB_KEY) ?? 'firma',
  );

  if (!settings) return null;

  const select = (value: string) => {
    setActive(value);
    localStorage.setItem(LAST_TAB_KEY, value);
  };

  return (
    <Stack gap="var(--sp-4)">
      <PageHeader
        title="Setări"
        description="Configurează preferințele aplicației Tonik, canalele de comunicare și opțiunile de backup."
      />

      <Group align="flex-start" gap="var(--sp-5)" wrap="nowrap">
        {/* Sub-nav vertical (Brief §5.8) */}
        <Stack gap={2} w={180} style={{ flexShrink: 0 }}>
          {sections.map((s) => {
            const Icon = s.icon;
            const isActive = active === s.value;
            return (
              <UnstyledButton
                key={s.value}
                onClick={() => select(s.value)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--fs-body)',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                }}
              >
                <Icon size={15} stroke={1.8} />
                {s.label}
              </UnstyledButton>
            );
          })}
        </Stack>

        <div style={{ flex: 1, minWidth: 0 }}>
          {active === 'firma' && <FirmaTab settings={settings} onSaved={reload} />}
          {active === 'servicii' && <ServiciiTab />}
          {active === 'remindere' && <RemindereTab settings={settings} onSaved={reload} />}
          {active === 'email' && <EmailTab settings={settings} onSaved={reload} />}
          {active === 'raport' && (
            <RaportZilnicTab settings={settings} onSaved={reload} goToEmail={() => select('email')} />
          )}
          {active === 'whatsapp' && <WhatsappTab settings={settings} onSaved={reload} />}
          {active === 'backup' && <BackupTab settings={settings} onSaved={reload} />}
          {active === 'aplicatie' && <AplicatieTab settings={settings} onSaved={reload} />}
          {active === 'licenta' && <LicentaTab />}
        </div>
      </Group>
    </Stack>
  );
}
