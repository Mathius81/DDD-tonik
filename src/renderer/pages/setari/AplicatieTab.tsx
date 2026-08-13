import { useState } from 'react';
import { Button, Stack, Group, Switch, Text } from '@mantine/core';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
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
    <Stack maw={520}>
      <Switch
        label="Când închid fereastra, păstrează aplicația activă în tray (lângă ceas)"
        checked={closeToTray}
        onChange={(e) => setCloseToTray(e.currentTarget.checked)}
      />
      <Text size="xs" c="dimmed">
        Recomandat: aplicația poate verifica reminderele și afișa notificări cât timp rulează în
        fundal.
      </Text>
      <Switch
        label="Pornește DDD Manager odată cu Windows"
        checked={launchAtStartup}
        onChange={(e) => setLaunchAtStartup(e.currentTarget.checked)}
      />
      <Group justify="flex-end">
        <Button onClick={save}>Salvează</Button>
      </Group>
    </Stack>
  );
}
