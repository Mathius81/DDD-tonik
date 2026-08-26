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
import { Accordion, Anchor, Badge, Group, Loader, Modal, ScrollArea, Stack, Text, TextInput } from '@mantine/core';
import { IconExternalLink, IconSearch } from '@tabler/icons-react';
import { ddd } from '../api/ddd';
import { runMutation, unwrap } from '../api/useIpc';
import { unaccentRo } from '../../shared/text';
import type { AboutThirdPartyLicenseText, AboutThirdPartyLicenses, AboutThirdPartyPackage } from '../../shared/schemas/about';

interface Props {
  opened: boolean;
  onClose: () => void;
}

/**
 * Modal „Licențe și componente open-source” — deschis din Despre.
 *
 * Lista (nume, versiune, licență) vine dintr-un singur apel IPC, ieftin chiar
 * și pentru zeci de pachete. Textul INTEGRAL al fiecărei licențe se cere abia
 * când utilizatorul deschide acel pachet anume (Accordion), ca să nu circule
 * prin IPC dintr-o dată textul a zeci de licențe — vezi `about.ipc.ts`.
 */
export function ThirdPartyLicensesModal({ opened, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [fileFound, setFileFound] = useState(true);
  const [packages, setPackages] = useState<AboutThirdPartyPackage[]>([]);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [loadingText, setLoadingText] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    setLoading(true);
    setQuery('');
    setExpanded(null);
    unwrap<AboutThirdPartyLicenses>(ddd.about.thirdPartyLicenses.list())
      .then((r) => {
        setFileFound(r.fileFound);
        setPackages(r.packages);
      })
      .catch(() => {
        setFileFound(false);
        setPackages([]);
      })
      .finally(() => setLoading(false));
  }, [opened]);

  const filtered = useMemo(() => {
    const q = unaccentRo(query.trim());
    if (!q) return packages;
    return packages.filter((p) => unaccentRo(`${p.name} ${p.license}`).includes(q));
  }, [packages, query]);

  const packageKey = (p: AboutThirdPartyPackage) => `${p.name}@${p.version}`;

  const loadTextIfNeeded = async (p: AboutThirdPartyPackage) => {
    const key = packageKey(p);
    if (texts[key] !== undefined) return;
    setLoadingText(key);
    try {
      const result = await unwrap<AboutThirdPartyLicenseText>(
        ddd.about.thirdPartyLicenses.getText({ name: p.name, version: p.version }),
      );
      setTexts((prev) => ({ ...prev, [key]: result.found ? result.text : 'Nu am găsit textul acestei licențe.' }));
    } catch {
      setTexts((prev) => ({ ...prev, [key]: 'Nu am putut încărca textul acestei licențe.' }));
    } finally {
      setLoadingText(null);
    }
  };

  const openFullFile = () => {
    void runMutation(ddd.about.thirdPartyLicenses.openFile());
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Licențe și componente open-source" size="lg">
      <Stack gap="var(--sp-3)">
        <Text size="var(--fs-small)" c="dimmed">
          Tonik este scris de Marius Constantinescu — codul aplicației este proprietar. Aplicația
          folosește însă și componente open-source (biblioteci terțe), listate mai jos, fiecare sub
          propria ei licență.
        </Text>

        {loading ? (
          <Group justify="center" py="var(--sp-4)">
            <Loader size="sm" />
          </Group>
        ) : !fileFound ? (
          <Text size="var(--fs-small)" c="dimmed">
            Lista nu a fost încă generată (fișierul THIRD-PARTY-LICENSES.txt lipsește). Rulează{' '}
            <code>npm run licenses</code> pentru a o crea.
          </Text>
        ) : (
          <>
            <TextInput
              placeholder="Caută o componentă..."
              leftSection={<IconSearch size={16} />}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            <Text size="var(--fs-micro)" c="dimmed">
              {filtered.length} din {packages.length} componente
            </Text>
            <ScrollArea.Autosize mah={420} type="auto">
              <Accordion
                value={expanded}
                onChange={(value) => {
                  setExpanded(value);
                  const pkg = packages.find((p) => packageKey(p) === value);
                  if (pkg) void loadTextIfNeeded(pkg);
                }}
                variant="separated"
              >
                {filtered.map((p) => {
                  const key = packageKey(p);
                  return (
                    <Accordion.Item key={key} value={key}>
                      <Accordion.Control>
                        <Group justify="space-between" wrap="nowrap" pr="var(--sp-2)">
                          <Text size="var(--fs-small)" fw={550} truncate>
                            {p.name}
                            <Text component="span" c="dimmed" fw={400}>
                              {' '}
                              @{p.version}
                            </Text>
                          </Text>
                          <Badge variant="light" size="sm">
                            {p.license}
                          </Badge>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap={6}>
                          <Text size="var(--fs-micro)" c="dimmed">
                            Copyright: {p.copyright}
                          </Text>
                          {loadingText === key ? (
                            <Group py="var(--sp-2)">
                              <Loader size="xs" />
                            </Group>
                          ) : (
                            <ScrollArea.Autosize mah={240} type="auto">
                              <Text
                                component="pre"
                                size="var(--fs-micro)"
                                style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}
                              >
                                {texts[key] ?? ''}
                              </Text>
                            </ScrollArea.Autosize>
                          )}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </ScrollArea.Autosize>
            <Anchor size="var(--fs-small)" onClick={openFullFile} style={{ cursor: 'pointer' }}>
              <Group gap={4} wrap="nowrap">
                <IconExternalLink size={14} />
                Deschide fișierul complet (THIRD-PARTY-LICENSES.txt)
              </Group>
            </Anchor>
          </>
        )}
      </Stack>
    </Modal>
  );
}
