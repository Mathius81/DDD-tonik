import { useEffect, useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Group,
  Select,
  Textarea,
  Text,
  Alert,
  SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { ddd } from '../../api/ddd';
import { runMutation, unwrap } from '../../api/useIpc';
import type { FollowupListItem } from '../../../shared/schemas/followup';
import type { Contact } from '../../../shared/schemas/contact';

interface Props {
  followup: FollowupListItem | null;
  onClose: () => void;
  onSent: () => void;
}

/**
 * Trimitere mesaj pentru un follow-up:
 * - WhatsApp asistat: deschide conversația cu mesajul pregătit; utilizatorul apasă Send manual;
 * - Email: trimite prin SMTP-ul configurat.
 */
export function SendMessageModal({ followup, onClose, onSent }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string | null>(null);
  const [channel, setChannel] = useState<'whatsapp' | 'email'>('whatsapp');
  const [body, setBody] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!followup) return;
    unwrap<Contact[]>(
      ddd.contacts.listByAssociation({ association_id: followup.association_id }),
    ).then(
      (list) => {
        setContacts(list);
        const primary = list.find((c) => c.is_primary) ?? list[0];
        if (primary) setContactId(String(primary.id));
      },
    );
  }, [followup]);

  // Previzualizare mesaj generat din template, cu variabilele completate în main.
  useEffect(() => {
    if (!followup || !contactId) return;
    setLoadingPreview(true);
    unwrap<{ body: string }>(
      ddd.messages.preview({
        contact_id: Number(contactId),
        followup_id: followup.id,
        channel,
      }),
    )
      .then((r) => setBody(r.body))
      .catch(() => setBody(''))
      .finally(() => setLoadingPreview(false));
  }, [followup, contactId, channel]);

  if (!followup) return null;

  const contact = contacts.find((c) => String(c.id) === contactId);
  const channelBlocked =
    contact &&
    (contact.do_not_contact ||
      (channel === 'whatsapp' && (!contact.allow_whatsapp || !contact.phone)) ||
      (channel === 'email' && (!contact.allow_email || !contact.email)));

  const blockReason = !contact
    ? null
    : contact.do_not_contact
      ? 'Contactul este marcat „Nu contacta”.'
      : channel === 'whatsapp' && !contact.phone
        ? 'Contactul nu are număr de telefon.'
        : channel === 'whatsapp' && !contact.allow_whatsapp
          ? 'Contactul nu permite WhatsApp.'
          : channel === 'email' && !contact.email
            ? 'Contactul nu are adresă de email.'
            : channel === 'email' && !contact.allow_email
              ? 'Contactul nu permite email.'
              : null;

  const send = async () => {
    const result = await runMutation<{ status: string }>(
      ddd.messages.send({
        contact_id: Number(contactId),
        followup_id: followup.id,
        channel,
        body_override: body || null,
      }),
    );
    if (result) {
      notifications.show({
        color: 'teal',
        message:
          channel === 'whatsapp'
            ? 'WhatsApp s-a deschis cu mesajul pregătit. Apasă Send în WhatsApp, apoi confirmă trimiterea din pagina Mesaje.'
            : result.status === 'prepared'
              ? 'Aplicația de email s-a deschis cu mesajul pregătit. Trimite-l, apoi confirmă din pagina Mesaje.'
              : 'Emailul a fost trimis.',
      });
      onSent();
    }
  };

  return (
    <Modal opened onClose={onClose} title="Trimite mesaj" size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {followup.association_name} · {followup.service_name}
        </Text>
        <Select
          label="Destinatar"
          data={contacts.map((c) => ({
            value: String(c.id),
            label: `${c.name}${c.phone ? ` (${c.phone})` : ''}`,
          }))}
          value={contactId}
          onChange={setContactId}
        />
        <SegmentedControl
          value={channel}
          onChange={(v) => setChannel(v as 'whatsapp' | 'email')}
          data={[
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'email', label: 'Email' },
          ]}
        />
        {blockReason && (
          <Alert color="red" variant="light">
            {blockReason}
          </Alert>
        )}
        <Textarea
          label="Mesaj"
          autosize
          minRows={6}
          value={body}
          onChange={(e) => setBody(e.currentTarget.value)}
          disabled={loadingPreview}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={send} disabled={!contactId || !!channelBlocked || !body.trim()}>
            {channel === 'whatsapp' ? 'Deschide WhatsApp' : 'Trimite email'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
