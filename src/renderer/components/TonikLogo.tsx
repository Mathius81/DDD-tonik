import { Group, Text } from '@mantine/core';

/** Marca Tonik: monogramă T pe pastilă teal + wordmark. */
export function TonikLogo({ compact = false }: { compact?: boolean }) {
  return (
    <Group gap={10} wrap="nowrap">
      <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
        <rect width="34" height="34" rx="9" fill="#14b8a0" />
        <path
          d="M9.5 12.4h15v3.4h-5.6v9.8h-3.8v-9.8H9.5z"
          fill="#0d1a18"
          opacity="0.92"
        />
      </svg>
      {!compact && (
        <div>
          <Text fw={700} size="lg" c="white" lh={1.15} style={{ letterSpacing: '-0.02em' }}>
            Tonik
          </Text>
          <Text size="10px" c="#6e837f" fw={550} tt="uppercase" style={{ letterSpacing: '0.08em' }}>
            Manager intervenții
          </Text>
        </div>
      )}
    </Group>
  );
}
