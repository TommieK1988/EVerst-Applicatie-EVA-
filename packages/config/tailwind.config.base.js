/**
 * Gedeelde Tailwind preset voor Everts Platform.
 * Apps extenden via `presets: [require('@everts/config/tailwind.config.base.js')]`.
 * Apps definiëren zelf hun `content` paths (die verschillen per app).
 */
const GREY_STEPS = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/**
 * Grijsschaal als CSS-variabelen i.p.v. vaste hex-waarden.
 * `prefix` is n (neutral), s (slate) of g (gray); de variabelen zelf staan in
 * globals.css. De `<alpha-value>`-vorm houdt Tailwind-opacity (`bg-neutral-100/50`)
 * werkend — met een kale `var()` zou dat stilzwijgend breken.
 */
function greyScale(prefix, role = '') {
  const out = {}
  for (const step of GREY_STEPS) {
    out[step] = `rgb(var(--${prefix}${role}-${step}) / <alpha-value>)`
  }
  return out
}

/**
 * Tekstschaal: identiek aan de oppervlakschaal t/m 600, maar 700–950 wijzen naar
 * de omgekeerde `--*t-*`-variabelen. Zo wordt `text-neutral-900` in donkere modus
 * bijna-wit terwijl `bg-neutral-900` donker blijft.
 */
function greyTextScale(prefix) {
  const out = greyScale(prefix)
  for (const step of [700, 800, 900, 950]) {
    out[step] = `rgb(var(--${prefix}t-${step}) / <alpha-value>)`
  }
  return out
}

/** Statusschaal (success/warning/error/info) — zelfde principe als greyScale. */
function statusScale(prefix) {
  const out = {}
  for (const step of [50, 100, 300, 500, 700, 900]) {
    out[step] = `rgb(var(--${prefix}-${step}) / <alpha-value>)`
  }
  return out
}

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
        // De grijsschalen lopen via CSS-variabelen zodat ze in donkere modus
        // kantelen. Zie globals.css (§ Grijsschalen). In lichte modus zijn de
        // waarden exact gelijk aan de oude hardcoded hex-waarden.
        //
        // `colors` is de OPPERVLAK-schaal: hij voedt bg-, border-, ring- en
        // divide-utilities. In donkere modus draaien 0–600 om (licht vlak →
        // donker vlak) maar blijven 700–950 donker, want `bg-slate-900
        // text-white` is een bewust donkere chip die donker moet blijven.
        // De TEKST-schaal staat los in `textColor` hieronder.
        neutral: greyScale('n'),
        slate:   greyScale('s'),
        gray:    greyScale('g'),

        // ── EVA Design System · Status colors ───────────────────────────
        // Ook via CSS-variabelen: een `bg-warning-50 text-warning-700`-badge
        // moet in donkere modus een gedempt vlak met lichte tekst worden,
        // niet het room-op-oranje van de lichte modus.
        success: statusScale('su'),
        warning: statusScale('wa'),
        error:   statusScale('er'),
        info:    statusScale('in'),

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
      // Tekstkleuren wijken af van de oppervlakschaal in het 700–950-bereik
      // (zie greyTextScale). `text-white` blijft bewust echt wit: dat is het
      // label op groene/gekleurde knoppen, geen thema-afhankelijk vlak.
      textColor: {
        neutral: greyTextScale('n'),
        slate:   greyTextScale('s'),
        gray:    greyTextScale('g'),
      },
      // `bg-white` is in de praktijk "kaartvlak", niet "de kleur wit". In
      // donkere modus wordt dat het verhoogde oppervlak. Wie écht papierwit
      // nodig heeft (PDF-/offertepreview) gebruikt `bg-paper`.
      backgroundColor: {
        white: 'rgb(var(--surface-white) / <alpha-value>)',
        paper: '#ffffff',
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
