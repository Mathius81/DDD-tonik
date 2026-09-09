/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useEffect, useMemo, useState } from 'react';
import { isRouteErrorResponse, useLocation, useNavigate, useRouteError } from 'react-router-dom';
import { Button, Center, Collapse, Group, Paper, ScrollArea, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconChevronDown, IconChevronUp, IconClipboard, IconHome, IconRefresh } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { TonikLogo } from './TonikLogo';
import { ddd } from '../api/ddd';
import { workspaceFromPath, workspaceHome } from '../workspace';

interface DetaliiEroare {
  mesaj: string;
  stiva?: string;
}

/** Transformă orice a fost aruncat de router (`Error`, `Response`, string, etc.) într-un mesaj lizibil. */
function extrageDetalii(error: unknown): DetaliiEroare {
  if (error instanceof Error) {
    return { mesaj: error.message || 'Eroare fără mesaj.', stiva: error.stack };
  }
  if (isRouteErrorResponse(error)) {
    const corp = typeof error.data === 'string' ? error.data : JSON.stringify(error.data);
    return { mesaj: `${error.status} ${error.statusText}${corp ? ` — ${corp}` : ''}` };
  }
  if (typeof error === 'string') return { mesaj: error };
  try {
    return { mesaj: JSON.stringify(error) ?? String(error) };
  } catch {
    return { mesaj: String(error) };
  }
}

/**
 * Plasa de siguranță pentru erorile neprevăzute din interfață (`errorElement`
 * al router-ului — vezi App.tsx). Înlocuiește ecranul brut de dezvoltator al
 * react-router cu unul liniștitor, în română: datele rămân intacte pe disc,
 * omul poate continua din pagina principală sau reîncărca aplicația. Detaliile
 * tehnice sunt ascunse implicit, dar pot fi copiate pentru suport.
 */
export function EroareNeprevazuta() {
  const error = useRouteError();
  const navigate = useNavigate();
  const location = useLocation();
  const [detaliiDeschise, setDetaliiDeschise] = useState(false);

  const { mesaj, stiva } = useMemo(() => extrageDetalii(error), [error]);

  useEffect(() => {
    // Trimitere „best-effort” spre logul din main, ca să existe urmă și după
    // ce omul închide ecranul. Un eșec de trimitere nu trebuie tratat — ecranul
    // de eroare tot funcționează fără el. Se trimite o singură dată, pentru
    // eroarea curentă (`location` la momentul apariției ei e suficient de precis).
    ddd.about
      .logRendererError({ message: mesaj, stack: stiva, route: location.pathname })
      .catch(() => undefined);
  }, [mesaj, stiva, location.pathname]);

  const mergiLaPaginaPrincipala = () => {
    const workspace = workspaceFromPath(location.pathname) ?? 'ddd';
    navigate(workspaceHome(workspace));
  };

  const reincarcaAplicatia = () => window.location.reload();

  const copiazaDetaliile = async () => {
    const text = [
      'Tonik — detalii eroare neprevăzută',
      `Ruta: ${location.pathname}`,
      `Mesaj: ${mesaj}`,
      stiva ? `\nStivă:\n${stiva}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: 'teal', message: 'Detaliile au fost copiate în clipboard.' });
    } catch {
      notifications.show({ color: 'red', message: 'Nu am putut copia detaliile.' });
    }
  };

  return (
    <Center mih="70vh" p="var(--sp-5)">
      <Paper withBorder maw={520} w="100%" p="var(--sp-6)" radius="lg" shadow="var(--shadow-md)">
        <Stack align="center" gap="var(--sp-4)">
          <TonikLogo />
          <IconAlertTriangle size={34} color="var(--warning)" />
          <Stack align="center" gap={4}>
            <Text fw={650} fz="var(--fs-page-title)" ta="center">
              Ceva n-a mers cum trebuie
            </Text>
            <Text size="var(--fs-body)" c="var(--text-muted)" ta="center">
              Datele tale sunt în siguranță — nu s-a pierdut nimic. Poți continua din pagina
              principală sau poți reîncărca aplicația.
            </Text>
          </Stack>

          <Group gap="var(--sp-3)">
            <Button leftSection={<IconHome size={16} />} onClick={mergiLaPaginaPrincipala}>
              Înapoi la pagina principală
            </Button>
            <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={reincarcaAplicatia}>
              Reîncarcă aplicația
            </Button>
          </Group>

          <Stack gap={4} w="100%">
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              rightSection={detaliiDeschise ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />}
              onClick={() => setDetaliiDeschise((v) => !v)}
            >
              Detalii tehnice
            </Button>
            <Collapse expanded={detaliiDeschise}>
              <Stack gap="var(--sp-2)">
                <ScrollArea.Autosize mah={220} type="auto">
                  <Text
                    component="pre"
                    size="var(--fs-small)"
                    c="var(--text-muted)"
                    style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'monospace', margin: 0 }}
                  >
                    {mesaj}
                    {stiva ? `\n\n${stiva}` : ''}
                  </Text>
                </ScrollArea.Autosize>
                <Button
                  variant="light"
                  size="compact-sm"
                  leftSection={<IconClipboard size={14} />}
                  onClick={copiazaDetaliile}
                >
                  Copiază detaliile
                </Button>
              </Stack>
            </Collapse>
          </Stack>
        </Stack>
      </Paper>
    </Center>
  );
}
