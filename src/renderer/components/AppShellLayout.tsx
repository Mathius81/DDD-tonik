import { useEffect, useState } from 'react';
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
import { unwrap } from '../api/useIpc';
import { TonikLogo } from './TonikLogo';
import { NotificationCenter } from './NotificationCenter';
import { CommandPalette } from './CommandPalette';
import { InterventionFormModal } from '../pages/interventii/InterventionFormModal';

const pageOrder = ['/', '/asociatii', '/interventii', '/calendar', '/remindere', '/mesaje', '/setari'];

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

interface BackupInfo {
  name: string;
  created_at: string;
}

/** „acum 2 h” / „acum 3 zile” pentru subsolul sidebar-ului. */
function relativeTime(iso: string): string {
  const then = new Date(iso.replace(' ', 'T'));
  const mins = Math.max(0, Math.round((Date.now() - then.getTime()) / 60000));
  if (mins < 60) return `acum ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `acum ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'ieri' : `acum ${days} ${days < 20 ? 'zile' : 'de zile'}`;
}

function backupAgeDays(iso: string): number {
  const then = new Date(iso.replace(' ', 'T'));
  return Math.floor((Date.now() - then.getTime()) / 86_400_000);
}

export function AppShellLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [lastBackup, setLastBackup] = useState<BackupInfo | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);

  // Click pe notificarea Windows → main trimite ruta țintă.
  useEffect(() => {
    return ddd.events.onNavigate((route) => navigate(route));
  }, [navigate]);

  // Scurtături globale (Brief §7.2): ⌘K paletă, ⌘1..7 pagini, ⌘N intervenție.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === 'n') {
        e.preventDefault();
        setInterventionOpen(true);
      } else if (e.key >= '1' && e.key <= '7') {
        e.preventDefault();
        navigate(pageOrder[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  // Stare backup pentru subsolul sidebar-ului.
  useEffect(() => {
    const load = () =>
      unwrap<BackupInfo[]>(ddd.backup.list())
        .then((list) => setLastBackup(list[0] ?? null))
        .catch(() => undefined);
    load();
    const timer = setInterval(load, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const backupStale = lastBackup ? backupAgeDays(lastBackup.created_at) >= 2 : true;

  return (
    <AppShell navbar={{ width: 228, breakpoint: 0 }} padding={0}>
      <AppShell.Navbar className="tonik-sidebar" p="var(--sp-3)" pt={0}>
        {/* Zonă de drag pentru fereastră (titlebar integrat) */}
        <div className="tonik-drag-region" />

        <Box px={6} pb={16} style={{ display: 'flex', justifyContent: 'center' }}>
          <TonikLogo />
        </Box>

        <Box pb={16} mb={16} className="tonik-sidebar-divider">
          <NotificationCenter />
        </Box>

        <Stack gap={14} style={{ flex: 1, overflowY: 'auto' }}>
          {navSections.map((section, i) => (
            <div key={i}>
              {section.label && <div className="tonik-nav-eyebrow">{section.label}</div>}
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
                      <Icon size={16} stroke={1.8} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </Stack>

        <div className="tonik-sidebar-footer">
          <Text
            size="var(--fs-small)"
            c={backupStale ? 'var(--warning)' : 'var(--text-on-dark-muted)'}
            lh={1.4}
          >
            {lastBackup
              ? `Ultimul backup: ${relativeTime(lastBackup.created_at)}`
              : 'Niciun backup încă'}
          </Text>
          <Text size="var(--fs-small)" c="var(--text-on-dark-muted)" opacity={0.7} lh={1.6}>
            Tonik · v1.0
          </Text>
        </div>
      </AppShell.Navbar>

      <AppShell.Main style={{ backgroundColor: 'var(--bg-app)' }}>
        <div className="tonik-content">
          <Outlet />
        </div>
      </AppShell.Main>

      <CommandPalette
        opened={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAddIntervention={() => setInterventionOpen(true)}
      />
      <InterventionFormModal
        opened={interventionOpen}
        onClose={() => setInterventionOpen(false)}
        onSaved={() => setInterventionOpen(false)}
      />
    </AppShell>
  );
}
