/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconLayoutDashboard,
  IconBuildingCommunity,
  IconSpray,
  IconCalendarEvent,
  IconBellRinging,
  IconMailForward,
  IconSettings,
  IconUsers,
  IconClipboardList,
  IconCar,
  IconClockHour4,
  IconBuildingWarehouse,
} from '@tabler/icons-react';

/**
 * Spații de lucru — fiecare este un sistem complet separat: alt meniu, alte
 * date, alt dashboard. Utilizatorul nu vede niciodată date dintr-un spațiu
 * în altul (Brief: comutator de spații de lucru).
 */
export type WorkspaceId = 'ddd' | 'covoare' | 'cauciucuri';

/** Ordinea în care apar tab-urile în bara de sus și în scurtăturile ⌘⇧1/2/3. */
export const WORKSPACE_ORDER: WorkspaceId[] = ['ddd', 'covoare', 'cauciucuri'];

function isWorkspaceId(value: string): value is WorkspaceId {
  return value === 'ddd' || value === 'covoare' || value === 'cauciucuri';
}

export interface WorkspaceNavItem {
  /** Cheie stabilă (folosită și ca segment de React key). */
  key: string;
  /** Segment de rută relativ la rădăcina spațiului ('' pentru pagina index). */
  path: string;
  label: string;
  icon: typeof IconLayoutDashboard;
  /** Eyebrow de secțiune în sidebar; null = fără grupare (Dashboard). */
  section: string | null;
}

export interface WorkspaceMeta {
  id: WorkspaceId;
  label: string;
  navItems: WorkspaceNavItem[];
}

const dddNav: WorkspaceNavItem[] = [
  { key: 'dashboard', path: '', label: 'Dashboard', icon: IconLayoutDashboard, section: null },
  {
    key: 'asociatii',
    path: 'asociatii',
    label: 'Asociații',
    icon: IconBuildingCommunity,
    section: 'Operațiuni',
  },
  {
    key: 'interventii',
    path: 'interventii',
    label: 'Intervenții',
    icon: IconSpray,
    section: 'Operațiuni',
  },
  {
    key: 'calendar',
    path: 'calendar',
    label: 'Calendar',
    icon: IconCalendarEvent,
    section: 'Operațiuni',
  },
  {
    key: 'remindere',
    path: 'remindere',
    label: 'Remindere',
    icon: IconBellRinging,
    section: 'Comunicare',
  },
  { key: 'mesaje', path: 'mesaje', label: 'Mesaje', icon: IconMailForward, section: 'Comunicare' },
  { key: 'setari', path: 'setari', label: 'Setări', icon: IconSettings, section: 'Sistem' },
];

const covoareNav: WorkspaceNavItem[] = [
  { key: 'dashboard', path: '', label: 'Dashboard', icon: IconLayoutDashboard, section: null },
  { key: 'clienti', path: 'clienti', label: 'Clienți', icon: IconUsers, section: 'Operațiuni' },
  {
    key: 'comenzi',
    path: 'comenzi',
    label: 'Comenzi',
    icon: IconClipboardList,
    section: 'Operațiuni',
  },
  {
    key: 'calendar',
    path: 'calendar',
    label: 'Calendar',
    icon: IconCalendarEvent,
    section: 'Operațiuni',
  },
  {
    key: 'remindere',
    path: 'remindere',
    label: 'Remindere',
    icon: IconBellRinging,
    section: 'Comunicare',
  },
  { key: 'mesaje', path: 'mesaje', label: 'Mesaje', icon: IconMailForward, section: 'Comunicare' },
  { key: 'setari', path: 'setari', label: 'Setări', icon: IconSettings, section: 'Sistem' },
];

const cauciucuriNav: WorkspaceNavItem[] = [
  { key: 'dashboard', path: '', label: 'Dashboard', icon: IconLayoutDashboard, section: null },
  { key: 'clienti', path: 'clienti', label: 'Clienți', icon: IconUsers, section: 'Operațiuni' },
  { key: 'masini', path: 'masini', label: 'Mașini', icon: IconCar, section: 'Operațiuni' },
  {
    key: 'programari',
    path: 'programari',
    label: 'Programări',
    icon: IconClockHour4,
    section: 'Operațiuni',
  },
  {
    key: 'hotel',
    path: 'hotel',
    label: 'Hotel cauciucuri',
    icon: IconBuildingWarehouse,
    section: 'Operațiuni',
  },
  {
    key: 'remindere',
    path: 'remindere',
    label: 'Remindere',
    icon: IconBellRinging,
    section: 'Comunicare',
  },
  { key: 'mesaje', path: 'mesaje', label: 'Mesaje', icon: IconMailForward, section: 'Comunicare' },
  { key: 'setari', path: 'setari', label: 'Setări', icon: IconSettings, section: 'Sistem' },
];

