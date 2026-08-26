/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
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
