import { useState } from 'react';
import { Button, Group, Table, NumberInput, Select, Switch, Text } from '@mantine/core';
import { IconBellRinging, IconPlus, IconTrash } from '@tabler/icons-react';
import { ddd } from '../../api/ddd';
import { runMutation } from '../../api/useIpc';
import { SectionCard } from '../../components/SectionCard';
import type { Settings } from '../../../shared/schemas/settings';
import { reminderChannelLabels, type ReminderRule } from '../../../shared/schemas/reminder';

export function RemindereTab({ settings, onSaved }: { settings: Settings; onSaved: () => void }) {
  const [rules, setRules] = useState<ReminderRule[]>(settings.reminder_rules);

  const updateRule = (index: number, patch: Partial<ReminderRule>) => {
    setRules((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    const saved = await runMutation(
      ddd.settings.update({ ...settings, reminder_rules: rules }),
      'Regulile de reminder au fost salvate.',
    );
    if (saved) onSaved();
  };

  return (
    <SectionCard
      title="Reguli de reminder"
      description="Pentru fiecare intervenție viitoare se generează automat câte un reminder cu numărul de zile ales înainte de scadență. Regulile se aplică intervențiilor înregistrate de acum înainte."
      icon={<IconBellRinging size={21} stroke={1.7} />}
    >
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Zile înainte</Table.Th>
            <Table.Th>Canal</Table.Th>
            <Table.Th>Activ</Table.Th>
            <Table.Th></Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map((rule, i) => (
            <Table.Tr key={i}>
              <Table.Td>
                <NumberInput
                  value={rule.offset_days}
                  min={0}
                  max={365}
                  w={110}
                  onChange={(v) => updateRule(i, { offset_days: Number(v) || 0 })}
                />
              </Table.Td>
              <Table.Td>
                <Select
                  value={rule.channel}
                  w={210}
                  data={Object.entries(reminderChannelLabels).map(([value, label]) => ({
                    value,
                    label,
                  }))}
                  onChange={(v) => v && updateRule(i, { channel: v as ReminderRule['channel'] })}
                />
              </Table.Td>
              <Table.Td>
                <Switch
                  checked={rule.active}
                  onChange={(e) => updateRule(i, { active: e.currentTarget.checked })}
                />
              </Table.Td>
              <Table.Td align="right">
                <Button
                  size="compact-sm"
                  variant="subtle"
                  color="red"
                  px={6}
                  aria-label="Șterge regula"
                  onClick={() => setRules((rs) => rs.filter((_, j) => j !== i))}
                >
                  <IconTrash size={16} />
                </Button>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

      {rules.length === 0 && (
        <Text size="sm" c="dimmed" py="md">
          Nu există reguli — reminderele nu se vor genera automat.
        </Text>
      )}

      <Group justify="space-between" mt="md">
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() =>
            setRules((rs) => [...rs, { offset_days: 7, channel: 'whatsapp', active: true }])
          }
        >
          Adaugă regulă
        </Button>
        <Button onClick={save}>Salvează</Button>
      </Group>
    </SectionCard>
  );
}
