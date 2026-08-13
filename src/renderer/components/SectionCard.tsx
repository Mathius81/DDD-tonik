import type { ReactNode } from 'react';
import { Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  children: ReactNode;
  /** Conținut aliniat în dreapta titlului (ex. badge de status). */
  titleRight?: ReactNode;
  maw?: number | string;
}

/** Card standard de secțiune: titlu, descriere, conținut — folosit în Setări și formulare. */
export function SectionCard({ title, description, icon, titleRight, children, maw }: SectionCardProps) {
  return (
    <Card withBorder shadow="sm" padding="xl" maw={maw}>
      {(title || description) && (
        <Group justify="space-between" align="flex-start" mb="lg" wrap="nowrap">
          <Group gap="md" wrap="nowrap" align="flex-start">
            {icon && (
              <ThemeIcon variant="light" color="tonik" size={40} radius="md">
                {icon}
              </ThemeIcon>
            )}
            <Stack gap={2}>
              {title && (
                <Text fw={650} size="md">
                  {title}
                </Text>
              )}
              {description && (
                <Text size="sm" c="dimmed">
                  {description}
                </Text>
              )}
            </Stack>
          </Group>
          {titleRight}
        </Group>
      )}
      {children}
    </Card>
  );
}
