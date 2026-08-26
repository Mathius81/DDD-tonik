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

interface Props {
  clientId: number;
  phone: string | null;
  /** Text implicit propus, editabil de utilizator înainte de trimitere. */
  defaultMessage: string;
  /** Etichetă scurtă afișată în modal (ex. numele clientului). */
  subtitle?: string;
  /** Apelat după o trimitere reușită (ex. reîncarcă lista de pe pagina Remindere). */
  onSent?: () => void;
}

/**
 * Buton „mesaj WhatsApp la un click” pentru spațiul Covoare — mod asistat: deschide
 * conversația cu un mesaj pregătit (editabil). Trimiterea rămâne mereu o decizie a
 * utilizatorului, nu se trimite nimic automat. Vezi TyreWhatsappButton (Cauciucuri)
 * pentru același tipar.
 */
export function CarpetWhatsappButton({ clientId, phone, defaultMessage, subtitle, onSent }: Props) {
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
