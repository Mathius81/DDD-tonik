import { followupStatusLabels, type FollowupStatus } from '../../shared/schemas/followup';
import { dueContext } from '../../shared/text';

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const toneStyles: Record<Tone, { bg: string; fg: string }> = {
  success: { bg: 'var(--success-soft)', fg: 'var(--success)' },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)' },
  danger: { bg: 'var(--danger-soft)', fg: 'var(--danger)' },
  neutral: { bg: 'var(--bg-subtle)', fg: 'var(--text-muted)' },
  info: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
};

/** Badge de status generic pe tokenii de stare (Brief §4). */
export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const s = toneStyles[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        background: s.bg,
        color: s.fg,
        fontSize: 'var(--fs-small)',
        fontWeight: 550,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

const followupTone: Record<FollowupStatus, Tone> = {
  pending: 'warning',
  contacted: 'info',
  scheduled: 'success',
  completed: 'success',
  cancelled: 'neutral',
};

export function FollowupStatusBadge({ status }: { status: FollowupStatus }) {
  return <StatusBadge tone={followupTone[status]}>{followupStatusLabels[status]}</StatusBadge>;
}

/** Badge pentru zile rămase, pe regulile de urgență din brief. */
export function DaysRemainingBadge({ days }: { days: number }) {
  const { label, urgency } = dueContext(days);
  const tone: Tone = urgency === 'overdue' ? 'danger' : urgency === 'soon' ? 'warning' : 'neutral';
  return <StatusBadge tone={tone}>{label}</StatusBadge>;
}
