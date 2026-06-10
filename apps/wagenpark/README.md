# Wagenpark-beheer (Everts Platform)

Beheer van voertuigen, leasecontracten, RDW-gegevens en ULU Cartracker rijgedragsanalyse.

## Start

```bash
# vanuit de root van de monorepo
npm install
npm run dev:wagenpark
# → http://localhost:3005
```

## Vereisten

1. **Supabase-migratie uitvoeren**: `supabase/migrations/20260417_wagenpark.sql`
2. **Env-variabelen** (kopieer `.env.local.example` naar `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (voor bulk-imports)

## Architectuur

| Laag | Locatie |
|------|---------|
| UI / pagina's | `src/app/(dashboard)/` |
| Server actions | `src/app/actions/` |
| Compliance-engine, importers, RDW-client | `packages/wagenpark-core/` |
| Database-schema | `supabase/migrations/20260417_wagenpark.sql` |

## Kernfuncties

- **Voertuigen CRUD** — RDW-lookup automatisch bij aanmaken (`POST /voertuigen/nieuw`)
- **ULU Excel import** — trips + parking, upsert (idempotent), automatische compliance-check (`/ritten/import`)
- **Compliance-engine** — regels R1, R2a, R2b, R3, R6, R7 uit het werknemers handboek
- **Zelflerende feedback** — "markeer uitzondering" / "bevestig overtreding" per bevinding
- **Bestuurders-overzicht** — km zakelijk/privé YTD via DB-view `v_bestuurders_overzicht`

## Compliance-regels (beknopt)

| Code | Regel |
|------|-------|
| R1 | Werktijd: weekdagen 07:00–17:00 = zakelijk, anders privé. Weekend = altijd privé. |
| R2a | Mét bijtelling: vuistregel 12.000 zakelijk + 8.000 privé per jaar. |
| R2b | Zonder bijtelling: max 500 privé-km per jaar. |
| R3  | Buitenlandse ritten: info-signaal (tankpas alleen NL). |
| R6  | Rijgedrag: score <70 = waarschuwing, <50 = overtreding. |
| R7  | Weekendrit met ULU-markering "Zakelijk" → info voor leermoment. |

Configuratie per regel via `public.handboek_regels.drempel_config` (jsonb).

## Latere uitbreidingen

- ULU API-integratie (vervang Excel-import door dagelijkse cron) zodra superadmin-token is aangevraagd via support@cartracker.nl
- Vercel-cron / Supabase edge-function voor dagelijkse RDW-refresh
- Leasecontract CRUD-UI
- Handmatige medewerker ↔ ULU-naam koppeling
