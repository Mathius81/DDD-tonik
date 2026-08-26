/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  Meniul secret al autorului — „easter egg”.
 *
 *  Se deschide din Setări → Aplicație → Despre: 10 click-uri consecutive pe
 *  numărul de versiune sau pe numele autorului (exact ca „Ai devenit
 *  dezvoltator” din Android). Contorul de click-uri trăiește acolo
 *  (`AplicatieTab.tsx`); componenta de aici doar ascultă evenimentul
 *  `SECRET_MENU_EVENT` de pe `window` și afișează panoul.
 *
 *  Înainte de a afișa panoul, se cere o parolă (poarta de mai jos):
 *   - dacă nu există încă una setată → ecran de SETARE (parolă + confirmare);
 *   - altfel → ecran de INTRODUCERE, cu blocare temporară după 5 greșeli.
 *  Verificarea (scrypt + timingSafeEqual) se face exclusiv în main — vezi
 *  `about.ipc.ts`; hash-ul și sarea nu ajung niciodată în acest fișier.
 *  Dacă poarta e închisă fără succes, se emite `SECRET_MENU_CANCELLED_EVENT`
 *  ca `AplicatieTab.tsx` să reseteze contorul de click-uri.
 *
 *  Patru file, toate cu date reale din aplicație:
 *   A. Semnătura            — mesajul personal al autorului.
 *   B. Diagnostic            — ce ar întreba un telefon de suport.
 *   D. Statisticile tale     — bilanțul personal al utilizatorului.
 *   E. Consola de service    — acțiuni rapide, cu confirmare pentru tot ce
 *      trimite ceva în exterior sau modifică stare (vezi `confirmaSiRuleaza`).
 *      Tot aici se poate schimba parola porții de mai sus.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Tabs,
  Stack,
  Text,
  Group,
  Divider,
  Box,
  Table,
  Select,
  Button,
  ScrollArea,
  Code,
  Alert,
  Loader,
  PasswordInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import {
  IconFeather,
  IconStethoscope,
  IconChartBar,
  IconTools,
  IconClipboard,
  IconFolderOpen,
  IconSend2,
  IconRefresh,
  IconTestPipe,
  IconDatabase,
  IconLock,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { ddd } from '../api/ddd';
import { unwrap, runMutation } from '../api/useIpc';
import { fmtDate, fmtDateTime } from './dateUtils';
import { TonikLogo } from './TonikLogo';
import type {
  AboutDiagnostics,
  AboutInfo,
  AboutSecretMenuStatus,
  AboutSecretMenuVerifyResult,
  AboutStats,
} from '../../shared/schemas/about';
import { reportIds, type ReportId } from '../../shared/schemas/settings';
import { AUTHOR_NAME, COPYRIGHT_LINE } from '../../shared/authorship';

/** Numele evenimentului global prin care se deschide meniul secret. */
export const SECRET_MENU_EVENT = 'tonik:secret-menu-open';
/**
 * Emis când utilizatorul închide ecranul de parolă FĂRĂ succes (Escape, click
 * în afara modalului sau „Renunță”) — contorul de click-uri trebuie resetat,
 * ca meniul să nu poată fi redeschis fără cele 10 click-uri.
 */
export const SECRET_MENU_CANCELLED_EVENT = 'tonik:secret-menu-cancelled';

const REPORT_LABELS: Record<ReportId, string> = {
  ddd_dimineata: 'DDD — dimineața',
  ddd_seara: 'DDD — seara',
  covoare_dimineata: 'Covoare — dimineața',
  covoare_seara: 'Covoare — seara',
  cauciucuri_dimineata: 'Cauciucuri — dimineața',
  cauciucuri_seara: 'Cauciucuri — seara',
};

const LUNI_RO = [
  'ianuarie',
  'februarie',
  'martie',
  'aprilie',
  'mai',
  'iunie',
  'iulie',
  'august',
  'septembrie',
  'octombrie',
  'noiembrie',
  'decembrie',
];

/** '2026-03' → 'martie 2026'. */
function formatLuna(anLuna: string): string {
  const [an, luna] = anLuna.split('-').map(Number);
  const nume = LUNI_RO[(luna ?? 1) - 1];
  return nume ? `${nume} ${an}` : anLuna;
}

function marimeMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Secundele rămase până la deblocare (`lockedUntil`), actualizate la fiecare 250ms. */
function useNumaratoareInversa(lockedUntil: number | null): number {
  const [secunde, setSecunde] = useState(0);

  useEffect(() => {
    if (!lockedUntil) {
      setSecunde(0);
      return;
    }
    const actualizeaza = () => setSecunde(Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)));
    actualizeaza();
    const id = setInterval(actualizeaza, 250);
    return () => clearInterval(id);
  }, [lockedUntil]);

  return secunde;
}

