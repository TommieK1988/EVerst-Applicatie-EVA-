import { notFound } from 'next/navigation'
import { getDossierById } from '@/lib/dossiers/actions'
import DossierInfoView, { type DossierInfo } from '@/components/mobiel/DossierInfoView'
import { dossierStatusBadge } from '@/components/mobiel/dossier-status'

const fmtDatum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
const fmtBedrag = (v: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(v)

export default async function MobielDossierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const res = await getDossierById(id)
  if (!res.ok) notFound()

  // DossierRij bevat losjes-getypeerde Bouw7/werkadres-velden — zelfde aanpak als de desktop-tab.
  const d = res.data as Record<string, any>
  const { label, color } = dossierStatusBadge(res.data)

  const werkadres = [
    d.werkadres_straat,
    [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' '),
  ].filter(Boolean).join(', ') || null

  const info: DossierInfo = {
    titel: d.titel,
    dossiernummer: d.dossiernummer ?? null,
    statusLabel: label,
    statusColor: color,
    klant_naam: d.klant_naam ?? null,
    categorie: d.categorie ?? d.bouw7_categorie_naam ?? null,
    fase: label,
    begindatum: d.verwacht_startdatum ? fmtDatum(d.verwacht_startdatum) : null,
    einddatum: d.verwacht_einddatum ? fmtDatum(d.verwacht_einddatum) : null,
    referentie: d.referentie ?? null,
    contact_naam: d.contactpersoon_naam ?? null,
    contact_telefoon: d.contactpersoon_telefoon ?? null,
    contact_email: d.contactpersoon_email ?? null,
    werkadres,
    rollen: [
      { label: 'Projectleider',    naam: d.projectleider_naam ?? null },
      { label: 'Uitvoerder',       naam: d.uitvoerder_naam ?? null },
      { label: 'Werkvoorbereider', naam: d.werkvoorbereider_naam ?? null },
      { label: 'Calculator',       naam: d.calculator_naam ?? null },
      { label: 'Teamleider',       naam: d.teamleider_naam ?? null },
      { label: 'Controller',       naam: d.controller_naam ?? null },
    ],
    aanneemsom: d.bedrag_excl_btw != null ? fmtBedrag(d.bedrag_excl_btw) : null,
    totaalIncl: d.bedrag_incl_btw != null ? fmtBedrag(d.bedrag_incl_btw) : null,
  }

  return <DossierInfoView info={info} />
}
