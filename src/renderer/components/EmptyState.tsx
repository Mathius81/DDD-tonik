import type { ReactNode } from 'react';
import { Stack, Text, Button, Center, ThemeIcon } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function EmptyState({ title, description, actionLabel, onAction, icon }: EmptyStateProps) {
  return (
    <Center py={56}>
      <Stack align="center" gap="sm" maw={380}>
        <ThemeIcon variant="light" color="gray" size={56} radius="xl">
          {icon ?? <IconInbox size={28} stroke={1.5} />}
        </ThemeIcon>
        <Text fw={600} size="lg" ta="center">
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center" size="sm">
            {description}
          </Text>
        )}
        {actionLabel && onAction && (
          <Button onClick={onAction} mt={6}>
            {actionLabel}
          </Button>
        )}
      </Stack>
    </Center>
  );
}
