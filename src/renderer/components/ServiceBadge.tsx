import { serviceColor } from './serviceColors';

/**
 * Badge de serviciu (Brief §4): punct colorat 6px + text,
 * fundal soft, folosit fără excepție oriunde apare un serviciu.
 */
export function ServiceBadge({ name }: { name: string }) {
  const { color, soft } = serviceColor(name);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        background: soft,
        color,
        fontSize: 'var(--fs-small)',
        fontWeight: 550,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      {name}
    </span>
  );
}

/** Doar punctul colorat, pentru spații înguste (calendar, listă compactă). */
export function ServiceDot({ name, size = 8 }: { name: string; size?: number }) {
  const { color } = serviceColor(name);
  return (
    <span
      title={name}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  );
}
