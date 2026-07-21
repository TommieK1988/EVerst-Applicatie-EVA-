'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MapPin, Calendar, Phone, Mail, User,
  ChevronRight, ClipboardList, Edit, FileText,
} from 'lucide-react'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { formatDate, formatCurrency, formatDateShort } from '@/lib/houtrotherstel/utils'
import { getProjectWithDetails } from '@/services/houtrotherstel/projects'
import type { Project } from '@/lib/houtrotherstel/types'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

interface Props {
  projectId: string
}

const AFGEROND_STATUSSEN = ['gereed', 'gecontroleerd']

export default function ProjectDetail({ projectId }: Props) {
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [registraties, setRegistraties] = useState<any[]>([])
  const [showRapportageModal, setShowRapportageModal] = useState(false)

  useEffect(() => {
    getProjectWithDetails(projectId)
      .then(data => {
        if (!data) return
        setProject(data as Project)
        setRegistraties((data as any).repair_registrations || [])
      })
      .catch(() => setProject(null))
  }, [projectId])

  if (!project) return (
    <div className="flex items-center justify-center h-40 text-slate-400">
      Project niet gevonden
    </div>
  )

  const openCount = registraties.filter(r => !AFGEROND_STATUSSEN.includes(r.status)).length
  const gereedCount = registraties.filter(r => AFGEROND_STATUSSEN.includes(r.status)).length
  const totalVerkoopprijs = registraties.reduce(
    (s, r) => s + (Number(r.actual_sale_price ?? r.sale_price_snapshot) || 0), 0
  )

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <Link
          href="/houtrotherstel/projecten"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Terug naar projecten
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm text-slate-400 ">#{project.project_number}</span>
              <StatusBadge status={project.status} type="project" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{project.name}</h1>
            <p className="text-slate-500">{project.client_name}</p>
          </div>
          <div className="flex items-center gap-2 self-start">
            <Button
              variant="primary"
              size="lg"
              onClick={() => setShowRapportageModal(true)}
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Rapportage</span>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={`/houtrotherstel/projecten/${project.id}/bewerken`}>
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Bewerken</span>
              </Link>
            </Button>
          </div>

          {/* Rapportage modal */}
          <Dialog open={showRapportageModal} onOpenChange={setShowRapportageModal}>
            <DialogContent size="sm">
              <DialogHeader>
                <DialogTitle>Rapportage opstellen</DialogTitle>
                <DialogDescription>Wil je de rapportage met of zonder prijzen opstellen?</DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col gap-2 justify-stretch">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => { setShowRapportageModal(false); router.push(`/houtrotherstel/projecten/${project.id}/rapportage?prijzen=1`) }}
                >
                  Met prijzen
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => { setShowRapportageModal(false); router.push(`/houtrotherstel/projecten/${project.id}/rapportage?prijzen=0`) }}
                >
                  Zonder prijzen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-neutral-700">{registraties.length}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Registraties</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-brand-600">{openCount}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Open</div>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center py-4">
            <div className="text-2xl font-bold text-success-700">{gereedCount}</div>
            <div className="text-xs text-neutral-500 mt-0.5">Gereed</div>
          </CardBody>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Projectinfo */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            <h2 className="font-semibold text-slate-800">Projectinformatie</h2>
            <div className="flex items-start gap-2.5 text-sm">
              <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-slate-700">{project.address}</div>
                <div className="text-slate-500">{project.postal_code} {project.city}</div>
              </div>
            </div>
            {(project.start_date || project.end_date) && (
              <div className="flex items-start gap-2.5 text-sm">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-slate-700">{formatDate(project.start_date || '')}</div>
                  {project.end_date && <div className="text-slate-500">t/m {formatDate(project.end_date)}</div>}
                </div>
              </div>
            )}
            {project.contact_name && (
              <div className="flex items-start gap-2.5 text-sm">
                <User className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-slate-700">{project.contact_name}</div>
                  {project.contact_phone && (
                    <a href={`tel:${project.contact_phone}`} className="text-everts hover:underline flex items-center gap-1">
                      <Phone className="w-3 h-3" />{project.contact_phone}
                    </a>
                  )}
                  {project.contact_email && (
                    <a href={`mailto:${project.contact_email}`} className="text-everts hover:underline flex items-center gap-1">
                      <Mail className="w-3 h-3" />{project.contact_email}
                    </a>
                  )}
                </div>
              </div>
            )}
            {project.description && (
              <div className="pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-400 mb-1">Omschrijving</p>
                <p className="text-sm text-slate-600">{project.description}</p>
              </div>
            )}
          </div>

          {totalVerkoopprijs > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h2 className="font-semibold text-slate-800 mb-3">Financieel overzicht</h2>
              <div className="text-sm text-slate-500">Verkoopwaarde</div>
              <div className="text-2xl font-bold text-slate-800">{formatCurrency(totalVerkoopprijs)}</div>
              <div className="mt-2 text-xs text-slate-400">{registraties.length} registraties</div>
            </div>
          )}
        </div>

        {/* Registraties */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-everts" />
              Registraties
            </h2>
            <Button variant="primary" size="md" asChild>
              <Link href={`/houtrotherstel/registraties/nieuw?project=${project.id}`}>
                Nieuwe registratie
              </Link>
            </Button>
          </div>

          <div className="space-y-3">
            {registraties.map(reg => {
              const locatie = [reg.location_block, reg.room_or_unit, reg.element_number]
                .filter(Boolean).join(' · ')
              const bedrag = Number(reg.actual_sale_price ?? reg.sale_price_snapshot) || 0
              return (
                <Link
                  key={reg.id}
                  href={`/houtrotherstel/registraties/${reg.id}`}
                  className="bg-white rounded-xl border border-slate-200 p-4 hover:border-everts/40 hover:shadow-sm transition-all flex items-center gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 group-hover:text-everts transition-colors truncate">
                        {reg.component_type || 'Registratie'}
                      </span>
                      <StatusBadge status={reg.status} size="sm" />
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                      {reg.registration_date && <span>{formatDateShort(reg.registration_date)}</span>}
                      {locatie && <span className="truncate">{locatie}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {bedrag > 0 && (
                      <span className="text-sm font-medium text-slate-600">{formatCurrency(bedrag)}</span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-everts transition-colors" />
                  </div>
                </Link>
              )
            })}
          </div>

          {registraties.length === 0 && (
            <div className="text-center py-12 text-slate-400 bg-white rounded-xl border border-dashed border-slate-300">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="font-medium">Nog geen registraties</p>
              <p className="text-sm mt-1">Voeg een registratie toe om te beginnen</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
