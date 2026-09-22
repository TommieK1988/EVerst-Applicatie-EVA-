# Handoff: EVA Design System (Everts Onderhoud &amp; Renovatie)

> **In de repo sinds 22 september 2026.** Dit pakket stond daarvoor los op een
> bureaubladmap, waardoor niet elke werkplek dezelfde spec zag en het toeval was
> of iemand zich eraan hield. De HTML-bestanden open je gewoon in een browser.
>
> `brand-assets/polygon-bg.png` is bewust **niet** meegekopieerd: dat bestand
> staat al byte-identiek in `apps/dashboard/public/`, en de specs verwijzen daar
> nu naar. Eén versie, dus niets dat uit elkaar kan lopen.

## Overview
EVA is een Nederlands B2B-platform voor een onderhoud- en renovatiebedrijf (~140 pagina's:
dossiers, calculaties, planning, wagenpark, houtrotherstel). Dit pakket bevat het complete
design system — 10 hoofdstukken + 2 werkende planning-views — als HTML-referentieontwerpen.

**Tech-doel:** Next.js 14 · Tailwind CSS · Radix UI primitives · Montserrat.

## Over de design-bestanden
De `.html`-bestanden in dit pakket zijn **design-referenties gemaakt in HTML** — prototypes die de
beoogde look, tokens en gedrag tonen. Het zijn **geen** productiebestanden om 1-op-1 te kopiëren.
De taak is om deze ontwerpen **na te bouwen in de bestaande Next.js 14 + Tailwind + Radix omgeving**
volgens de gevestigde patronen daar. Tokens en componentstructuur zijn bewust zo opgezet dat ze
rechtstreeks naar Tailwind-config + CSS-variabelen + React-componenten vertalen.

## Fidelity
**High-fidelity.** Alle kleuren, typografie, spacing, radii, shadows en interacties zijn definitief.
Bouw de UI pixel-getrouw na met de codebase-eigen libraries (Radix + Tailwind). De HTML toont exact
de bedoelde tinten (incl. de pixel-gemeten Everts-greens) en maatvoering.

---

## Design Tokens

### Kleuren — Brand (Everts groen, officieel Brand Identity System 2026)
| Token | Hex | Gebruik |
|---|---|---|
| brand-50  | #ecfaf0 | active-nav bg, badge-bg, soft surfaces |
| brand-100 | #d2f2dd | borders op brand-50 |
| brand-200 | #a5e4ba | outline-badge borders |
| brand-300 | #6dd190 | dark-theme accent tekst |
| brand-400 | #28a44a | mid-groen, dark-theme primary |
| brand-500 | #009439 | **primair** — buttons, focus-ring, active |
| brand-600 | #007530 | primary hover |
| brand-700 | #0a5e28 | primary active / brand-tekst |
| brand-800 | #054f2e | groep-rij bg (calculatie), donker |
| brand-900 | #013a20 | totals-bar bg, diepste |
| brand-lime | #61ac2b | lime-accent (charts, marge &gt;20%, icon-fills) |
| brand-dark | #1f2933 | navy — dark-theme base, icon-outlines |

