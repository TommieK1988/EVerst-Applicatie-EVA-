# HoutrotherstelApp

Professionele webapplicatie voor het registreren van houtrotherstel tijdens onderhoudsprojecten.

## Technische Stack

- **Framework:** Next.js 14 (App Router)
- **Taal:** TypeScript
- **Database:** Supabase (PostgreSQL)
- **Authenticatie:** Supabase Auth
- **Opslag:** Supabase Storage
- **Styling:** Tailwind CSS
- **Formulieren:** React Hook Form + Zod
- **Notificaties:** react-hot-toast
- **Export:** xlsx (Excel) / jsPDF (PDF)

## Vereisten

- Node.js 18+
- npm of yarn
- Supabase account (gratis tier volstaat voor development)

## Installatie

### 1. Repository klonen

```bash
git clone <repository-url>
cd houtrotherstel-app
npm install
```

### 2. Supabase project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een nieuw project
2. Noteer de **Project URL** en **anon key** uit Settings > API

### 3. Omgevingsvariabelen instellen

```bash
cp .env.local.example .env.local
```

Vul in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://jouw-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=jouw-anon-key
SUPABASE_SERVICE_ROLE_KEY=jouw-service-role-key
```

> ⚠️ De `SUPABASE_SERVICE_ROLE_KEY` is alleen nodig voor de admin API (gebruikers aanmaken). Bewaar deze veilig en commit hem nooit.

### 4. Database migraties uitvoeren

Voer de SQL migraties uit in de Supabase SQL editor (Dashboard > SQL Editor):

```
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_rls_policies.sql
supabase/migrations/003_seed_data.sql
supabase/migrations/004_storage.sql
```

Voer ze in volgorde uit.

### 5. Demo gebruikers aanmaken

Ga naar Supabase Dashboard > Authentication > Users en maak de volgende gebruikers aan:

| Naam | E-mail | Wachtwoord | Rol |
|------|--------|------------|-----|
| Admin Gebruiker | admin@houtrotherstel.nl | Demo1234! | admin |
| Jan Projectleider | projectleider@houtrotherstel.nl | Demo1234! | projectleider |
| Piet Medewerker | medewerker1@houtrotherstel.nl | Demo1234! | medewerker |
| Lisa Medewerker | medewerker2@houtrotherstel.nl | Demo1234! | medewerker |

Na aanmaken, update de rollen in de `profiles` tabel:
```sql
UPDATE profiles SET role = 'admin' WHERE email = 'admin@houtrotherstel.nl';
UPDATE profiles SET role = 'projectleider' WHERE email = 'projectleider@houtrotherstel.nl';
```

### 6. Projecten koppelen aan gebruikers

```sql
-- Koppel projectleider aan alle actieve projecten
INSERT INTO project_user_assignments (project_id, user_id, role_in_project)
SELECT p.id, pr.id, 'Projectleider'
FROM projects p, profiles pr
WHERE pr.email = 'projectleider@houtrotherstel.nl';

-- Koppel medewerker aan eerste project
INSERT INTO project_user_assignments (project_id, user_id, role_in_project)
SELECT p.id, pr.id, 'Uitvoerder'
FROM projects p, profiles pr
WHERE pr.email = 'medewerker1@houtrotherstel.nl'
AND p.project_number = 'P-2024-001';
```

### 7. Development server starten

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in uw browser.

## Mappenstructuur

```
src/
├── app/
│   ├── (auth)/           # Login, wachtwoord reset
│   ├── (dashboard)/      # Beveiligde applicatiepagina's
│   │   ├── dashboard/
│   │   ├── projecten/
│   │   ├── registraties/
│   │   ├── standaard-reparaties/
│   │   ├── gebruikers/
│   │   ├── rapportages/
│   │   └── instellingen/
│   └── api/              # API routes
├── components/
│   ├── auth/             # Login componenten
│   ├── dashboard/        # Dashboard widgets
│   ├── projecten/        # Project componenten
│   ├── registraties/     # Registratie formulieren en overzichten
│   ├── reparaties/       # Standaard reparaties beheer
│   ├── rapportages/      # Rapportage componenten
│   ├── gebruikers/       # Gebruikersbeheer
│   ├── instellingen/     # Instellingen
│   └── shared/           # Gedeelde UI componenten
├── lib/
│   ├── supabase/         # Client en server Supabase instanties
│   ├── types/            # TypeScript types
│   ├── utils/            # Helper functies
│   └── validations/      # Zod schemas
├── hooks/                # Custom React hooks
├── services/             # Data access laag
└── middleware.ts         # Auth middleware
```

## Gebruikersrollen

| Rol | Beschrijving |
|-----|-------------|
| **Admin** | Volledige toegang: gebruikers, projecten, standaard reparaties, alle registraties, rapportages |
| **Projectleider** | Projecten en registraties beheren, rapportages inzien |
| **Medewerker** | Registraties invoeren op toegewezen projecten, foto's uploaden |

## Functies

### Kernfunctionaliteit
- ✅ Houtrotherstel registraties met locatie, schade, reparatie, foto's
- ✅ Standaard reparaties met materiaallijst en prijsberekening
- ✅ Snapshot van prijzen bij registratie (wijzigingen achteraf beïnvloeden oude registraties niet)
- ✅ Werkelijke vs. normatieve arbeid en materiaal
- ✅ Foto upload met voor/tijdens/na categorisering

### Financieel
- ✅ Automatische berekening kostprijs en marge
- ✅ Financiële rapportages per project, categorie, medewerker
- ✅ Export naar Excel

### Beheer
- ✅ Gebruikersbeheer met rolbeheer
- ✅ Projectbeheer met gebruikerskoppelingen
- ✅ Standaard reparaties database
- ✅ Audit trail voor wijzigingen

### UI/UX
- ✅ Mobile-first design
- ✅ Offline-vriendelijke invoer
- ✅ Autocomplete standaard reparaties
- ✅ Status badges met kleurcodering
- ✅ Realtime financiële berekeningen in formulieren

## Productie deployment

### Vercel (aanbevolen)

```bash
npm run build
vercel deploy
```

Voeg de omgevingsvariabelen toe in Vercel Dashboard.

### Zelfhosting

```bash
npm run build
npm start
```

## Supabase configuratie checklist

- [ ] Database migraties uitgevoerd (001-004)
- [ ] RLS policies actief
- [ ] Storage buckets aangemaakt (`repair-photos`, `project-documents`)
- [ ] Authenticatie instellingen: wachtwoord reset redirect URL instellen
- [ ] SMTP configuratie voor e-mails (optioneel, Supabase heeft standaard SMTP)

## Licentie

Intern gebruik. Alle rechten voorbehouden.
