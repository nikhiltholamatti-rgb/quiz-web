/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: "#04070f",
          surface: "rgba(6, 13, 29, 0.75)",
          card: "rgba(10, 20, 42, 0.85)",
          border: "rgba(34, 211, 238, 0.2)",
          borderBright: "rgba(34, 211, 238, 0.6)",
          cyan: "#22d3ee",
          cyanGlow: "rgba(34, 211, 238, 0.4)",
          blue: "#2563eb",
          amber: "#f5a524",
          red: "#ef4444",
          textMuted: "#64748b",
          textDim: "#94a3b8",
        }
      },
      fontFamily: {
        heading: ["'Chakra Petch'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      boxShadow: {
        'cyan-sm': '0 0 10px rgba(34, 211, 238, 0.25)',
        'cyan-md': '0 0 20px rgba(34, 211, 238, 0.35)',
        'cyan-lg': '0 0 35px rgba(34, 211, 238, 0.5)',
        'amber-md': '0 0 20px rgba(245, 165, 36, 0.4)',
      },
      animation: {
        'pulse-fast': 'pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flicker': 'flicker 0.15s ease-in-out',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        flicker: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100%)' },
        }
      }
    },
  },
  plugins: [],
}
