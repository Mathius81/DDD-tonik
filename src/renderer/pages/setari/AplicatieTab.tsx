/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useRef, useState } from 'react';
import { Button, Stack, Group, Switch, SegmentedControl, Text } from '@mantine/core';
import { IconAdjustments, IconInfoCircle } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, useIpcQuery } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import { SECRET_MENU_EVENT, SECRET_MENU_CANCELLED_EVENT } from '../../components/SemnaturaAutor';
import {
  applyAppearance,
  getThemePref,
  getDensityPref,
  type ThemePref,
  type DensityPref,
} from '../../appearance';
import type { Settings } from '../../../shared/schemas/settings';
import type { AboutInfo } from '../../../shared/schemas/about';
import { APP_NAME, AUTHOR_NAME, AUTHORSHIP_LINE, COPYRIGHT_YEAR } from '../../../shared/authorship';

/**
 * Contorul de click-uri pentru meniul secret al autorului.
 *
 * 10 click-uri consecutive (pe numele autorului sau pe numărul de versiune,
 * din ecranul „Despre”) deschid panoul ascuns — la fel ca „Ai devenit
 * dezvoltator” din Android. Fără niciun efect vizibil la primele click-uri,
 * ca să nu poată fi descoperit din greșeală; de la al 7-lea click apare un
 * indiciu discret, doar ca semn că se întâmplă ceva.
 */
const CLICKURI_NECESARE = 10;
const INDICIU_DE_LA_CLICK = 7;
const RESET_MS = 2000;

function useContorSecret() {
  const [indiciu, setIndiciu] = useState<string | null>(null);
  const numarClickuri = useRef(0);
  const ultimulClick = useRef(0);

  // Dacă utilizatorul închide poarta cu parolă fără să o completeze corect,
  // contorul se resetează — trebuie iar cele 10 click-uri de la zero.
  useEffect(() => {
    const reseteaza = () => {
      numarClickuri.current = 0;
      setIndiciu(null);
    };
    window.addEventListener(SECRET_MENU_CANCELLED_EVENT, reseteaza);
    return () => window.removeEventListener(SECRET_MENU_CANCELLED_EVENT, reseteaza);
  }, []);

  const inregistreazaClick = () => {
    const acum = Date.now();
    if (acum - ultimulClick.current > RESET_MS) {
      numarClickuri.current = 0;
    }
    ultimulClick.current = acum;
    numarClickuri.current += 1;

    if (numarClickuri.current >= CLICKURI_NECESARE) {
      numarClickuri.current = 0;
      setIndiciu(null);
      window.dispatchEvent(new CustomEvent(SECRET_MENU_EVENT));
      return;
    }

    if (numarClickuri.current >= INDICIU_DE_LA_CLICK) {
      const ramase = CLICKURI_NECESARE - numarClickuri.current;
      setIndiciu(`încă ${ramase}...`);
    } else {
      setIndiciu(null);
    }
  };

  return { indiciu, inregistreazaClick };
}

export function AplicatieTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [closeToTray, setCloseToTray] = useState(settings.app.close_to_tray);
  const [launchAtStartup, setLaunchAtStartup] = useState(settings.app.launch_at_startup);
  const [themePref, setThemePref] = useState<ThemePref>(getThemePref());
  const [densityPref, setDensityPref] = useState<DensityPref>(getDensityPref());

  const { data: about } = useIpcQuery<AboutInfo>(() => ddd.about.get(), []);
  const { indiciu, inregistreazaClick } = useContorSecret();

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
    <Stack gap="var(--sp-5)">
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

      <SectionCard
        maw={640}
        title="Despre"
        description="Ce este Tonik și cine a scris-o."
        icon={<IconInfoCircle size={21} stroke={1.7} />}
      >
        <Stack gap={6}>
          <Text size="var(--fs-small)" c="dimmed">
            Aplicație
          </Text>
          <Text fw={600}>{APP_NAME}</Text>

          <Text size="var(--fs-small)" c="dimmed" mt={10}>
            Autor
          </Text>
          <Text fw={600} onClick={inregistreazaClick} style={{ userSelect: 'none' }}>
            {AUTHOR_NAME}
          </Text>

          <Text size="var(--fs-small)" c="dimmed" mt={10}>
            Versiune
          </Text>
          <Text fw={600} onClick={inregistreazaClick} style={{ userSelect: 'none' }}>
            {about ? `v${about.version}` : '—'}
          </Text>

          <Text size="var(--fs-small)" c="dimmed" mt={10}>
            {COPYRIGHT_YEAR}
          </Text>
          <Text size="var(--fs-small)" c="dimmed">
            {AUTHORSHIP_LINE}
          </Text>

          <Text size="var(--fs-micro)" c="dimmed" mt={indiciu ? 4 : 0} h={16}>
            {indiciu ?? ''}
          </Text>
        </Stack>
      </SectionCard>
    </Stack>
  );
}