export const WORKSPACES: Record<WorkspaceId, WorkspaceMeta> = {
  ddd: { id: 'ddd', label: 'DDD', navItems: dddNav },
  covoare: { id: 'covoare', label: 'Covoare', navItems: covoareNav },
  cauciucuri: { id: 'cauciucuri', label: 'Cauciucuri', navItems: cauciucuriNav },
};

/** Calea completă (cu prefix de spațiu) pentru un item din meniu. */
export function workspacePath(workspace: WorkspaceId, item: WorkspaceNavItem): string {
  return item.path ? `/${workspace}/${item.path}` : `/${workspace}`;
}

/** Rădăcina (dashboard-ul) unui spațiu de lucru. */
export function workspaceHome(workspace: WorkspaceId): string {
  return `/${workspace}`;
}

/** Extrage spațiul de lucru din calea curentă (primul segment din URL), sau
 *  null dacă e o rută veche fără prefix. */
export function workspaceFromPath(pathname: string): WorkspaceId | null {
  const first = pathname.split('/').filter(Boolean)[0] ?? '';
  return isWorkspaceId(first) ? first : null;
}

const ACTIVE_KEY = 'tonik.workspace.active';
const lastPathKey = (workspace: WorkspaceId) => `tonik.workspace.lastPath.${workspace}`;

function readLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage indisponibil (mod privat etc.) — persistența e un bonus, nu critică.
  }
}

/** Ultimul spațiu de lucru folosit (implicit DDD la prima pornire). */
export function getStoredActiveWorkspace(): WorkspaceId {
  const stored = readLocalStorage(ACTIVE_KEY);
  return stored && isWorkspaceId(stored) ? stored : 'ddd';
}

/** Ultima pagină vizitată într-un spațiu, sau dashboard-ul lui dacă nu există istoric. */
export function getStoredLastPath(workspace: WorkspaceId): string {
  return readLocalStorage(lastPathKey(workspace)) ?? workspaceHome(workspace);
}

/** Ruta de pornire a aplicației: ultima pagină din ultimul spațiu folosit. */
export function getInitialRoute(): string {
  return getStoredLastPath(getStoredActiveWorkspace());
}

interface WorkspaceContextValue {
  workspace: WorkspaceId;
  meta: WorkspaceMeta;
  navItems: WorkspaceNavItem[];
  /** Trece la alt spațiu — revine la ultima pagină vizitată acolo (sau la dashboard). */
  switchWorkspace: (target: WorkspaceId) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Furnizează spațiul de lucru curent (dedus din URL, sursa unică de adevăr)
 * restului aplicației și persistă local ultima pagină vizitată din fiecare
 * spațiu, pentru ca la comutare / repornire să revenim exact acolo.
 */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const workspace = workspaceFromPath(location.pathname) ?? 'ddd';

  useEffect(() => {
    // Rutele vechi fără prefix sunt redirectate imediat de router — nu
    // suprascriem istoricul spațiilor cu ele (ele nici nu apucă să se randeze).
    const current = workspaceFromPath(location.pathname);
    if (!current) return;
    writeLocalStorage(ACTIVE_KEY, current);
    writeLocalStorage(lastPathKey(current), `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  const switchWorkspace = useCallback(
    (target: WorkspaceId) => {
      if (target === workspace) return;
      navigate(getStoredLastPath(target));
    },
    [navigate, workspace],
  );

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspace,
      meta: WORKSPACES[workspace],
      navItems: WORKSPACES[workspace].navItems,
      switchWorkspace,
    }),
    [workspace, switchWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/** Spațiul de lucru curent + meniul lui + funcția de comutare între spații. */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace() trebuie folosit în interiorul <WorkspaceProvider>.');
  return ctx;
}
