import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getContactpersoonById } from '@/lib/relaties/contactpersonen-actions'
import ContactpersoonDetailView from './ContactpersoonDetailView'

export async function generateMetadata(props: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const params = await props.params
  const cp = await getContactpersoonById(params.id)
  if (!cp) return { title: 'Contactpersoon' }
  return { title: `${cp.voornaam} ${cp.achternaam}` }
}

export default async function ContactpersoonDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const contactpersoon = await getContactpersoonById(params.id)
  if (!contactpersoon) notFound()

  return <ContactpersoonDetailView contactpersoon={contactpersoon} />
}
