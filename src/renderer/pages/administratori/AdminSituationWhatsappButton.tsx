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
import { runMutation, unwrap } from '../../api/useIpc';

interface Props {
  /** Telefonul (orice format) al persoanei — cheia după care se caută grupul în main. */
  phone: string;
  /** Etichetă afișată pe buton; fără ea se randează doar o iconiță (potrivit pentru tabele/carduri compacte). */
  label?: string;
  /** Subtitlu afișat în modal (ex. numele + numărul de asociații). */
  subtitle?: string;
  /** Apelat după o trimitere reușită (ex. reîncarcă pagina). */
  onSent?: () => void;
}

/**
 * Trimite situația AGREGATĂ a tuturor asociațiilor unei persoane (identificată după
 * telefon) — un singur mesaj WhatsApp cu starea fiecărei asociații, în loc de mai multe
 * mesaje separate (cerința clientului: „să văd ce a făcut și ce nu a făcut”).
 * Mod asistat, la fel ca `TyreWhatsappButton`: deschide wa.me cu textul pregătit
 * (editabil), utilizatorul apasă Send manual — nimic nu pleacă automat.
 */
export function AdminSituationWhatsappButton({ phone, label, subtitle, onSent }: Props) {
  const [opened, setOpened] = useState(false);
  const [message, setMessage] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [sending, setSending] = useState(false);

  const open = async () => {
    setOpened(true);
    setLoadingPreview(true);
    try {
      const { body } = await unwrap<{ body: string }>(ddd.administrators.preview({ phone }));
      setMessage(body);
    } catch {
      setMessage('');
    } finally {
      setLoadingPreview(false);
    }
  };

  const send = async () => {
    if (sending) return; // gardă anti dublu-submit
    setSending(true);
    const result = await runMutation(
      ddd.administrators.whatsapp.send({ phone, message }),
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
        <Tooltip label="Trimite situația tuturor asociațiilor">
          <ActionIcon
            variant="light"
            color="green"
            size="lg"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            aria-label="Trimite situația tuturor asociațiilor"
          >
            <IconBrandWhatsapp size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      <Modal opened={opened} onClose={() => setOpened(false)} title="Trimite situația completă" size="lg">
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
