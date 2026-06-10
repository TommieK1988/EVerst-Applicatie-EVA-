# Monorepo-migratie — statusrapport

## Wat is af

- [x] Backups: `git init` + commit in originele `everts-calc`, `houtrotherstel-app`, `offertegenerator` (rollback mogelijk)
- [x] Monorepo-root (`package.json` met npm workspaces, `turbo.json`, `.gitignore`)
- [x] Apps gekopieerd (niet verplaatst) naar `apps/`:
  - `apps/everts-calc` (poort 3001)
  - `apps/houtrotherstel-app` (poort 3002)
  - `apps/offertegenerator` (poort 3004)
- [x] Taken-module losgeknipt uit everts-calc → `apps/taken` (poort 3003)
  - Componenten, routes, actions, services, workflows meegegaan
  - `supabase-taken-workflow-migration-v1.sql` → `apps/taken/supabase/`
  - Sidebar in everts-calc opgeschoond (taken nav-item + `CheckSquare` import weg)
- [x] Skeleton-packages (`@everts/ui`, `@everts/database`, `@everts/auth`, `@everts/config`)
- [x] Nieuwe `apps/dashboard` (poort 3000) met grid van klikbare app-tegels

## Wat nog handmatig moet

### 1. Dependencies installeren
```bash
cd C:/Users/t.kamminga/everts-platform
npm install
```
Dit installeert alle workspaces in één `node_modules/` via hoisting.

### 2. `.env.local` bestanden
De originele `.env.local` bestanden zijn **niet gekopieerd** (gitignored). Zet ze
in elke app handmatig neer, of maak één `.env.local` in de monorepo-root zodra
`@everts/database` de gedeelde client levert.

Elke app die Supabase gebruikt heeft minimaal nodig:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### 3. Taken-app: duplicaat shared code
`apps/taken` heeft een eigen kopie van `lib/supabase/*`, `lib/utils.ts`,
`components/shared/PageHeader.tsx` en `components/shared/ToastProvider.tsx` gekregen
zodat het standalone bouwt. Dedupliceer dit naar `@everts/ui` + `@everts/database`
zodra de packages echte inhoud hebben (volgende fase).

### 4. Packages met echte inhoud vullen (vervolg-iteratie)
De `packages/*` zijn nu skeletons (`export {}`). Migratie-pad per package staat
in het bronbestand (`packages/<naam>/src/index.ts`).

### 5. Gedeelde auth
Memory-plan: één login geldig in alle apps. Dat vereist domeincookie-setup +
gedeelde Supabase-client uit `@everts/auth`. Voor nu logt iedere app apart in.

### 6. Originele directories
`C:\Users\t.kamminga\everts-calc`, `houtrotherstel-app` en `offertegenerator`
staan nog op hun oude plek met een backup-commit. **Pas verwijderen als je
hebt geverifieerd dat de monorepo-kopieën draaien.**

## Rollback

De migratie is niet-destructief: originele projecten staan ongewijzigd op hun
oorspronkelijke locatie met backup-commit `Backup before monorepo migration`.
Verwijder simpelweg `C:\Users\t.kamminga\everts-platform` om alles ongedaan te
maken — geen van de oude code is aangeraakt.

## Verificatie die nog moet gebeuren

Dit was een statische migratie (bestanden kopiëren + herstructureren). Ik heb
`npm install` en de dev-servers **niet gedraaid** — dat is de volgende stap:

```bash
cd C:/Users/t.kamminga/everts-platform
npm install
npm run dev:dashboard      # test dashboard op :3000
npm run dev:everts-calc    # test calc op :3001 (zonder taken-nav)
npm run dev:taken          # test taken op :3003
# ...etc
```

Verwachte issues bij eerste run:
- `.env.local` ontbreekt → Supabase errors
- Turbo versie-mismatch → `npm install turbo@latest -D` in root
- Tiptap was dependency in everts-calc — als je het daar nog gebruikt (niet in taken) blijft dat staan
