/**
 * @everts/database — gedeelde Supabase client + types voor het hele platform.
 *
 * Import patterns:
 *   import { createClient } from '@everts/database/client'   // in Client Components
 *   import { createClient } from '@everts/database/server'   // in Server Components / Actions
 *   import type { Database } from '@everts/database/types'
 *   import type { Bedrijfsgegevens } from '@everts/database/platform-types'
 */
export type { Database } from './database.types'
export type {
  Bedrijfsgegevens,
  BedrijfsgegevensInput,
  BedrijfType,
  LogoSlot,
  Relatie,
  RelatieFactuuradres,
  RelatieType,
  OrganisatieType,
  GebruikerLayout,
  Contactpersoon,
  ContactpersoonOrganisatie,
  ContactpersoonMetLink,
  Particulier,
  RelatieBankgegevens,
  RelatieFacturatie,
  RelatieInkoop,
  RelatieVerkoopPrijsafspraak,
  RelatieInkoopKortingsafspraak,
  RelatieInkoopPrijsafspraak,
  OmzetData,
  OmzetPerJaar,
  OmzetOpenstaand,
  Medewerker,
  Dossier,
  BtwSplitsingItem,
  Hoofdstatus,
  AanvraagSubstatus,
  OfferteSubstatus,
  OpdrachtSubstatus,
  ServicedeskSubstatus,
  // Meerwerk-module
  MeerwerkStatus,
  MeerwerkAfrekenwijze,
  MeerwerkStelpostGrondslag,
  MeerwerkTermijnWijze,
  MeerwerkRegel,
  // Planning-module
  PlanningUursoort,
  PlanningWerkbegrotingRegel,
  PlanningWerkbegrotingRegelMetUursoort,
  MedewerkerRooster,
  MedewerkerAfwezigheidType,
  MedewerkerAfwezigheid,
  MedewerkerSkill,
  PlanningActiviteitStatus,
  PlanningActiviteit,
  PlanningActiviteitMetUursoort,
  PlanningFase,
  AfhankelijkheidsType,
  PlanningAfhankelijkheid,
  PlanningItem,
  PlanningItemVerrijkt,
  Werkbon,
  WerkbonFoto,
  UrenRegel,
} from './platform-types'
export {
  logoSlotLabels,
  organisatieTypeLabels,
  organisatieTypeTone,
  aanvraagSubstatusLabels,
  offerteSubstatusLabels,
  opdrachtSubstatusLabels,
  meerwerkStatusLabels,
  getDossierSubstatus,
  // Planning-module
  afhankelijkheidsTypeLabels,
  planningActiviteitStatusLabels,
  medewerkerAfwezigheidLabels,
} from './platform-types'
