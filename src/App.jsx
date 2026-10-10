import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { isSupabaseConfigured } from './lib/supabase';
import { Corners } from './components/Corners';
import { Scanlines } from './components/Scanlines';
import Play from './pages/Play';
import Host from './pages/Host';
import NotFound from './pages/NotFound';

// Lazy-load R3F 3D SceneBackground so the form and UI load instantaneously
const SceneBackground = lazy(() => import('./components/SceneBackground'));

/**
 * On-screen crash view if Supabase environment variables are missing
 */
function MissingEnvScreen() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-[#04070f] text-slate-100 z-50 relative font-mono">
      <Corners
        label="SYS//CRITICAL_FAULT"
        nodeId="CONFIG_ERROR"
        accent="red"
        className="w-full max-w-xl p-8"
      >
        <div className="flex items-center gap-3 mb-4">
          <span className="w-3.5 h-3.5 rounded-full bg-red-500 animate-ping" />
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-red-400 tracking-wider">
            CONFIGURATION REQUIRED
          </h1>
        </div>

        <p className="text-slate-300 text-sm mb-4 leading-relaxed">
          The application cannot communicate with Supabase. Mandatory environment variables
          are either missing or have placeholder values.
        </p>

        <div className="bg-slate-950 p-4 border border-red-500/30 text-xs text-red-300 font-mono space-y-2 mb-6">
          <div>MISSING / INCOMPLETE:</div>
          <div className="text-slate-400">• VITE_SUPABASE_URL (must start with https://)</div>
          <div className="text-slate-400">• VITE_SUPABASE_ANON_KEY (Supabase anonymous public JWT key)</div>
        </div>

        <div className="space-y-3 text-xs text-slate-400 border-t border-cyan-500/20 pt-4">
          <div className="font-bold text-cyan-400 uppercase">How to resolve:</div>
          <div>
            1. Copy <code className="text-cyan-300">.env.example</code> to <code className="text-cyan-300">.env</code> in the project root.
          </div>
          <div>
            2. Fill in your project URL and anon public key from your Supabase Dashboard (<span className="text-slate-300">Project Settings → API</span>).
          </div>
          <div>
            3. On Vercel: Add them under <span className="text-slate-300">Settings → Environment Variables</span> and redeploy.
          </div>
        </div>
      </Corners>
    </div>
  );
}

export default function App() {
  // If Supabase environment variables are missing, display the critical crash screen
  if (!isSupabaseConfigured) {
    return <MissingEnvScreen />;
  }

  return (
    <div className="relative min-h-[100dvh] bg-[#04070f] text-slate-100 overflow-x-hidden">
      {/* 3D Wireframe Scene Background (fixed, pointer-events: none, lazy loaded) */}
      <Suspense fallback={null}>
        <SceneBackground />
      </Suspense>

      {/* Cybernetic Scanlines & Vignette */}
      <Scanlines />

      {/* Application Routes */}
      <Routes>
        <Route path="/" element={<Navigate to="/play" replace />} />
        <Route path="/play" element={<Play />} />
        <Route path="/host" element={<Host />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
