import { RouterProvider, createHashRouter } from 'react-router-dom';
import { AppShellLayout } from './components/AppShellLayout';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { AsociatiiPage } from './pages/asociatii/AsociatiiPage';
import { AsociatieDetaliiPage } from './pages/asociatii/AsociatieDetaliiPage';
import { InterventiiPage } from './pages/interventii/InterventiiPage';
import { CalendarPage } from './pages/calendar/CalendarPage';
import { ReminderePage } from './pages/remindere/ReminderePage';
import { MesajePage } from './pages/mesaje/MesajePage';
import { SetariPage } from './pages/setari/SetariPage';

const router = createHashRouter([
  {
    path: '/',
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
]);

export function App() {
  return <RouterProvider router={router} />;
}
