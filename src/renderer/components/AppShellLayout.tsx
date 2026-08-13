import { useEffect } from 'react';
import { AppShell, NavLink, Title, Group, Text } from '@mantine/core';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { ddd } from '../api/ddd';

const navItems = [
  { path: '/', label: 'Dashboard', icon: '📊' },
  { path: '/asociatii', label: 'Asociații', icon: '🏢' },
  { path: '/interventii', label: 'Intervenții', icon: '🧰' },
  { path: '/calendar', label: 'Calendar', icon: '📅' },
  { path: '/remindere', label: 'Remindere', icon: '🔔' },
  { path: '/mesaje', label: 'Mesaje', icon: '✉️' },
  { path: '/setari', label: 'Setări', icon: '⚙️' },
];

export function AppShellLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Click pe notificarea Windows → main trimite ruta țintă.
  useEffect(() => {
    return ddd.events.onNavigate((route) => navigate(route));
  }, [navigate]);

  return (
    <AppShell navbar={{ width: 220, breakpoint: 0 }} padding="md">
      <AppShell.Navbar p="xs">
        <Group p="sm" pb="md">
          <Title order={4}>DDD Manager</Title>
        </Group>
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            component={Link}
            to={item.path}
            label={item.label}
            leftSection={<Text>{item.icon}</Text>}
            active={
              item.path === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.path)
            }
          />
        ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
