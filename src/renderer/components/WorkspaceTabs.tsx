/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { UnstyledButton } from '@mantine/core';
import { useWorkspace, WORKSPACE_ORDER, WORKSPACES } from '../workspace';

const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent);

/**
 * Comutator de spații de lucru — rând de „foi” peste toată lățimea ferestrei,
 * deasupra sidebar-ului și a conținutului (ca tab-urile de foi din Excel).
 * Apeși un tab și toată aplicația devine acel sistem.
 */
export function WorkspaceTabs() {
  const { workspace, switchWorkspace } = useWorkspace();

  return (
    <div className="tonik-drag-region tonik-workspace-tabs">
      {/* Rezervă spațiu pentru butoanele semafor de pe macOS (fereastră fără cadru). */}
      {isMac && <span className="tonik-workspace-tabs-gutter" aria-hidden="true" />}
      {WORKSPACE_ORDER.map((id) => (
        <UnstyledButton
          key={id}
          className="tonik-workspace-tab"
          data-active={id === workspace || undefined}
          onClick={() => switchWorkspace(id)}
        >
          {WORKSPACES[id].label}
        </UnstyledButton>
      ))}
      <span className="tonik-workspace-tabs-spacer" aria-hidden="true" />
    </div>
  );
}
