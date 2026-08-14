import { useState } from 'react';
import { Button, Stack, Group, Switch, SegmentedControl, Text } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import {
  applyAppearance,
  getThemePref,
  getDensityPref,
  type ThemePref,
  type DensityPref,
} from '../../appearance';
import type { Settings } from '../../../shared/schemas/settings';

export function AplicatieTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [closeToTray, setCloseToTray] = useState(settings.app.close_to_tray);
  const [launchAtStartup, setLaunchAtStartup] = useState(settings.app.launch_at_startup);
  const [themePref, setThemePref] = useState<ThemePref>(getThemePref());
  const [densityPref, setDensityPref] = useState<DensityPref>(getDensityPref());

  const applyTheme = (t: ThemePref) => {
    setThemePref(t);
    const resolved = applyAppearance(t, densityPref);
    window.dispatchEvent(new CustomEvent('tonik-theme-changed', { detail: resolved }));
  };

  const applyDensity = (d: DensityPref) => {
    setDensityPref(d);
    applyAppearance(themePref, d);
  };

  const save = async () => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        app: { close_to_tray: closeToTray, launch_at_startup: launchAtStartup },
      }),
      'Salvat.',
    );
    if (saved) onSaved();
  };

  return (
    <SectionCard
      maw={640}
      title="Comportamentul aplicației"
      description="Aspect, densitate și modul în care pornește aplicația Tonik."
      icon={<IconAdjustments size={21} stroke={1.7} />}
    >
      <Stack gap="var(--sp-4)">
        <div>
          <Text size="var(--fs-small)" fw={550} mb={4}>
            Temă
          </Text>
          <SegmentedControl
            value={themePref}
            onChange={(v) => applyTheme(v as ThemePref)}
            data={[
              { value: 'system', label: 'Sistem' },
              { value: 'light', label: 'Deschisă' },
              { value: 'dark', label: 'Închisă' },
            ]}
          />
        </div>
        <div>
          <Text size="var(--fs-small)" fw={550} mb={4}>
            Densitate
          </Text>
          <SegmentedControl
            value={densityPref}
            onChange={(v) => applyDensity(v as DensityPref)}
            data={[
              { value: 'compact', label: 'Compact' },
              { value: 'comfortable', label: 'Confortabil' },
            ]}
          />
        </div>
        <Switch
          label="Când închid fereastra, păstrează aplicația activă în tray (lângă ceas)"
          description="Recomandat — aplicația poate verifica reminderele și afișa notificări în fundal."
          checked={closeToTray}
          onChange={(e) => setCloseToTray(e.currentTarget.checked)}
        />
        <Switch
          label="Pornește Tonik odată cu Windows"
          checked={launchAtStartup}
          onChange={(e) => setLaunchAtStartup(e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button onClick={save}>Salvează</Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
