import logoUrl from '../assets/tonik-logo.png';

/** Logo-ul Tonik, încadrat compact (max 44px înălțime — Brief §5.1). */
export function TonikLogo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <img
        src={logoUrl}
        alt="Tonik"
        style={{
          height: 44,
          width: 'auto',
          display: 'block',
          margin: '0 auto',
          filter: 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))',
        }}
      />
      <div
        style={{
          fontSize: 11,
          color: 'var(--text-on-dark-muted)',
          marginTop: 6,
          letterSpacing: '0.02em',
        }}
      >
        Dezinsecție · Deratizare · Dezinfecție
      </div>
    </div>
  );
}
