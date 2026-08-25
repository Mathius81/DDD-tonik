import type { ComponentType } from 'react';
import { RouterProvider, createHashRouter, Navigate, useParams, type RouteObject } from 'react-router-dom';
import { AppShellLayout } from './components/AppShellLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AsociatiiPage } from './pages/asociatii/AsociatiiPage';
import { AsociatieDetaliiPage } from './pages/asociatii/AsociatieDetaliiPage';
import { InterventiiPage } from './pages/interventii/InterventiiPage';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { ReminderePage } from './pages/remindere/ReminderePage';
import { MesajePage } from './pages/mesaje/MesajePage';
import { SetariPage } from './pages/setari/SetariPage';
import { LicenseGate } from './components/LicenseGate';
import { CovoarePlaceholder } from './pages/covoare/CovoarePlaceholder';
import { CovoareDashboardPage } from './pages/covoare/CovoareDashboardPage';
import { ClientiPage } from './pages/covoare/ClientiPage';
import { ComenziPage } from './pages/covoare/ComenziPage';
import { CauciucuriPlaceholder } from './pages/cauciucuri/CauciucuriPlaceholder';
import { CauciucuriDashboardPage } from './pages/cauciucuri/CauciucuriDashboardPage';
import { ClientiPage as CauciucuriClientiPage } from './pages/cauciucuri/ClientiPage';
import { MasiniPage } from './pages/cauciucuri/MasiniPage';
import { DepozitPage } from './pages/cauciucuri/DepozitPage';
import { WORKSPACES, getInitialRoute } from './workspace';

/** La pornire (sau la navigare spre „/”) deschidem ultimul spațiu folosit. */
function RootRedirect() {
  return <Navigate to={getInitialRoute()} replace />;
}

/** Rută veche fără prefix pentru o asociație (ex. click pe notificare) → /ddd/asociatii/:id. */
function LegacyAsociatieRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/ddd/asociatii/${id}`} replace />;
}

/**
 * Rutele-placeholder ale unui spațiu nou, generate din meniul lui (workspace.tsx).
 * `excludePaths` omite intrările deja înlocuite cu pagini reale (ex.: Covoare → Clienți/Comenzi).
 */
function placeholderChildren(
  workspaceId: 'covoare' | 'cauciucuri',
  Placeholder: ComponentType<{ title: string }>,
  excludePaths: string[] = [],
): RouteObject[] {
  return WORKSPACES[workspaceId].navItems
    .filter((item) => !excludePaths.includes(item.path))
    .map((item) =>
      item.path
        ? { path: item.path, element: <Placeholder title={item.label} /> }
        : { index: true, element: <Placeholder title={item.label} /> },
    );
}

const router = createHashRouter([
  { path: '/', element: <RootRedirect /> },
  {
    path: '/ddd',
    element: <AppShellLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'asociatii', element: <AsociatiiPage /> },
      { path: 'asociatii/:id', element: <AsociatieDetaliiPage /> },
      { path: 'interventii', element: <InterventiiPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'remindere', element: <ReminderePage /> },
      { path: 'mesaje', element: <MesajePage /> },
      { path: 'setari', element: <SetariPage /> },
    ],
  },
  {
    path: '/covoare',
    element: <AppShellLayout />,
    children: [
      { index: true, element: <CovoareDashboardPage /> },
      { path: 'clienti', element: <ClientiPage /> },
      { path: 'comenzi', element: <ComenziPage /> },
      ...placeholderChildren('covoare', CovoarePlaceholder, ['', 'clienti', 'comenzi']),
    ],
  },
  {
    path: '/cauciucuri',
    element: <AppShellLayout />,
    children: [
      { index: true, element: <CauciucuriDashboardPage /> },
      { path: 'clienti', element: <CauciucuriClientiPage /> },
      { path: 'masini', element: <MasiniPage /> },
      { path: 'depozit', element: <DepozitPage /> },
      ...placeholderChildren('cauciucuri', CauciucuriPlaceholder, ['', 'clienti', 'masini', 'depozit']),
    ],
  },
  // Rute vechi fără prefix de spațiu — main trimite astfel de căi din notificări
  // (events:navigate) și din meniul OS; le redirectăm la echivalentul din /ddd.
  { path: '/asociatii', element: <Navigate to="/ddd/asociatii" replace /> },
  { path: '/asociatii/:id', element: <LegacyAsociatieRedirect /> },
  { path: '/interventii', element: <Navigate to="/ddd/interventii" replace /> },
  { path: '/calendar', element: <Navigate to="/ddd/calendar" replace /> },
  { path: '/remindere', element: <Navigate to="/ddd/remindere" replace /> },
  { path: '/mesaje', element: <Navigate to="/ddd/mesaje" replace /> },
  { path: '/setari', element: <Navigate to="/ddd/setari" replace /> },
  { path: '*', element: <RootRedirect /> },
]);

export function App() {
  return (
    <LicenseGate>
      <RouterProvider router={router} />
    </LicenseGate>
  );
}
