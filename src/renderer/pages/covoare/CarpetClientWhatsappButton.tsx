/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { useState } from 'react';
import { ActionIcon, Modal, Stack, Textarea, Group, Button, Tooltip, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBrandWhatsapp } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';

interface Props {
  /** Clientul pentru care se trimite — toate comenzile DESCHISE ale acestui client (și ale
   * oricărui alt client cu ACELAȘI telefon) intră în mesaj, adunate. */
  clientId: number;
  /** Etichetă afișată pe buton; fără ea se randează doar o iconiță (potrivit pentru tabele). */
  label?: string;
  /** Subtitlu afișat în modal (ex. numele clientului). */
  subtitle?: string;
  /** Apelat după o trimitere reușită (ex. reîncarcă lista). */
  onSent?: () => void;
}

/**
 * Trimite situația AGREGATĂ a comenzilor DESCHISE ale unui client — un singur mesaj
 * WhatsApp cu toate comenzile lui, în loc de mai multe mesaje separate (cerința clientului:
 * „să fie adunate covoarele per client”). Mod asistat, la fel ca `CarpetWhatsappButton`:
 * deschide wa.me cu textul pregătit (editabil), utilizatorul apasă Send manual.
 * Trimiterea propriu-zisă refolosește `carpets.whatsapp.send` (același `client_id`).
 */
export function CarpetClientWhatsappButton({ clientId, label, subtitle, onSent }: Props) {
  const [opened, setOpened] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const open = async () => {
    setOpened(true);
    setLoadingPreview(true);
    try {
      const { body } = await unwrap<{ body: string }>(ddd.carpets.clientSituation.preview({ client_id: clientId }));
      setMessage(body);
    } catch (err) {
      setMessage('');
      setOpened(false);
      // Explicăm mereu de ce nu s-a deschis modalul (ex. clientul nu are comenzi deschise) —
      // spre deosebire de `AdminSituationWhatsappButton`, unde eșecul rămâne tăcut.
      notifications.show({
        color: 'red',
        title: 'Eroare',
        message: err instanceof Error ? err.message : 'A apărut o eroare.',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const send = async () => {
    if (sending) return; // gardă anti dublu-submit
    setSending(true);
    const result = await runMutation(
      ddd.carpets.whatsapp.send({ client_id: clientId, message }),
      'WhatsApp s-a deschis cu mesajul pregătit. Apasă Send acolo pentru a-l trimite.',
    );
    setSending(false);
    if (result) {
      setOpened(false);
      onSent?.();
    }
  };

  return (
    <>
      {label ? (
        <Button
          size="compact-sm"
          variant="light"
          color="green"
          leftSection={<IconBrandWhatsapp size={15} />}
          onClick={(e) => {
            e.stopPropagation();
            open();
          }}
        >
          {label}
        </Button>
      ) : (
        <Tooltip label="Trimite situația comenzilor deschise">
          <ActionIcon
            variant="light"
            color="green"
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            aria-label="Trimite situația comenzilor deschise"
          >
            <IconBrandWhatsapp size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      <Modal opened={opened} onClose={() => setOpened(false)} title="Trimite situația comenzilor" size="lg">
        <Stack>
          {subtitle && (
            <Text size="sm" c="dimmed">
              {subtitle}
            </Text>
          )}
          <Textarea
            label="Mesaj"
            autosize
            minRows={6}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
            disabled={loadingPreview}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Renunță
            </Button>
            <Button
              leftSection={<IconBrandWhatsapp size={16} />}
              color="green"
              onClick={send}
              disabled={!message.trim() || sending || loadingPreview}
            >
              Deschide WhatsApp
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