function raportDiagnosticText(info: AboutInfo | null, diag: AboutDiagnostics | null): string {
  if (!diag) return 'Diagnosticul nu a putut fi încărcat.';
  const l: string[] = [];
  l.push('Tonik — raport de diagnostic');
  l.push(`Generat: ${new Date().toLocaleString('ro-RO')}`);
  if (info) l.push(`Versiune aplicație: v${info.version}`);
  l.push(`Versiune schemă bază de date: ${diag.schemaVersion}`);
  l.push('');
  l.push('Înregistrări:');
  l.push(`  Asociații: ${diag.tableCounts.associations}`);
  l.push(`  Contacte: ${diag.tableCounts.contacts}`);
  l.push(`  Intervenții: ${diag.tableCounts.interventions}`);
  l.push(`  Follow-up-uri: ${diag.tableCounts.followups}`);
  l.push(`  Remindere: ${diag.tableCounts.reminders}`);
  l.push(`  Mesaje: ${diag.tableCounts.messages}`);
  l.push(`  Clienți Covoare: ${diag.tableCounts.carpetClients}`);
  l.push(`  Comenzi Covoare: ${diag.tableCounts.carpetOrders}`);
  l.push(`  Clienți Cauciucuri: ${diag.tableCounts.tyreClients}`);
  l.push(`  Vehicule Cauciucuri: ${diag.tableCounts.tyreVehicles}`);
  l.push(`  Seturi în depozit (Cauciucuri): ${diag.tableCounts.tyreStorageSets}`);
  l.push('');
  l.push(
    diag.lastBackup
      ? `Ultimul backup: ${diag.lastBackup.name} — ${fmtDateTime(diag.lastBackup.createdAt)} (${marimeMB(diag.lastBackup.sizeBytes)})`
      : 'Ultimul backup: niciunul încă',
  );
  l.push(
    diag.license.status === 'valid'
      ? `Licență: valabilă până la ${fmtDate(diag.license.expiresAt)} (${diag.license.daysLeft} zile rămase)`
      : diag.license.status === 'expired'
        ? `Licență: expirată la ${fmtDate(diag.license.expiresAt)}`
        : 'Licență: lipsă',
  );
  l.push(`Baza de date: ${diag.dbPath}`);
  l.push(`Loguri: ${diag.logsPath}`);
  l.push(`Electron ${diag.electronVersion} · Node ${diag.nodeVersion} · Chrome ${diag.chromeVersion}`);
  if (diag.recentErrors.length) {
    l.push('');
    l.push('Ultimele erori din logul de azi:');
    l.push(...diag.recentErrors);
  } else {
    l.push('');
    l.push('Nicio eroare în logul de azi.');
  }
  return l.join('\n');
}

