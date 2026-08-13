import { Stack, Text, Button, Center } from '@mantine/core';

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <Center py="xl">
      <Stack align="center" gap="sm">
        <Text fw={600} size="lg">
          {title}
        </Text>
        {description && (
          <Text c="dimmed" ta="center">
            {description}
          </Text>
        )}
        {actionLabel && onAction && <Button onClick={onAction}>{actionLabel}</Button>}
      </Stack>
    </Center>
  );
}
