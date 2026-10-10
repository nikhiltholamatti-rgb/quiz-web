import React from 'react';
import { Link } from 'react-router-dom';
import { Corners } from '../components/Corners';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 relative z-10">
      <Corners
        label="ERR//404"
        nodeId="ROUTE_NOT_FOUND"
        accent="red"
        className="w-full max-w-md p-8 text-center"
      >
        <div className="font-heading text-4xl text-red-400 font-bold mb-2 tracking-widest">
          SYSTEM FAULT 404
        </div>
        <p className="text-slate-400 font-mono text-sm mb-6">
          The requested coordinate does not exist in the cyber mainframe matrix.
        </p>

        <div className="p-3 mb-6 bg-red-950/30 border border-red-800/40 text-xs text-red-300 font-mono">
          STATUS: UNRECOGNIZED ROUTE DISPATCH
        </div>

        <Link
          to="/play"
          className="inline-flex items-center justify-center w-full px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold font-heading uppercase tracking-wider text-sm transition-colors shadow-cyan-sm"
        >
          Return to Player Terminal →
        </Link>
      </Corners>
    </div>
  );
}
