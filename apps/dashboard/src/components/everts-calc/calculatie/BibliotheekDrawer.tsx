'use client'

import { useState, useCallback, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { laadBibliotheekItemsVolledig } from '@/app/(platform)/everts-calc/actions/bibliotheek'
import { laadSchilderwerkData } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { PaintItemMetNormen } from '@/lib/everts-calc/services/bibliotheek'
import type { SchilderOnderdeel, SchilderType, SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerBody,
} from '@/components/ui/drawer'
import { Spinner } from '@/components/ui/spinner'

const BiblioteekBeheer      = dynamic(() => import('../bibliotheek/BiblioteekBeheer'))
const SchilderwerkBibliotheek = dynamic(() => import('../bibliotheek/SchilderwerkBibliotheek'))
const MaterialenBibliotheek   = dynamic(() => import('../bibliotheek/MaterialenBibliotheek'))

const TITELS: Record<string, string> = {
  recepten:     'Recepten',
  schilderwerk: 'Schilderwerk',
  materialen:   'Materialen',
}

interface Props {
  type: 'recepten' | 'schilderwerk' | 'materialen'
  open: boolean
  onClose: () => void
}

export default function BibliotheekDrawer({ type, open, onClose }: Props) {
  const [receptenData, setReceptenData]         = useState<PaintItemMetNormen[] | null>(null)
  const [schilderwerkData, setSchilderwerkData] = useState<{
    onderdelen: SchilderOnderdeel[]
    types: SchilderType[]
    behandelingen: SchilderBehandeling[]
  } | null>(null)
  const [laden, setLaden] = useState(false)

  const laad = useCallback(async () => {
    if (laden) return
    setLaden(true)
    try {
      if (type === 'recepten' && !receptenData) {
        setReceptenData(await laadBibliotheekItemsVolledig())
      } else if (type === 'schilderwerk' && !schilderwerkData) {
        setSchilderwerkData(await laadSchilderwerkData())
      }
    } finally {
      setLaden(false)
    }
  }, [type, laden, receptenData, schilderwerkData])

  useEffect(() => {
    if (open) laad()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Drawer
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
    >
      <DrawerContent width={560}>
        <DrawerHeader>
          <DrawerTitle>{TITELS[type]}</DrawerTitle>
        </DrawerHeader>

        <DrawerBody className="p-0">
          {laden && (
            <div className="flex items-center justify-center h-32 gap-2 text-neutral-400">
              <Spinner size="sm" />
              <span className="text-sm">Laden…</span>
            </div>
          )}

          {/* In de lade zonder opgeslagen layouts: kolommen aanpassen kan wel,
              bewaren hoort thuis op de bibliotheekpagina zelf. */}
          {!laden && type === 'recepten' && receptenData && (
            <BiblioteekBeheer items={receptenData} layouts={[]} user_id={null} />
          )}

          {!laden && type === 'schilderwerk' && schilderwerkData && (
            <SchilderwerkBibliotheek
              onderdelen={schilderwerkData.onderdelen}
              types={schilderwerkData.types}
              behandelingen={schilderwerkData.behandelingen}
            />
          )}

          {!laden && type === 'materialen' && (
            <MaterialenBibliotheek layouts={[]} user_id={null} />
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  )
}
