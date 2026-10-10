import React from 'react';

/**
 * Cybernetic Corner Brackets & HUD Card Framing
 * Avoids generic rounded-3xl cards and gives a crisp, military/tech event HUD aesthetic.
 */
export function Corners({
  children,
  className = '',
  label = null,
  nodeId = null,
  accent = 'cyan', // 'cyan' | 'amber' | 'blue' | 'red'
  showBrackets = true,
}) {
  const accentBorder = {
    cyan: 'border-cyan-500/30 hover:border-cyan-500/50',
    amber: 'border-amber-500/40 hover:border-amber-500/60',
    blue: 'border-blue-500/40 hover:border-blue-500/60',
    red: 'border-red-500/50 hover:border-red-500/70',
  }[accent] || 'border-cyan-500/30';

  const bracketColor = {
    cyan: 'border-cyan-400',
    amber: 'border-amber-400',
    blue: 'border-blue-400',
    red: 'border-red-400',
  }[accent] || 'border-cyan-400';

  const badgeColor = {
    cyan: 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80',
    amber: 'text-amber-400 bg-amber-950/60 border-amber-800/80',
    blue: 'text-blue-400 bg-blue-950/60 border-blue-800/80',
    red: 'text-red-400 bg-red-950/60 border-red-800/80',
  }[accent] || 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80';

  return (
    <div
      className={`relative border bg-[#060d1d]/85 backdrop-blur-md transition-colors ${accentBorder} ${className}`}
    >
      {/* 4 Corner Brackets */}
      {showBrackets && (
        <>
          <span className={`pointer-events-none absolute -top-[1px] -left-[1px] w-2.5 h-2.5 border-t-2 border-l-2 ${bracketColor}`} />
          <span className={`pointer-events-none absolute -top-[1px] -right-[1px] w-2.5 h-2.5 border-t-2 border-r-2 ${bracketColor}`} />
          <span className={`pointer-events-none absolute -bottom-[1px] -left-[1px] w-2.5 h-2.5 border-b-2 border-l-2 ${bracketColor}`} />
          <span className={`pointer-events-none absolute -bottom-[1px] -right-[1px] w-2.5 h-2.5 border-b-2 border-r-2 ${bracketColor}`} />
        </>
      )}

      {/* Header telemetry / status badge */}
      {(label || nodeId) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-cyan-500/20 bg-slate-950/40 text-[10px] uppercase tracking-wider font-mono select-none">
          {label && (
            <span className={`inline-flex items-center gap-1.5 px-1.5 py-0.5 border ${badgeColor}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              {label}
            </span>
          )}
          {nodeId && (
            <span className="text-slate-400 font-mono tracking-widest text-[9px]">
              {nodeId}
            </span>
          )}
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
