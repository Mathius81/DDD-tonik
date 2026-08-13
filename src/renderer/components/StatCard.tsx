import type { ReactNode } from 'react';
import { Card, Group, Stack, Text, ThemeIcon } from '@mantine/core';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: ReactNode;
  color: string;
  onClick?: () => void;
  /** Evidențiere pentru valori care cer atenție (ex. restante > 0). */
  emphasized?: boolean;
}

/** Card KPI pentru dashboard. */
export function StatCard({ label, value, icon, color, onClick, emphasized }: StatCardProps) {
  return (
    <Card
      withBorder
      shadow="xs"
      padding="lg"
      className={onClick ? 'tonik-hover-card' : undefined}
      onClick={onClick}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        borderColor: emphasized ? `var(--mantine-color-${color}-3)` : undefined,
        backgroundColor: emphasized ? `var(--mantine-color-${color}-0)` : undefined,
      }}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={6}>
          <Text size="sm" c="dimmed" fw={500}>
            {label}
          </Text>
          <Text fz={30} fw={700} lh={1} style={{ letterSpacing: '-0.02em' }}>
            {value}
          </Text>
        </Stack>
        <ThemeIcon variant="light" color={color} size={42} radius="md">
          {icon}
        </ThemeIcon>
      </Group>
    </Card>
  );
}
