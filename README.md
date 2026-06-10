# Everts Platform

Turborepo monorepo met alle apps en services van Everts Onderhoud & Renovatie.

## Snel starten

```bash
git clone <repo-url>
cd everts-platform
npm install

# Kopieer .env.example naar elke app die Supabase nodig heeft
cp .env.example apps/dashboard/.env.local
cp .env.example apps/everts-calc/.env.local
cp .env.example apps/houtrotherstel-app/.env.local
cp .env.example apps/taken/.env.local

# Vul de Supabase credentials in (zie .env.example)

# Database tabellen aanmaken (eenmalig)
# Plak de inhoud in de Supabase SQL Editor:
#   supabase/migrations/20260415_platform_core.draft.sql
#   supabase/migrations/20260416_huisstijl_uitbreiding.sql

npm run dev          # start alle apps parallel via Turbo
```

## Apps

| App | Poort | Omschrijving |
|---|---|---|
| `dashboard` | 3000 | Centraal dashboard (Liquid Glass UI) — Instellingen, Relaties, Medewerkers, Huisstijl, Bouw7 sync |
| `everts-calc` | 3001 | Calculatiesoftware — projecten, recepten, offertes |
| `houtrotherstel-app` | 3002 | Houtrotherstel beheer |
| `taken` | 3003 | Actielijsten & workflows (losgeknipt uit everts-calc) |
| `offertegenerator` | 3004 | Offertegenerator |

## Packages

| Package | Status | Doel |
|---|---|---|
| `@everts/database` | actief | Supabase client (browser + server) + TypeScript types |
| `@everts/config` | actief | Gedeelde Tailwind preset (Everts huisstijl) |
| `@everts/ui` | skeleton | Gedeelde UI-components (Radix/shadcn) |
| `@everts/auth` | skeleton | Gedeelde authenticatie |

## Database

Eén gedeeld Supabase-project voor alle apps. Tabellen:

| Tabel | Doel |
|---|---|
| `bedrijfsgegevens` | Organisatie + werkmaatschappijen (multi-company) met huisstijl |
| `relaties` | Klanten, leveranciers, onderaannemers (één tabel met type-discriminator) |
| `relatie_contacten` | Contactpersonen per relatie |
| `medewerkers` | Team (losstaand van auth.users, optioneel gekoppeld) |
| `dossiers` | Projecten/offertes met hoofdproces-statusmodel (offerte → opdracht) |
| `dossier_status_historie` | Volledige status-audit trail |
| `integraties` | API-credentials voor Bouw7 en andere koppelingen |
| `sync_log` | Synchronisatie-logboek |

## Exact Bouw7 integratie

Configureer via Dashboard → Instellingen → Integraties:
1. Vul de **app-naam** in (geregistreerd bij Bouw7)
2. Vul de **API key** in (via start.bouw7.nl → Mijn account → API-toegang)
3. Test de verbinding
4. Start een sync → importeert relaties, medewerkers en projecten

## Ontwikkelcommando's

```bash
npm run dev                # alle apps parallel
npm run dev:dashboard      # alleen dashboard (:3000)
npm run dev:everts-calc    # alleen calc (:3001)
npm run dev:houtrot        # alleen houtrotherstel (:3002)
npm run dev:taken          # alleen taken (:3003)
npm run dev:offerte        # alleen offertegenerator (:3004)
npm run build              # productie-build van alle apps
npm run lint               # lint alle apps
npm run type-check         # TypeScript check
```

## Cloud deployment

Dit project is voorbereid voor hosting op platforms als Vercel, Netlify of een VPS:
- Elke app in `apps/` is een standalone Next.js 14 app
- Turbo ondersteunt remote caching voor snellere CI/CD
- Environment variabelen per app configureren op het hostingplatform
- Database (Supabase) draait al in de cloud

## Mappenstructuur

```
everts-platform/
├── apps/
│   ├── dashboard/            ← Centraal platform (Liquid Glass)
│   ├── everts-calc/          ← Calculatiesoftware
│   ├── houtrotherstel-app/   ← Houtrotherstel
│   ├── taken/                ← Actielijsten & workflows
│   └── offertegenerator/     ← Offertegenerator
├── packages/
│   ├── config/               ← Tailwind preset + tsconfig base
│   ├── database/             ← @everts/database (Supabase client + types)
│   ├── auth/                 ← @everts/auth (skeleton)
│   └── ui/                   ← @everts/ui (skeleton)
├── supabase/
│   └── migrations/           ← SQL migraties (handmatig draaien in Supabase)
├── .env.example              ← Template voor environment variabelen
├── package.json              ← Monorepo root (npm workspaces)
└── turbo.json                ← Turborepo configuratie
```
