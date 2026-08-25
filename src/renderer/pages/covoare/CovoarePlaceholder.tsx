import { Stack, Card } from '@mantine/core';
import { IconLayoutGrid } from '@tabler/icons-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

interface Props {
  title: string;
}

/**
 * Placeholder pentru spațiul de lucru Covoare — scheletul de navigare e gata,
 * dar modelul de date (clienți, comenzi etc.) vine într-o fază viitoare.
 */
export function CovoarePlaceholder({ title }: Props) {
  return (
    <Stack gap="var(--sp-4)">
      <PageHeader title={title} description="Spațiul de lucru Covoare." />
      <Card padding="var(--sp-6)">
        <EmptyState
          icon={<IconLayoutGrid size={28} stroke={1.5} />}
          title="Secțiunea urmează."
          description={`„${title}” din spațiul Covoare este în lucru și va fi disponibilă într-o versiune viitoare a aplicației.`}
        />
      </Card>
    </Stack>
  );
}
