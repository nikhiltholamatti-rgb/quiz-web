import React from 'react';

/**
 * Scanlines and subtle CRT film noise overlay.
 * Hardware-accelerated, pointer-events: none, respects reduced motion.
 */
export function Scanlines() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-40 overflow-hidden select-none"
    >
      {/* Scanline pattern */}
      <div className="absolute inset-0 cyber-scanlines opacity-40" />

      {/* Subtle vignette around edges */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(2,5,15,0.7)_100%)]" />
    </div>
  );
}
