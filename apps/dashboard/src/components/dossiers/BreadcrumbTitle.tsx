'use client'
import { useEffect } from 'react'
import { useBreadcrumb, type DossierSyncInfo } from '@/lib/breadcrumb-context'

/**
 * Zet de dossiernaam in de topbalk-titel en, als `sync` meekomt, het dossier achter de
 * sync-knop in de topbalk.
 */
export function BreadcrumbTitle({ title, sync }: { title: string; sync?: DossierSyncInfo }) {
  const ctx = useBreadcrumb()
  useEffect(() => {
    ctx?.setRecordName(title)
    return () => ctx?.setRecordName(null)
  }, [title, ctx?.setRecordName]) // eslint-disable-line react-hooks/exhaustive-deps

  const syncId = sync?.id
  const syncLaatst = sync?.laatsteSync ?? null
  const syncBouw7 = sync?.heeftBouw7 ?? false
  useEffect(() => {
    if (!syncId) return
    ctx?.setDossierSync({ id: syncId, laatsteSync: syncLaatst, heeftBouw7: syncBouw7 })
    return () => ctx?.setDossierSync(null)
  }, [syncId, syncLaatst, syncBouw7, ctx?.setDossierSync]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
