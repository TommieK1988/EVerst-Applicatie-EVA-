import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * Een admin-client voor tabellen die (nog) niet in `database.types.ts` staan.
 *
 * Zonder dit krijgt elke nieuwe tabel zijn eigen ongetypeerde cast op
 * `createAdminClient()`, en dat zijn er inmiddels honderden — zo'n cast neemt niet
 * alleen de onbekende tabel mee, maar zet ook typecontrole uit op álles wat je
 * verder met die client doet.
 * Hier staat de cast één keer, achter een beschrijving van precies de methodes die
 * we gebruiken. Rijen komen terug als `Record<string, unknown>`: onbekend, maar
 * niet `any`, dus je wordt gedwongen ze te lezen met `String()` / `Number()`.
 *
 * Staat een tabel wél in de gegenereerde types? Gebruik dan gewoon
 * `createAdminClient()` — die geeft je echte kolomnamen.
 */

export type Rij = Record<string, unknown>

export interface Resultaat<T> {
  data: T
  error: { message: string } | null
}

/** De queryketen van PostgREST, beperkt tot wat we hier nodig hebben. */
export interface Query extends PromiseLike<Resultaat<Rij[]>> {
  select(kolommen?: string): Query
  eq(kolom: string, waarde: unknown): Query
  neq(kolom: string, waarde: unknown): Query
  is(kolom: string, waarde: unknown): Query
  in(kolom: string, waarden: readonly unknown[]): Query
  gte(kolom: string, waarde: unknown): Query
  lte(kolom: string, waarde: unknown): Query
  order(kolom: string, opties?: { ascending?: boolean }): Query
  limit(n: number): Query
  range(van: number, tot: number): Query
  insert(rijen: Rij | Rij[]): Query
  update(rij: Rij): Query
  upsert(rijen: Rij | Rij[], opties?: { onConflict?: string }): Query
  delete(): Query
  single(): PromiseLike<Resultaat<Rij>>
  maybeSingle(): PromiseLike<Resultaat<Rij | null>>
}

export interface LosseTabelClient {
  from(tabel: string): Query
}

/** Admin-client (service-role) voor tabellen buiten de gegenereerde types. */
export function losseTabel(): LosseTabelClient {
  // Via `unknown`, niet via `any`: de client is getypeerd op het gegenereerde schema
  // en kent deze tabellen per definitie niet, maar een `any` hier zou ook elke
  // controle op het gebruik ervan uitzetten.
  return createAdminClient() as unknown as LosseTabelClient
}

/** Leest één veld als tekst; alles buiten string/number wordt leeg. */
export function tekst(rij: Rij | null | undefined, veld: string): string {
  const v = rij?.[veld]
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : ''
}

/** Leest één veld als tekst, of null wanneer het leeg is. */
export function tekstOfNull(rij: Rij | null | undefined, veld: string): string | null {
  return tekst(rij, veld) || null
}
