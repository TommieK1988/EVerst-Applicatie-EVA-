'use client'

/**
 * Dunne client-wrapper die het formulier aan de juiste server-action koppelt.
 * Bestaat omdat een Server Component geen functie-prop aan een Client Component
 * mag doorgeven tenzij die zelf een action is — dit houdt `ObjectForm` herbruikbaar
 * voor zowel aanmaken als bewerken.
 */

import React from 'react'
import type { VastgoedObject } from '@everts/database'
import ObjectForm, { type RelatieOptie } from '@/components/objecten/ObjectForm'
import type { ObjectInvoer } from '@/lib/objecten/validations'
import { maakObject, updateObject } from './actions'

type Props = { object?: VastgoedObject | null; relaties: RelatieOptie[] }

export default function ObjectFormClient({ object, relaties }: Props) {
  async function opslaan(invoer: ObjectInvoer) {
    return object ? updateObject(object.id, invoer) : maakObject(invoer)
  }
  return <ObjectForm object={object} relaties={relaties} onOpslaan={opslaan} />
}
