/**
 * Tonik — DDD Manager
 * Copyright © 2026 Marius Constantinescu. Toate drepturile rezervate.
 * Autor: Marius Constantinescu <mc.constantinescu1981@gmail.com>
 *
 * Creație originală, scrisă pentru nevoile reale ale firmei — nu un produs
 * preluat sau adaptat. Cod proprietar; vezi LICENSE. Reutilizarea, copierea
 * sau distribuirea fără acordul scris al autorului sunt interzise.
 */
import logoUrl from '../assets/tonik-logo.png';

/** Logo-ul Tonik, încadrat compact (max 44px înălțime — Brief §5.1). */
export function TonikLogo() {
  return (
    <div style={{ textAlign: 'center' }}>
      <img
        src={logoUrl}
        alt="Tonik"
        style={{
          width: '100%',
          maxWidth: 190,
          height: 'auto',
          display: 'block',
          margin: '0 auto',
          filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.4))',
        }}
      />
    </div>
  );
}
