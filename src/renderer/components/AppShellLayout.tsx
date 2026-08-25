import { useEffect, useState } from 'react';
import { AppShell, Box, Stack, Text } from '@mantine/core';
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { ddd } from '../api/ddd';
import { unwrap } from '../api/useIpc';
import { TonikLogo } from './TonikLogo';
import { NotificationCenter } from './NotificationCenter';
import { CommandPalette } from './CommandPalette';
import { WorkspaceTabs } from './WorkspaceTabs';
import { InterventionFormModal } from '../pages/interventii/InterventionFormModal';
import {
  WorkspaceProvider,
  useWorkspace,
  workspacePath,
  WORKSPACE_ORDER,
  type WorkspaceNavItem,
} from '../workspace';

/** Înălțimea rândului de spații de lucru din vârful ferestrei. */
const WORKSPACE_TABS_HEIGHT = 40;

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

/** Grupează itemii meniului spațiului curent pe secțiuni consecutive (eyebrow-uri). */
function groupNavSections(
  items: WorkspaceNavItem[],
): Array<{ label: string | null; items: WorkspaceNavItem[] }> {
  const sections: Array<{ label: string | null; items: WorkspaceNavItem[] }> = [];
  for (const item of items) {
    const last = sections[sections.length - 1];
    if (last && last.label === item.section) {
      last.items.push(item);
    } else {
      sections.push({ label: item.section, items: [item] });
    }
  }
  return sections;
}

function AppShellLayoutContent() {
  const location = useLocation();
  const navigate = useNavigate();
  const { workspace, navItems, switchWorkspace } = useWorkspace();
  const [lastBackup, setLastBackup] = useState<BackupInfo | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [interventionOpen, setInterventionOpen] = useState(false);

  // Click pe notificarea Windows → main trimite ruta țintă (poate fi o rută
  // veche fără prefix; router-ul o redirectează la echivalentul din /ddd).
  useEffect(() => {
    return ddd.events.onNavigate((route) => navigate(route));
  }, [navigate]);

  // Scurtături globale: ⌘K paletă, ⌘1..9 paginile spațiului curent,
  // ⌘⇧1/2/3 comutare între spații, ⌘N intervenție nouă (are sens doar în DDD).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        if (workspace === 'ddd') setInterventionOpen(true);
        return;
      }
      const digitMatch = /^Digit([1-9])$/.exec(e.code);
      if (!digitMatch) return;
      const n = Number(digitMatch[1]);
      e.preventDefault();
      if (e.shiftKey) {
        const target = WORKSPACE_ORDER[n - 1];
        if (target) switchWorkspace(target);
      } else {
        const item = navItems[n - 1];
        if (item) navigate(workspacePath(workspace, item));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, workspace, navItems, switchWorkspace]);

  // Stare backup pentru subsolul sidebar-ului (global, indiferent de spațiu).
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
    path === `/${workspace}` ? location.pathname === path : location.pathname.startsWith(path);

  const backupStale = lastBackup ? backupAgeDays(lastBackup.created_at) >= 2 : true;
  const navSections = groupNavSections(navItems);

  return (
    <AppShell header={{ height: WORKSPACE_TABS_HEIGHT }} navbar={{ width: 228, breakpoint: 0 }} padding={0}>
      <AppShell.Header withBorder={false} p={0} style={{ border: 'none' }}>
        <WorkspaceTabs />
      </AppShell.Header>

      <AppShell.Navbar className="tonik-sidebar" p="var(--sp-3)" pt="var(--sp-3)">
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
                const path = workspacePath(workspace, item);
                return (
                  <Link
                    key={item.key}
                    to={path}
                    className="tonik-nav-link"
                    data-active={isActive(path) || undefined}
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
      {workspace === 'ddd' && (
        <InterventionFormModal
          opened={interventionOpen}
          onClose={() => setInterventionOpen(false)}
          onSaved={() => setInterventionOpen(false)}
        />
      )}
    </AppShell>
  );
}

export function AppShellLayout() {
  return (
    <WorkspaceProvider>
      <AppShellLayoutContent />
    </WorkspaceProvider>
  );
}
