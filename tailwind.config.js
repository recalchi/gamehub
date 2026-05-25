/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"Rajdhani"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif']
      },
      colors: {
        ink: {
          950: '#05060a',
          900: '#0a0c14',
          800: '#11141f',
          700: '#1a1f2e',
          600: '#222838'
        },
        // accent.DEFAULT reads from a CSS variable so we can re-theme at
        // runtime when the user changes their accent color in Settings.
        // The variable carries `R G B` (space-separated) per Tailwind's
        // arbitrary-color recipe; alpha is filled in by `<alpha-value>`.
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          glow: 'rgb(var(--accent-glow) / <alpha-value>)',
          warm: '#f59e0b',
          danger: '#f87171'
        }
      },
      backgroundImage: {
        'radial-fade':
          'radial-gradient(ellipse at top, rgba(94,234,212,0.15), transparent 60%)',
        'mesh':
          'radial-gradient(at 0% 0%, rgba(34,211,238,0.18), transparent 50%), radial-gradient(at 100% 0%, rgba(168,85,247,0.18), transparent 50%), radial-gradient(at 50% 100%, rgba(94,234,212,0.12), transparent 60%)'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: 0 }, '100%': { opacity: 1 } },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(20px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' }
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 30px rgba(94,234,212,0.35)' },
          '50%': { boxShadow: '0 0 60px rgba(94,234,212,0.7)' }
        },
        drift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(20px, -10px) scale(1.05)' }
        }
      },
      animation: {
        fadeIn: 'fadeIn 600ms ease-out forwards',
        slideUp: 'slideUp 500ms ease-out forwards',
        pulseGlow: 'pulseGlow 3s ease-in-out infinite',
        drift: 'drift 8s ease-in-out infinite'
      }
    }
  },
  plugins: []
}
