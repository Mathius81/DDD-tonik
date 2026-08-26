/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import { Stack, Card } from '@mantine/core';
import { IconWheel } from '@tabler/icons-react';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState } from '../../components/EmptyState';

interface Props {
  title: string;
}

/**
 * Placeholder pentru spațiul de lucru Cauciucuri — scheletul de navigare e
 * gata, dar modelul de date (clienți, mașini, programări etc.) vine
 * într-o fază viitoare.
 */
export function CauciucuriPlaceholder({ title }: Props) {
  return (
    <Stack gap="var(--sp-4)">
      <PageHeader title={title} description="Spațiul de lucru Cauciucuri." />
      <Card padding="var(--sp-6)">
        <EmptyState
          icon={<IconWheel size={28} stroke={1.5} />}
          title="Secțiunea urmează."
          description={`„${title}” din spațiul Cauciucuri este în lucru și va fi disponibilă într-o versiune viitoare a aplicației.`}
        />
      </Card>
    </Stack>
  );
}
