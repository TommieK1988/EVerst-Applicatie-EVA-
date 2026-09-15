import React from 'react'
import {
  HeartPulse, TriangleAlert, Flame, Shirt, Palmtree, Wrench, Users, Hammer, Car,
  Smartphone, CircleHelp, Droplets, Zap, Truck, Package, ShieldAlert, Thermometer,
  type LucideIcon,
} from 'lucide-react'

/**
 * De iconen die een "Wat te doen bij"-kaart kan dragen.
 *
 * Eén lijst, gedeeld door de kiezer in het beheer en de kaart op de telefoon.
 * Dat is hier geen netheid maar noodzaak: zou het beheer uit een andere lijst
 * kiezen dan de telefoon kent, dan legt HR een icoon vast dat op het toestel
 * een vraagteken wordt — en dat merk je pas als iemand het scherm opent.
 *
 * Expliciet en niet dynamisch uit lucide: anders belandt de hele
 * iconenbibliotheek in de bundel voor een handvol plaatjes.
 */
export const SITUATIE_ICONEN: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: 'HeartPulse', label: 'Ongeval of letsel', Icon: HeartPulse },
  { key: 'TriangleAlert', label: 'Onveilige situatie', Icon: TriangleAlert },
  { key: 'Flame', label: 'Brand', Icon: Flame },
  { key: 'ShieldAlert', label: 'Veiligheid', Icon: ShieldAlert },
  { key: 'Shirt', label: 'Kleding', Icon: Shirt },
  { key: 'Palmtree', label: 'Verlof', Icon: Palmtree },
  { key: 'Thermometer', label: 'Ziekte', Icon: Thermometer },
  { key: 'Wrench', label: 'Gereedschap', Icon: Wrench },
  { key: 'Hammer', label: 'Werk en materieel', Icon: Hammer },
  { key: 'Package', label: 'Materiaal', Icon: Package },
  { key: 'Car', label: 'Auto of bus', Icon: Car },
  { key: 'Truck', label: 'Transport', Icon: Truck },
  { key: 'Smartphone', label: 'Telefoon of app', Icon: Smartphone },
  { key: 'Users', label: 'Collega’s', Icon: Users },
  { key: 'Droplets', label: 'Lekkage of water', Icon: Droplets },
  { key: 'Zap', label: 'Elektriciteit', Icon: Zap },
]

const PER_KEY = new Map(SITUATIE_ICONEN.map((i) => [i.key, i.Icon]))

/** Het icoon bij deze naam, of een vraagteken als de naam onbekend is. */
export default function SituatieIcoon({
  naam, size = 19,
}: {
  naam: string | null | undefined
  size?: number
}) {
  const Icon = (naam && PER_KEY.get(naam)) || CircleHelp
  return <Icon size={size} />
}