> Let op: eerder circuleerden #0a7a35 / #154e2f / #8cc63f uit JPEG-screenshots; die zijn vervangen
> door de pixel-gemeten waarden hierboven (#009439 / #054f2e / #61ac2b). Gebruik deze.

### Kleuren — Neutrals (koel slate)
neutral-0 #ffffff · 50 #f8fafa · 100 #f1f4f5 · 200 #e3e8ea · 300 #cbd2d6 · 400 #9aa4ab ·
500 #6b757c · 600 #4d575e · 700 #364048 · 800 #232a30 · 900 #161b20 · 950 #1f2933 (= brand-dark)

### Kleuren — Status (50 bg / 500 accent / 700 tekst)
- success: 50 #ecfdf3 · 500 #12b76a · 700 #027a48
- warning: 50 #fff6ec · 500 #f08000 · 700 #b85a00  (warm oranje, sluit aan op urgentie-tekst)
- error:   50 #fef3f2 · 500 #e8453b · 700 #b42318
- info:    50 #eff8ff · 500 #2e90fa · 700 #175cd3

### Domein-kleuren — Calculatie kolomgroepen
- calc.ab (Aanneemsom) #1f6feb · calc.ma (Materialen) #c2185b · calc.oa (Onderaanneming) #7b1fa2
- calc.kp (Kostprijs) #009439 · calc.vp (Verkoopprijs) #057a5c · calc.btw #b85a00
- Recept per groep: text-kleur + bg-soft (4–5% opacity) + bg-header (8–10% opacity)

### Domein-kleuren — Planning crew (deterministisch, hash op naam → 1 van 6)
plan paars #7c3aed · teal #0f9b8e · groen #2f9e44 · donkergroen #1f8a5b · amber #f59e0b · blauw #3b82f6

### Chart-palet
--chart-1 #009439 · 2 #28a44a · 3 #61ac2b · 4 #2e90fa · 5 #f08000 · 6 #e8453b (green-forward)

### Typografie — Montserrat (400/500/600/700/800), cijfers: tabular-nums + JetBrains Mono fallback
| Token | Size/line | Weight | Tracking |
|---|---|---|---|
| page-title-lg | 44/50 | 700 | -0.025em |
| page-title | 32/38 | 700 | -0.022em |
| h2 | 28/34 | 600 | -0.014em |
| h3 | 22/28 | 600 | -0.01em |
| card-title | 16–18/22–24 | 600 | — |
| body | 14–15/20–22 | 400 | — |
| body-sm | 12.5–13/18–20 | 400 | — |
| section-label (card-header) | 11/16 | 700 | 0.10em UPPERCASE |
| field-label | 10.5/14 | 600 | 0.08em UPPERCASE |
| caption | 11/15 | 500 | — |
| mono (cijfers/ID's) | 13/18–20 | 500 | JetBrains Mono, tabular-nums |

### Spacing — 4px grid
space-1 4 · 1.5 6 · 2 8 · 3 12 · 4 16 · 5 20 · 6 24 · 8 32 · 10 40 · 12 48 · 16 64. Geen ad-hoc waarden.

### Border radius
sm 4 · md 6 (input/button/checkbox) · lg 8 · xl 10 (**card-default, EVA-norm**) · 2xl 14 (modal/drawer) · full 9999 (pill/avatar/switch)

### Shadows / Elevation — border-first
Inline cards: **flat, border-1, géén shadow**. Shadows alléén voor floating UI:
- sm 0 1 3 /6% · md 0 4 8 /8% (popover/dropdown) · lg 0 12 16 /10% (drawer) · xl 0 20 24 /10% (modal)
- Dark theme: zwaardere shadow + inset ring `inset 0 0 0 1px rgba(255,255,255,.06)`

### Density
Wisselt op wrapper-attribuut `data-density="dense"`, niet per component. Dense halveert rij-padding
(tabelrij 48px → 30px). Calculatie/planning/wagenpark openen in dense; dossier-detail comfortabel.

---

## Hoofdstukken / Bestanden
Elk bestand is een op zichzelf staande documentatiepagina (sidebar-nav linkt ze onderling).

| # | Bestand | Inhoud |
|---|---|---|
| 1 | EVA Foundations.html | Kleuren, type, spacing, radius, shadows, themes (light/dark/editorial), density |
| 2 | EVA Navigatie en Layout.html | PlatformShell, Sidebar (collapsed/expanded), TopBar, PageHeader, Breadcrumb, Tabs |
| 3 | EVA Basiscomponenten.html | Button, Input, Select, Checkbox, Radio, Switch, Label, Badge, Avatar, Separator, Tooltip |
| 4 | EVA Feedback en States.html | Toast, Alert, AlertDialog, Spinner, Skeleton, EmptyState, Progress |
| 5 | EVA Overlays en Containers.html | Modal, Popover, Drawer, Accordion, Card, ScrollArea |
| 6 | EVA Formulierpatronen.html | Form-layout, FormSection, Zoekveld, Combobox, DatePicker, FilesUpload |
| 7 | EVA Data Display.html | Table (TanStack), StatCard, DossierKaart, Kanban, Chart (Recharts) |
| 8 | EVA CalculatieGrid.html | Spreadsheet-grid + TotalsBar (kolomgroepen, rijtypen, inline edit) |
| 9 | EVA WerkbonKaart.html | Werkbon-kaart: 5 statussen, compact, planning-entry, mobiel |
| 10 | EVA Iconografie.html | Icoon-systeem: 16 custom domein-iconen (twee-tonig) + 28 nav/dossier-iconen + states |
| — | EVA Planning.html | Werkende Gantt (Activiteiten-view) met Tweaks-paneel |
| — | EVA Planning Medewerkers.html | Werkende zwembanen-view per monteur + capaciteit, met Tweaks |

---

## Kernpatronen (recreëer als React-componenten)

### PlatformShell
- Grid: `sidebar (224px expanded / 56px collapsed) | main`. Sidebar sticky 100vh, 240ms ease collapse.
- TopBar 60px sticky: links context-titel, rechts vast cluster **Vraag EVA · ? · theme · bell**.
- Page-area scrollable, padding 28px 32px. PageHeader leeft IN de page-area (scrollt mee).
- Sidebar brand-block = polygon-mesh asset (zie Assets) met donker gradient-overlay + beeldmerk.
- Active nav-item: brand-50 bg + brand-700 tekst + 2px brand-500 left-strip. Collapse-state per user persisten.

### PageHeader (sterkste herhalende patroon)
`eyebrow (UPPERCASE context) · breadcrumb-title (titel ÍS het pad met › scheiders) · status-pill (optioneel) · actie-cluster rechts`. Eén primary button per scherm.

### Section card (dossier-detail)
`radius-xl · border-default · flat · header bg-surface met UPPERCASE label + onderlijn · body 2-col grid gap 16/24 · field-label uppercase 10.5px · field-value 13.5px · em-dash voor lege velden`.

### CalculatieGrid
- 6 kolomgroepen (AB/MA/OA/KP/VP/BTW) — **witte cellen, alleen tekst-kleur per groep** (geen bg-tint op rijen).
- 3 rijtypen: groep (brand-800 bg, wit), subgroep (neutral-900 bg, wit), regel (wit, editbaar).
- Font: Montserrat 400 overal, **geen bold, geen underline** in regels; tabular-nums.
- Inline edit via contenteditable + onBlur; Tab/Enter-navigatie; row virtualization (>500 regels).
- Sticky TotalsBar (brand-900) onderaan: marge-kleur groen &gt;20% / amber 12–20% / rood &lt;12%.

### Tabel (TanStack v8)
`getSortedRowModel + getFilteredRowModel + getPaginationRowModel`. Sticky header, checkbox-select,
filter-chips, paginering, dense-variant. Kolom-zichtbaarheid persisten in localStorage.

### WerkbonKaart
Status-flow Gepland → Onderweg → Bezig → Afgerond (+ Probleem zij-status). `--wb-accent` CSS-var
gezet door status-class stuurt strip + pill + progressbar. Varianten: full / compact / planning-entry / mobiel (≥44px hit-targets).

### Planning (Gantt + zwembanen)
@dnd-kit voor drag/herplan + resize-handles voor duur. Crew-kleur deterministisch.
Vandaag-indicator = "vlag" (getinte kolom + chip), tweakbaar. Capaciteitsbalk per monteur in zwembanen-view.

---

## Interacties & gedrag
- **Toast** rechtsboven, max 3 gestapeld. Timing: success/info 3.5s · warning 5s · error 10s/persistent · met-actie persistent.
- **Modal/Drawer**: Radix Dialog (focus-trap, ESC, scroll-lock native). Modal sm 440 / md 560 / lg 720. Drawer schuift van rechts, sticky header+footer.
- **AlertDialog destructive**: default focus op Annuleren; destructieve actie rechts; benoem het object.
- **Combobox** (RelatieZoekveld/MateriaalZoekveld): Popover + cmdk, 300ms debounce async search, inline "+ nieuw aanmaken".
- **Tweaks-paneel** (in Planning + CalculatieGrid): React-overlay die CSS-variabelen + data-attributen op een root zet. Zie `tweaks-panel.jsx`.
- **Spinner**: pas tonen na 200ms wachttijd.
- **Skeleton**: shimmer 1.4s, gebruikt bij herkenbare layouts i.p.v. spinner.

## Themes
Light (default, 95%), Dark (dashboards/planning/lange sessies), Editorial (offertes/print, warm #faf7f1).
Semantisch niveau: `bg-surface · text-fg · border-default · ring-focus` → theme-CSS-variabelen, zodat
light/dark schakelt zonder klassen-swap. neutral-950 = #1f2933 in dark.

## Iconografie
- **Line-set** (`currentColor`, 24-grid, 2px stroke, round): sidebar/knoppen/tabel — kleur erft van context
  (neutral-600 default · neutral-900 hover · brand-700 actief · neutral-400 binnenkort).
- **Twee-tonige custom set** (brand guide): outline `#1F2933` + lime-fill `#6CB33F`. Voor dashboard-tegels,
  empty-states, onboarding, marketing, app-launcher (≥40px). Max 2 tinten per icoon.
- Lucide als basis; EVA-eigen iconen (Calculatie, Werkbon, Houtrot, EvertsCalc, Geveltekeningen) in dezelfde grid.
- Lever als `<Icon name=… size=… />` wrapper of losse React-componenten. Nooit PNG-iconen in UI (alleen het beeldmerk-logo is een asset).

## Assets (map `brand-assets/`)
- `polygon-bg.png` — officiële huisstijl polygon-mesh achtergrond (sidebar-header, hero, login, PDF-cover). Altijd met donker gradient-overlay 0→28%.
- `eve-beeldmerk.png` — beeldmerk "E." (favicon, app-icon, sidebar collapsed, chart-watermerk, donut-midden).
- `everts-logo-300.png` / `everts-logo-1078.png` — full logo "EVERTS." (PDF-headers, offertes, marketing, email).

## Aanbevolen volgende stap voor de developer
1. Zet de tokens in `tailwind.config.ts` (colors.brand[50..950], neutral, success/warning/error/info, chart) + CSS-variabelen voor semantische rollen (surface/fg/border/ring) zodat dark mode via `[data-theme]` schakelt.
2. Bouw PlatformShell + PageHeader eerst — daarna passen alle andere componenten in context.
3. Recreëer de Radix-componenten 1-op-1 met deze tokens; gebruik de HTML-bestanden als visuele referentie (open ze in de browser naast je implementatie).
