import Link from 'next/link'

/**
 * "‹ Alle instellingen" bovenaan een beheerscherm.
 *
 * Bewust een component per pagina en geen layout: de instellingenschermen gebruiken
 * verschillende wrappers (`.eva-page` op 900px, `.eva-page-full`, en klantportaal een eigen
 * `max-w-5xl p-6`). Een link in de layout zou daardoor per scherm anders uitlijnen.
 */
export default function TerugNaarInstellingen({ href = '/instellingen', label = 'Alle instellingen' }: {
  href?: string
  label?: string
} = {}) {
  return (
    <Link href={href} className="eva-back-link">
      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M13 4l-6 6 6 6" />
      </svg>
      {label}
    </Link>
  )
}
