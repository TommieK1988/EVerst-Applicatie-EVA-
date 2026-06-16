/**
 * Gedeelde Tailwind preset voor Everts Platform.
 * Apps extenden via `presets: [require('@everts/config/tailwind.config.base.js')]`.
 * Apps definiëren zelf hun `content` paths (die verschillen per app).
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    // ── Breakpoints ────────────────────────────────────────────────────
    // We gebruiken bewust de Tailwind-defaults (NIET overschrijven, anders
    // vervalt de hele set). Conventie binnen EVA:
    //   sm  640px  · grote telefoon landscape
    //   md  768px  · tablet-portret — grens desktop ↔ mobiel
    //   lg  1024px · tablet-landscape / kleine laptop
    //   xl  1280px · desktop
    //   2xl 1536px · breed desktop
    // De JS-shell (PlatformShell) schakelt naar mobiele modus onder md via
    // useIsMobile() (max-width: 767px). Houd CSS- en JS-grens gelijk.
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-montserrat)', 'Montserrat', 'Calibri', 'Avenir', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // shadcn/radix tokens (vereisen CSS variabelen in globals.css)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // ── EVA Design System · Brand Identity System 2026 ──────────────
        brand: {
          50:      '#ecfaf0',
          100:     '#d2f2dd',
          200:     '#a5e4ba',
          300:     '#6dd190',
          400:     '#28a44a',   // officieel mid-groen
          500:     '#009439',   // officieel primair
          600:     '#007530',
          700:     '#0a5e28',
          800:     '#054f2e',
          900:     '#013a20',
          950:     '#012215',
          lime:    '#61ac2b',   // lime-accent: campagne, social, highlights
          dark:    '#1f2933',   // officieel donker (brand-dark)
          DEFAULT: '#009439',
        },

        // ── EVA Design System · Neutrals (koel slate) ───────────────────
        neutral: {
          0:   '#ffffff',
          50:  '#f8fafa',
          100: '#f1f4f5',
          200: '#e3e8ea',
          300: '#cbd2d6',
          400: '#9aa4ab',
          500: '#6b757c',
          600: '#4d575e',
          700: '#364048',
          800: '#232a30',
          900: '#161b20',
          950: '#1f2933',
        },

        // ── EVA Design System · Status colors ───────────────────────────
        success: {
          50:  '#ecfdf3',
          100: '#d1fadf',
          300: '#6ce9a6',
          500: '#12b76a',
          700: '#027a48',
          900: '#054f31',
        },
        warning: {
          50:  '#fff6ec',
          100: '#ffe6cc',
          300: '#ffb866',
          500: '#f08000',
          700: '#b85a00',
          900: '#6b3400',
        },
        error: {
          50:  '#fef3f2',
          100: '#fee4e2',
          300: '#fda29b',
          500: '#e8453b',
          700: '#b42318',
          900: '#7a271a',
        },
        info: {
          50:  '#eff8ff',
          100: '#d1e9ff',
          300: '#84caff',
          500: '#2e90fa',
          700: '#175cd3',
          900: '#194185',
        },

        // ── EVA Design System · Domein · Calculatie kolomgroepen ─────────
        calc: {
          ab:  '#1f6feb',   // Aanneemsom
          ma:  '#c2185b',   // Materialen
          oa:  '#7b1fa2',   // Onderaanneming
          kp:  '#009439',   // Kostprijs (brand)
          vp:  '#057a5c',   // Verkoopprijs
          btw: '#b85a00',   // BTW
        },

        // ── EVA Design System · Domein · Planning crew (deterministisch) ──
        crew: {
          1: '#7c3aed',   // paars
          2: '#0f9b8e',   // teal
          3: '#2f9e44',   // groen
          4: '#1f8a5b',   // donkergroen
          5: '#f59e0b',   // amber
          6: '#3b82f6',   // blauw
        },

        // ── EVA Design System · Chart-palet (green-forward) ──────────────
        chart: {
          1: '#009439',
          2: '#28a44a',
          3: '#61ac2b',
          4: '#2e90fa',
          5: '#f08000',
          6: '#e8453b',
        },

        // ── Legacy alias (backward compat bestaande components) ──────────
        everts: {
          50:      '#ecfaf0',
          100:     '#d2f2dd',
          200:     '#a5e4ba',
          lime:    '#61ac2b',   // marge-groen (DS: >20%)
          dark:    '#1f2933',   // brand-dark (TotalsBar achtergrond)
          DEFAULT: '#009439',   // brand-500
          light:   '#28a44a',   // brand-400
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 1400ms ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
