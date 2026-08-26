/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import 'mantine-datatable/styles.css';
import './styles.css';
import { MantineProvider } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import dayjs from 'dayjs';
import 'dayjs/locale/ro';
import { App } from './App';
import { SemnaturaAutor } from './components/SemnaturaAutor';
import { theme } from './theme';
import { applyAppearance, watchSystemTheme } from './appearance';

dayjs.locale('ro');

function Root() {
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>(() => applyAppearance());

  useEffect(() => watchSystemTheme(setColorScheme), []);

  // Toast-urile de temă/densitate din Setări schimbă atributele pe <html>;
  // ascultăm evenimentul custom ca Mantine să comute și el schema.
  useEffect(() => {
    const listener = (e: Event) =>
      setColorScheme((e as CustomEvent<'light' | 'dark'>).detail);
    window.addEventListener('tonik-theme-changed', listener);
    return () => window.removeEventListener('tonik-theme-changed', listener);
  }, []);

  return (
    <MantineProvider theme={theme} forceColorScheme={colorScheme}>
      <DatesProvider settings={{ locale: 'ro', firstDayOfWeek: 1 }}>
        <ModalsProvider>
          <Notifications position="bottom-right" autoClose={4000} />
          <App />
          {/* Semnătura autorului — se deschide cu secvența secretă (vezi componenta). */}
          <SemnaturaAutor />
        </ModalsProvider>
      </DatesProvider>
    </MantineProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
