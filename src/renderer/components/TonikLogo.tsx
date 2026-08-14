import logoUrl from '../assets/tonik-logo.png';

/** Logo-ul Tonik — imaginea oficială a firmei, pe fundal transparent. */
export function TonikLogo() {
  return (
    <img
      src={logoUrl}
      alt="Tonik — Dezinsecție, Deratizare, Dezinfectare"
      style={{
        width: '100%',
        height: 'auto',
        display: 'block',
        filter: 'drop-shadow(0 4px 14px rgba(0, 0, 0, 0.45))',
      }}
    />
  );
}
