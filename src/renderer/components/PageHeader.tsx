import type { ReactNode } from 'react';
import { Group, Stack, Text, Title } from '@mantine/core';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Header standard de pagină: titlu + descriere scurtă + acțiuni în dreapta. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-start" wrap="nowrap" mb={4}>
      <Stack gap={4}>
        <Title order={2} style={{ letterSpacing: '-0.02em' }}>
          {title}
        </Title>
        {description && (
          <Text size="sm" c="dimmed" maw={720}>
            {description}
          </Text>
        )}
      </Stack>
      {actions && <Group gap="sm">{actions}</Group>}
    </Group>
  );
}
