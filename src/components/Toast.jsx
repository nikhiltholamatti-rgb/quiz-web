import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Toast component with high-contrast warning design and aria-live support
 */
export function Toast({ message, type = 'danger', isVisible = false, onDismiss }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          role="alert"
          aria-live="assertive"
          className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-sm pointer-events-none"
        >
          <div
            className={`px-4 py-3 border shadow-lg flex items-center gap-3 backdrop-blur-md ${
              type === 'danger'
                ? 'bg-red-950/90 border-red-500 text-red-200 shadow-red-900/50'
                : 'bg-cyan-950/90 border-cyan-500 text-cyan-200 shadow-cyan-900/50'
            }`}
          >
            {/* Pulsing warning icon */}
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 animate-ping flex-shrink-0" />
            <div className="flex-1 font-mono text-sm tracking-wide font-bold uppercase">
              {message}
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="pointer-events-auto text-xs opacity-70 hover:opacity-100 text-white"
                aria-label="Dismiss alert"
              >
                ✕
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
