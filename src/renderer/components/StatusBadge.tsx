import { Badge } from '@mantine/core';
import { followupStatusLabels, type FollowupStatus } from '../../shared/schemas/followup';

const statusColor: Record<FollowupStatus, string> = {
  pending: 'orange',
  contacted: 'blue',
  scheduled: 'green',
  completed: 'teal',
  cancelled: 'gray',
};

export function FollowupStatusBadge({ status }: { status: FollowupStatus }) {
  return (
    <Badge color={statusColor[status]} variant="light">
      {followupStatusLabels[status]}
    </Badge>
  );
}

/** Badge pentru zile rămase: roșu = restant, portocaliu ≤ 7, galben ≤ 30, verde altfel. */
export function DaysRemainingBadge({ days }: { days: number }) {
  const color = days < 0 ? 'red' : days <= 7 ? 'orange' : days <= 30 ? 'yellow' : 'green';
  const label =
    days < 0
      ? `Restant cu ${-days} ${-days === 1 ? 'zi' : 'zile'}`
      : days === 0
        ? 'Astăzi'
        : `${days} ${days === 1 ? 'zi' : 'zile'}`;
  return (
    <Badge color={color} variant="light">
      {label}
    </Badge>
  );
}
