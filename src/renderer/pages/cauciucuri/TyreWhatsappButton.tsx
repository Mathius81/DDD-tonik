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
import { IconBrandWhatsapp } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import type { TyreSeason } from '../../../shared/schemas/tyre';

interface Props {
  clientId: number;
  phone: string | null;
  /** Text implicit propus, editabil de utilizator înainte de trimitere. */
  defaultMessage: string;
  /** Etichetă scurtă afișată în modal (ex. numele clientului / al mașinii). */
  subtitle?: string;
  /** Sursa mesajului în istoric — implicit „manual” (ex. fișă client/mașină/set). */
  source?: 'manual' | 'season_reminder';
  /** Sezonul vizat, când `source` e „season_reminder” (afișat/salvat în istoric). */
  season?: TyreSeason | null;
  /** Apelat după o trimitere reușită (ex. pagina Remindere marchează clientul ca notificat). */
  onSent?: () => void;
}

/**
 * Buton „mesaj WhatsApp la un click” din fișa clientului/mașinii/setului din depozit.
 * Deschide conversația cu un mesaj pregătit (editabil) — la fel ca modul asistat din
 * spațiul DDD (`sendWhatsappAssisted`). Trimiterea rămâne mereu o decizie a utilizatorului,
 * nu se trimite nimic automat.
 */
export function TyreWhatsappButton({
  clientId,
  phone,
  defaultMessage,
  subtitle,
  source = 'manual',
  season = null,
  onSent,
}: Props) {
  const [opened, setOpened] = useState(false);
  const [message, setMessage] = useState(defaultMessage);
  const [sending, setSending] = useState(false);

  const open = () => {
    setMessage(defaultMessage);
    setOpened(true);
  };

  const send = async () => {
    setSending(true);
    const result = await runMutation(
      ddd.tyres.whatsapp.send({ client_id: clientId, message, source, season }),
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
      <Tooltip label={phone ? 'Trimite mesaj WhatsApp' : 'Clientul nu are număr de telefon'}>
        <ActionIcon
          variant="light"
          color="green"
          size="lg"
          disabled={!phone}
          onClick={open}
          aria-label="Trimite mesaj WhatsApp"
        >
          <IconBrandWhatsapp size={18} />
        </ActionIcon>
      </Tooltip>
      <Modal opened={opened} onClose={() => setOpened(false)} title="Trimite mesaj WhatsApp" size="lg">
        <Stack>
          {subtitle && (
            <Text size="sm" c="dimmed">
              {subtitle} {phone ? `· ${phone}` : ''}
            </Text>
          )}
          <Textarea
            label="Mesaj"
            autosize
            minRows={5}
            value={message}
            onChange={(e) => setMessage(e.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setOpened(false)}>
              Renunță
            </Button>
            <Button
              leftSection={<IconBrandWhatsapp size={16} />}
              color="green"
              onClick={send}
              disabled={!message.trim() || sending}
            >
              Deschide WhatsApp
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
