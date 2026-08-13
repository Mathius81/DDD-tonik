import { useEffect } from 'react';
import { AppShell, Box, Stack, Text } from '@mantine/core';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconSpray,
  IconCalendarEvent,
  IconBellRinging,
  IconMailForward,
  IconSettings,
} from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { TonikLogo } from './TonikLogo';

const navSections: Array<{
  label: string | null;
  items: Array<{ path: string; label: string; icon: typeof IconLayoutDashboard }>;
}> = [
  {
    label: null,
    items: [{ path: '/', label: 'Dashboard', icon: IconLayoutDashboard }],
  },
  {
    label: 'Operațiuni',
    items: [
      { path: '/asociatii', label: 'Asociații', icon: IconBuildingCommunity },
      { path: '/interventii', label: 'Intervenții', icon: IconSpray },
      { path: '/calendar', label: 'Calendar', icon: IconCalendarEvent },
    ],
  },
  {
    label: 'Comunicare',
    items: [
      { path: '/remindere', label: 'Remindere', icon: IconBellRinging },
      { path: '/mesaje', label: 'Mesaje', icon: IconMailForward },
    ],
  },
  {
    label: 'Sistem',
    items: [{ path: '/setari', label: 'Setări', icon: IconSettings }],
  },
];

export function AppShellLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  // Click pe notificarea Windows → main trimite ruta țintă.
  useEffect(() => {
    return ddd.events.onNavigate((route) => navigate(route));
  }, [navigate]);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <AppShell navbar={{ width: 248, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar className="tonik-sidebar" p="md">
        <Box px="xs" pt={6} pb={22}>
          <TonikLogo />
        </Box>

        <Stack gap={18} style={{ flex: 1 }}>
          {navSections.map((section, i) => (
            <div key={i}>
              {section.label && (
                <Text
                  size="10px"
                  fw={600}
                  tt="uppercase"
                  c="#546863"
                  px={12}
                  pb={6}
                  style={{ letterSpacing: '0.09em' }}
                >
                  {section.label}
                </Text>
              )}
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className="tonik-nav-link"
                    data-active={isActive(item.path) || undefined}
                  >
                    <span className="tonik-nav-icon">
                      <Icon size={19} stroke={1.7} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </Stack>

        <Text size="xs" c="#546863" px={12} pb={4}>
          Tonik · v1.0
        </Text>
      </AppShell.Navbar>

      <AppShell.Main style={{ backgroundColor: 'var(--mantine-color-gray-0)' }}>
        <Box p="xl" maw={1240} mx="auto">
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