export function SemnaturaAutor() {
  const [deschis, setDeschis] = useState(false);
  const [tab, setTab] = useState<string | null>('semnatura');

  const [info, setInfo] = useState<AboutInfo | null>(null);
  const [diagnostic, setDiagnostic] = useState<AboutDiagnostics | null>(null);
  const [statistici, setStatistici] = useState<AboutStats | null>(null);

  const [raportSelectat, setRaportSelectat] = useState<ReportId>('ddd_dimineata');
  const [inLucru, setInLucru] = useState<string | null>(null);

  // --- Poarta cu parolă a meniului secret ---------------------------------
  const [poartaDeschisa, setPoartaDeschisa] = useState(false);
  const [parolaExista, setParolaExista] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [parola, setParola] = useState('');
  const [parolaConfirmare, setParolaConfirmare] = useState('');
  const [eroarePoarta, setEroarePoarta] = useState<string | null>(null);
  const [seProceseaza, setSeProceseaza] = useState(false);
  const parolaRef = useRef<HTMLInputElement>(null);
  const secundeBlocaj = useNumaratoareInversa(lockedUntil);

  // --- Schimbarea parolei (Consola de service) ----------------------------
  const [parolaVeche, setParolaVeche] = useState('');
  const [parolaNouaSchimbare, setParolaNouaSchimbare] = useState('');
  const [parolaNouaConfirmare, setParolaNouaConfirmare] = useState('');

  const incarcaContinutulMeniului = () => {
    setTab('semnatura');
    setDeschis(true);
    unwrap<AboutInfo>(ddd.about.get())
      .then(setInfo)
      .catch(() => setInfo(null));
    unwrap<AboutDiagnostics>(ddd.about.diagnostics())
      .then(setDiagnostic)
      .catch(() => setDiagnostic(null));
    unwrap<AboutStats>(ddd.about.stats())
      .then(setStatistici)
      .catch(() => setStatistici(null));
  };

  useEffect(() => {
    const cereParola = () => {
      setParola('');
      setParolaConfirmare('');
      setEroarePoarta(null);
      unwrap<AboutSecretMenuStatus>(ddd.about.secretMenuStatus())
        .then((status) => {
          setParolaExista(status.hasPassword);
          setLockedUntil(status.lockedUntil);
          setPoartaDeschisa(true);
        })
        .catch(() => {
          notifications.show({
            color: 'red',
            message: 'Nu am putut verifica parola meniului secret.',
          });
        });
    };
    window.addEventListener(SECRET_MENU_EVENT, cereParola);
    return () => window.removeEventListener(SECRET_MENU_EVENT, cereParola);
  }, []);

  // Focus pe câmpul de parolă de fiecare dată când se deschide poarta.
  useEffect(() => {
    if (!poartaDeschisa) return;
    const id = setTimeout(() => parolaRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [poartaDeschisa]);

  const inchidePoarta = () => {
    setPoartaDeschisa(false);
    setParola('');
    setParolaConfirmare('');
    setEroarePoarta(null);
    // Utilizatorul a renunțat fără să introducă parola corectă — trebuie iar 10 click-uri.
    window.dispatchEvent(new CustomEvent(SECRET_MENU_CANCELLED_EVENT));
  };

  const seteazaParola = async () => {
    setEroarePoarta(null);
    if (parola.length < 4) {
      setEroarePoarta('Parola trebuie să aibă cel puțin 4 caractere.');
      return;
    }
    if (parola !== parolaConfirmare) {
      setEroarePoarta('Parolele introduse nu coincid.');
      setParolaConfirmare('');
      return;
    }
    setSeProceseaza(true);
    try {
      await unwrap(ddd.about.secretMenuSetPassword({ password: parola }));
      setPoartaDeschisa(false);
      setParola('');
      setParolaConfirmare('');
      incarcaContinutulMeniului();
    } catch (err) {
      setEroarePoarta(err instanceof Error ? err.message : 'Nu am putut seta parola.');
      setParola('');
      setParolaConfirmare('');
      parolaRef.current?.focus();
    } finally {
      setSeProceseaza(false);
    }
  };

  const verificaParola = async () => {
    if (secundeBlocaj > 0) return;
    setEroarePoarta(null);
    setSeProceseaza(true);
    try {
      const rezultat = await unwrap<AboutSecretMenuVerifyResult>(
        ddd.about.secretMenuVerifyPassword({ password: parola }),
      );
      if (rezultat.success) {
        setPoartaDeschisa(false);
        setParola('');
        incarcaContinutulMeniului();
        return;
      }
      setLockedUntil(rezultat.lockedUntil);
      setParola('');
      if (rezultat.lockedUntil) {
        setEroarePoarta('Prea multe încercări greșite. Ecranul e blocat temporar.');
      } else if (rezultat.attemptsLeft === 1) {
        setEroarePoarta('Parolă greșită. Mai ai o singură încercare.');
      } else {
        setEroarePoarta(`Parolă greșită. Mai ai ${rezultat.attemptsLeft} încercări.`);
      }
      parolaRef.current?.focus();
    } catch (err) {
      setEroarePoarta(err instanceof Error ? err.message : 'Nu am putut verifica parola.');
      setParola('');
      parolaRef.current?.focus();
    } finally {
      setSeProceseaza(false);
    }
  };

  const submitPoarta = () => {
    if (secundeBlocaj > 0) return;
    if (parolaExista) void verificaParola();
    else void seteazaParola();
  };

  const rand = (eticheta: string, valoare: string | number) => (
    <Group justify="space-between" gap="xs">
      <Text size="var(--fs-small)" c="dimmed">
        {eticheta}
      </Text>
      <Text size="var(--fs-small)" fw={600}>
        {valoare}
      </Text>
    </Group>
  );

  // --- Consola de service ------------------------------------------------

  const creeazaBackup = async () => {
    setInLucru('backup');
    await runMutation(ddd.backup.create(), 'Backup creat.');
    setInLucru(null);
  };

  const trimiteRaportDeProba = () => {
    modals.openConfirmModal({
      title: 'Trimite raport de probă',
      children: (
        <Text size="sm">
          Se va trimite ACUM, real, raportul <b>{REPORT_LABELS[raportSelectat]}</b> prin canalele
          activate (email / WhatsApp / notificare) către destinatarii configurați în Setări → Raport
          zilnic. Continui?
        </Text>
      ),
      labels: { confirm: 'Trimite acum', cancel: 'Renunță' },
      confirmProps: { color: 'tonik' },
      onConfirm: async () => {
        setInLucru('trimite');
        await runMutation(
          ddd.settings.sendDigestNow({ report: raportSelectat }),
          'Raport trimis (sau fără conținut de trimis acum).',
        );
        setInLucru(null);
      },
    });
  };

  const reseteazaGarda = () => {
    modals.openConfirmModal({
      title: 'Resetează garda de trimitere',
      children: (
        <Text size="sm">
          Se șterge marcajul „trimis azi” pentru raportul <b>{REPORT_LABELS[raportSelectat]}</b>. La
          următoarea trimitere (automată sau cu „Trimite acum” de mai jos) raportul va pleca DIN NOU
          azi, real, către destinatarii configurați. Continui?
        </Text>
      ),
      labels: { confirm: 'Resetează garda', cancel: 'Renunță' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        setInLucru('garda');
        await runMutation(
          ddd.about.resetReportGuard({ report: raportSelectat }),
          'Gardă resetată — raportul poate fi retrimis azi.',
        );
        setInLucru(null);
      },
    });
  };

  const testeazaSmtp = async () => {
    setInLucru('smtp');
    await runMutation(ddd.settings.testSmtp(), 'Conexiune SMTP OK.');
    setInLucru(null);
  };

  const testeazaWhatsapp = async () => {
    setInLucru('whatsapp');
    await runMutation(ddd.settings.testWhatsapp(), 'Conexiune WhatsApp OK.');
    setInLucru(null);
  };

  const deschideFolderLoguri = async () => {
    setInLucru('loguri');
    await runMutation(ddd.about.openLogsFolder());
    setInLucru(null);
  };

  const deschideFolderBackupuri = async () => {
    setInLucru('backupuri');
    await runMutation(ddd.about.openBackupsFolder());
    setInLucru(null);
  };

  const copiazaRaportul = async () => {
    const text = raportDiagnosticText(info, diagnostic);
    try {
      await navigator.clipboard.writeText(text);
      notifications.show({ color: 'teal', message: 'Raportul a fost copiat în clipboard.' });
    } catch {
      notifications.show({ color: 'red', message: 'Nu am putut copia raportul.' });
    }
  };

  const schimbaParola = async () => {
    if (parolaNouaSchimbare.length < 4) {
      notifications.show({ color: 'red', message: 'Parola nouă trebuie să aibă cel puțin 4 caractere.' });
      return;
    }
    if (parolaNouaSchimbare !== parolaNouaConfirmare) {
      notifications.show({ color: 'red', message: 'Parolele noi introduse nu coincid.' });
      return;
    }
    setInLucru('parola');
    const rezultat = await runMutation(
      ddd.about.secretMenuChangePassword({
        oldPassword: parolaVeche,
        newPassword: parolaNouaSchimbare,
      }),
      'Parola meniului secret a fost schimbată.',
    );
    setInLucru(null);
    if (rezultat) {
      setParolaVeche('');
      setParolaNouaSchimbare('');
      setParolaNouaConfirmare('');
    }
  };

  return (
    <>
      {/* Poarta cu parolă — se deschide înaintea panoului secret. */}
      <Modal
        opened={poartaDeschisa}
        onClose={inchidePoarta}
        centered
        size="xs"
        radius="md"
        title={parolaExista ? 'Panoul secret e protejat cu parolă' : 'Setează o parolă pentru panoul secret'}
        overlayProps={{ backgroundOpacity: 0.7, blur: 4 }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPoarta();
          }}
        >
          <Stack gap="var(--sp-3)">
            {!parolaExista && (
              <Text size="var(--fs-small)" c="dimmed">
                E parola ta pentru acest panou ascuns. Nu e scrisă nicăieri în clar și NU poate fi
                recuperată dacă o uiți — memoreaz-o sau notează-o undeva sigur.
              </Text>
            )}

            {secundeBlocaj > 0 ? (
              <Alert variant="light" color="red" icon={<IconLock size={16} />}>
                Prea multe încercări. Încearcă din nou peste {secundeBlocaj}{' '}
                {secundeBlocaj === 1 ? 'secundă' : 'secunde'}.
              </Alert>
            ) : (
              <>
                <PasswordInput
                  ref={parolaRef}
                  label={parolaExista ? 'Parolă' : 'Parolă nouă'}
                  value={parola}
                  onChange={(e) => setParola(e.currentTarget.value)}
                />
                {!parolaExista && (
                  <PasswordInput
                    label="Confirmă parola"
                    value={parolaConfirmare}
                    onChange={(e) => setParolaConfirmare(e.currentTarget.value)}
                  />
                )}
              </>
            )}

            {eroarePoarta && (
              <Text size="var(--fs-small)" c="red">
                {eroarePoarta}
              </Text>
            )}

            <Group justify="flex-end">
              <Button variant="default" onClick={inchidePoarta}>
                Renunță
              </Button>
              <Button type="submit" loading={seProceseaza} disabled={secundeBlocaj > 0 || !parola}>
                {parolaExista ? 'Deschide' : 'Setează parola'}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <Modal
        opened={deschis}
        onClose={() => setDeschis(false)}
        centered
        size="lg"
        radius="md"
        title="Panoul secret"
        overlayProps={{ backgroundOpacity: 0.7, blur: 4 }}
      >
        <Tabs value={tab} onChange={setTab} variant="pills" color="tonik">
          <Tabs.List mb="md" style={{ gap: 4 }}>
            <Tabs.Tab value="semnatura" leftSection={<IconFeather size={16} stroke={1.7} />}>
              Semnătura
            </Tabs.Tab>
            <Tabs.Tab value="diagnostic" leftSection={<IconStethoscope size={16} stroke={1.7} />}>
              Diagnostic
            </Tabs.Tab>
            <Tabs.Tab value="statistici" leftSection={<IconChartBar size={16} stroke={1.7} />}>
              Statisticile tale
            </Tabs.Tab>
            <Tabs.Tab value="service" leftSection={<IconTools size={16} stroke={1.7} />}>
              Consola de service
            </Tabs.Tab>
          </Tabs.List>

          {/* A. Semnătura ------------------------------------------------ */}
          <Tabs.Panel value="semnatura">
            <Stack gap="var(--sp-4)" align="center" py="var(--sp-3)">
              <Box w={130}>
                <TonikLogo />
              </Box>

              <Stack gap={2} align="center">
                <Text size="var(--fs-small)" c="dimmed" tt="uppercase" style={{ letterSpacing: '0.08em' }}>
                  Scrisă de
                </Text>
                <Text fw={700} size="xl" ta="center">
                  {AUTHOR_NAME}
                </Text>
                <Text size="var(--fs-small)" c="dimmed" ta="center">
                  De la prima linie până la ultima.
                </Text>
              </Stack>

              {info && (
                <>
                  <Divider w="100%" />
                  <Stack gap={6} w="100%">
                    {rand('Prima pornire', fmtDate(info.firstRun))}
                    {rand(
                      'Zile de atunci',
                      info.daysSinceFirstRun === 0 ? 'chiar azi' : info.daysSinceFirstRun,
                    )}
                    {rand('Porniri', info.runCount)}
                    {rand('Asociații în evidență', info.associations)}
                    {rand('Intervenții înregistrate', info.interventions)}
                    {rand('Versiune', `v${info.version}`)}
                  </Stack>
                </>
              )}

              <Divider w="100%" />

              <Stack gap={2} align="center">
                <Text size="var(--fs-small)" c="dimmed" ta="center" fs="italic">
                  „Nimeni nu ți-a construit-o. Ai construit-o tu.”
                </Text>
                <Text size="var(--fs-small)" c="dimmed" ta="center" opacity={0.7} mt={6}>
                  {COPYRIGHT_LINE}
                </Text>
              </Stack>
            </Stack>
          </Tabs.Panel>

          {/* B. Diagnostic ------------------------------------------------ */}
          <Tabs.Panel value="diagnostic">
            {!diagnostic ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : (
              <Stack gap="var(--sp-3)">
                <Table verticalSpacing={4}>
                  <Table.Tbody>
                    <Table.Tr>
                      <Table.Td>Asociații</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.associations}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Contacte</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.contacts}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Intervenții</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.interventions}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Follow-up-uri</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.followups}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Remindere</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.reminders}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Mesaje</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.messages}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Clienți Covoare</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.carpetClients}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Comenzi Covoare</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.carpetOrders}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Clienți Cauciucuri</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.tyreClients}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Vehicule Cauciucuri</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.tyreVehicles}</Table.Td>
                    </Table.Tr>
                    <Table.Tr>
                      <Table.Td>Seturi în depozit</Table.Td>
                      <Table.Td align="right">{diagnostic.tableCounts.tyreStorageSets}</Table.Td>
                    </Table.Tr>
                  </Table.Tbody>
                </Table>

                <Divider />

                <Stack gap={4}>
                  {rand('Versiune schemă bază de date', diagnostic.schemaVersion)}
                  {rand(
                    'Ultimul backup',
                    diagnostic.lastBackup
                      ? `${fmtDateTime(diagnostic.lastBackup.createdAt)} · ${marimeMB(diagnostic.lastBackup.sizeBytes)}`
                      : 'niciunul încă',
                  )}
                  {rand(
                    'Licență',
                    diagnostic.license.status === 'valid'
                      ? `valabilă până la ${fmtDate(diagnostic.license.expiresAt)} (${diagnostic.license.daysLeft} zile)`
                      : diagnostic.license.status === 'expired'
                        ? `expirată la ${fmtDate(diagnostic.license.expiresAt)}`
                        : 'lipsă',
                  )}
                  {rand('Electron · Node · Chrome', `${diagnostic.electronVersion} · ${diagnostic.nodeVersion} · ${diagnostic.chromeVersion}`)}
                </Stack>

                <Stack gap={2}>
                  <Text size="var(--fs-small)" c="dimmed">Baza de date</Text>
                  <Code block style={{ wordBreak: 'break-all', fontSize: 'var(--fs-small)' }}>
                    {diagnostic.dbPath}
                  </Code>
                  <Text size="var(--fs-small)" c="dimmed" mt={4}>Loguri</Text>
                  <Code block style={{ wordBreak: 'break-all', fontSize: 'var(--fs-small)' }}>
                    {diagnostic.logsPath}
                  </Code>
                </Stack>

                <Stack gap={4}>
                  <Text size="var(--fs-small)" c="dimmed">
                    Ultimele erori din logul de azi
                  </Text>
                  {diagnostic.recentErrors.length === 0 ? (
                    <Alert variant="light" color="gray">
                      Nicio eroare în logul de azi.
                    </Alert>
                  ) : (
                    <ScrollArea h={140}>
                      <Code block style={{ fontSize: 'var(--fs-small)', whiteSpace: 'pre-wrap' }}>
                        {diagnostic.recentErrors.join('\n')}
                      </Code>
                    </ScrollArea>
                  )}
                </Stack>

                <Group justify="flex-end">
                  <Button
                    variant="default"
                    size="sm"
                    leftSection={<IconClipboard size={15} />}
                    onClick={copiazaRaportul}
                  >
                    Copiază raportul
                  </Button>
                </Group>
              </Stack>
            )}
          </Tabs.Panel>

          {/* D. Statisticile tale ------------------------------------------ */}
          <Tabs.Panel value="statistici">
            {!statistici ? (
              <Group justify="center" py="xl">
                <Loader size="sm" />
              </Group>
            ) : (
              <Stack gap="var(--sp-3)" py="var(--sp-2)">
                <Text>
                  Folosești Tonik de{' '}
                  {statistici.daysSinceFirstRun === 0 ? 'azi' : `${statistici.daysSinceFirstRun} zile`} —
                  de pe {fmtDate(statistici.firstRun)}.
                </Text>
                <Text>
                  Ai înregistrat <b>{statistici.totalInterventions}</b> intervenții și ai trimis{' '}
                  <b>{statistici.totalMessagesSent}</b> mesaje către clienți.
                </Text>
                {statistici.busiestMonth && (
                  <Text>
                    Luna cea mai aglomerată a fost <b>{formatLuna(statistici.busiestMonth.month)}</b>, cu{' '}
                    {statistici.busiestMonth.count} intervenții.
                  </Text>
                )}
                {statistici.topAssociation && (
                  <Text>
                    <b>{statistici.topAssociation.name}</b> e clientul cu cele mai multe lucrări:{' '}
                    {statistici.topAssociation.count}.
                  </Text>
                )}
                <Text>
                  În medie, faci <b>{statistici.monthlyAverage.toFixed(1)}</b> intervenții pe lună.
                </Text>
                <Divider />
                <Text size="var(--fs-small)" c="dimmed" fs="italic">
                  Fiecare număr de aici e o asociație care sună azi și primește răspuns la timp — nu
                  degeaba.
                </Text>
              </Stack>
            )}
          </Tabs.Panel>

          {/* E. Consola de service ------------------------------------------ */}
          <Tabs.Panel value="service">
            <Stack gap="var(--sp-4)" py="var(--sp-2)">
              <Alert variant="light" color="yellow">
                Acțiunile care trimit ceva real (mesaj, email, raport) sau modifică o gardă de trimitere
                cer confirmare explicită. Restul rulează direct.
              </Alert>

              <Group>
                <Button
                  variant="default"
                  leftSection={<IconDatabase size={16} />}
                  loading={inLucru === 'backup'}
                  onClick={creeazaBackup}
                >
                  Creează backup acum
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconFolderOpen size={16} />}
                  loading={inLucru === 'backupuri'}
                  onClick={deschideFolderBackupuri}
                >
                  Deschide folderul de backup-uri
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconFolderOpen size={16} />}
                  loading={inLucru === 'loguri'}
                  onClick={deschideFolderLoguri}
                >
                  Deschide folderul de loguri
                </Button>
              </Group>

              <Divider label="Rapoarte zilnice" labelPosition="left" />
              <Group align="flex-end">
                <Select
                  label="Raport"
                  data={reportIds.map((id) => ({ value: id, label: REPORT_LABELS[id] }))}
                  value={raportSelectat}
                  onChange={(v) => v && setRaportSelectat(v as ReportId)}
                  w={220}
                  allowDeselect={false}
                />
                <Button
                  color="tonik"
                  leftSection={<IconSend2 size={16} />}
                  loading={inLucru === 'trimite'}
                  onClick={trimiteRaportDeProba}
                >
                  Trimite raport de probă
                </Button>
                <Button
                  variant="light"
                  color="red"
                  leftSection={<IconRefresh size={16} />}
                  loading={inLucru === 'garda'}
                  onClick={reseteazaGarda}
                >
                  Resetează garda de trimitere
                </Button>
              </Group>

              <Divider label="Conexiuni" labelPosition="left" />
              <Group>
                <Button
                  variant="default"
                  leftSection={<IconTestPipe size={16} />}
                  loading={inLucru === 'smtp'}
                  onClick={testeazaSmtp}
                >
                  Testează conexiunea SMTP
                </Button>
                <Button
                  variant="default"
                  leftSection={<IconTestPipe size={16} />}
                  loading={inLucru === 'whatsapp'}
                  onClick={testeazaWhatsapp}
                >
                  Testează conexiunea WhatsApp
                </Button>
              </Group>

              <Divider label="Securitate" labelPosition="left" />
              <Stack gap={8} maw={360}>
                <Text size="var(--fs-small)" c="dimmed">
                  Schimbă parola cerută la deschiderea acestui panou.
                </Text>
                <PasswordInput
                  label="Parola actuală"
                  value={parolaVeche}
                  onChange={(e) => setParolaVeche(e.currentTarget.value)}
                />
                <PasswordInput
                  label="Parola nouă"
                  value={parolaNouaSchimbare}
                  onChange={(e) => setParolaNouaSchimbare(e.currentTarget.value)}
                />
                <PasswordInput
                  label="Confirmă parola nouă"
                  value={parolaNouaConfirmare}
                  onChange={(e) => setParolaNouaConfirmare(e.currentTarget.value)}
                />
                <Group justify="flex-end">
                  <Button
                    variant="default"
                    leftSection={<IconLock size={16} />}
                    loading={inLucru === 'parola'}
                    disabled={!parolaVeche || !parolaNouaSchimbare || !parolaNouaConfirmare}
                    onClick={schimbaParola}
                  >
                    Schimbă parola
                  </Button>
                </Group>
              </Stack>
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </Modal>
    </>
  );
}
