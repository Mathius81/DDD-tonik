import { fmtDate } from './dateUtils';
import { dueContext } from '../../shared/text';

const urgencyColor = {
  overdue: 'var(--danger)',
  soon: 'var(--warning)',
  normal: 'var(--text-muted)',
} as const;

/**
 * Data absolută + contextul relativ (Brief §4):
 *   13.09.2026 · în 30 de zile
 *   09.08.2026 · restant de 5 zile   (roșu)
 */
export function DueDate({ isoDate, daysRemaining }: { isoDate: string; daysRemaining: number }) {
  const { label, urgency } = dueContext(daysRemaining);
  return (
    <span className="tonik-num" style={{ whiteSpace: 'nowrap', fontSize: 'var(--fs-body)' }}>
      {fmtDate(isoDate)}
      <span style={{ color: urgencyColor[urgency], fontWeight: urgency === 'overdue' ? 600 : 500 }}>
        {' '}
        · {label}
      </span>
    </span>
  );
}
