import { useState } from 'react';
import { Button, Stack, Group, Switch } from '@mantine/core';
import { IconAdjustments } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';

export function AplicatieTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [closeToTray, setCloseToTray] = useState(settings.app.close_to_tray);
  const [launchAtStartup, setLaunchAtStartup] = useState(settings.app.launch_at_startup);

  const save = async () => {
    const saved = await runMutation(
      ddd.settings.update({
        ...settings,
        app: { close_to_tray: closeToTray, launch_at_startup: launchAtStartup },
      }),
      'Setările aplicației au fost salvate.',
    );
    if (saved) onSaved();
  };

  return (
    <SectionCard
      title="Comportamentul aplicației"
      description="Cum pornește și cum rămâne activă aplicația Tonik."
      icon={<IconAdjustments size={21} stroke={1.7} />}
    >
      <Stack gap="md">
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
        <Group justify="flex-end" mt="sm">
          <Button onClick={save}>Salvează</Button>
        </Group>
      </Stack>
    </SectionCard>
  );
}
