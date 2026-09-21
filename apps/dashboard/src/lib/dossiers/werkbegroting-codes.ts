'use server'

/**
 * dossiers/werkbegroting-codes.ts
 *
 * Server-action rond `leesEigenBewakingscodes`: de bewakingscodes die EVA zelf heeft uitgedeeld
 * op een dossier (stelposten in de opdracht, goedgekeurd meerwerk). De werkbegroting toont ze
 * als kostengroep.
 *
 * De redenering achter deze bron — en waarom hij níét uit de Bouw7-snapshot komt — staat bij
 * `leesEigenBewakingscodes` zelf. Hier zit alleen de sessiecontrole omheen: dit is een action
 * die clientschermen aanroepen, en de lezer gebruikt de admin-client (bypast RLS).
 */

import { leesEigenBewakingscodes, type EigenBewakingscode } from '@/lib/dossiers/eigen-bewakingscodes'
import { vereisSessie } from '@/lib/auth/rechten'

export type { EigenBewakingscode }

export async function getEigenBewakingscodes(dossierId: string): Promise<EigenBewakingscode[]> {
  await vereisSessie()
  return leesEigenBewakingscodes(dossierId)
}
