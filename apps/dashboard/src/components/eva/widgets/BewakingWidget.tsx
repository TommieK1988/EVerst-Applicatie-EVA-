'use client';
import { useRouter } from 'next/navigation';
import { IconBewaking } from '../Icons';
import { WidgetShell, WidgetRij } from './index';
import { STATUS_PRESENTATIE } from '@/lib/commercie/types';
import type { BewakingWidgetData } from '@/lib/commercie/actions';

/**
 * Offertes waar jij aan zet bent, urgentst bovenaan.
 *
 * De ondertitel telt alleen wat écht aandacht vraagt (verlopen + vandaag), niet het totaal.
 * "12 offertes" zegt niets over of je iets moet doen; "3 verlopen" wel.
 */
export function BewakingWidget({ data }: { data: BewakingWidgetData }) {
  const router = useRouter();
  const teDoen = data.verlopen + data.vandaag;
  const subtitle = data.totaal === 0
    ? 'Geen offertes op jouw naam'
    : teDoen > 0
      ? [data.verlopen > 0 ? `${data.verlopen} verlopen` : null,
         data.vandaag > 0 ? `${data.vandaag} vandaag` : null].filter(Boolean).join(' · ')
      : `${data.totaal} lopend · niets voor vandaag`;

  return (
    <WidgetShell
      title="Offertebewaking"
      subtitle={subtitle}
      Icon={IconBewaking}
      onTitleClick={() => router.push('/offertes')}
      titleHint="Naar de werklijst"
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {data.regels.length === 0 && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>
            {data.totaal === 0
              ? 'Er staan geen offertes op jouw naam.'
              : 'Alles staat op schema.'}
          </div>
        )}
        {data.regels.map((r, i) => {
          const pres = STATUS_PRESENTATIE[r.status];
          return (
            <WidgetRij
              key={r.dossier_id}
              stip={pres.cssKleur}
              titel={r.titel}
              sub={r.stap ?? 'Nog niets afgesproken'}
              rechts={pres.label}
              rechtsKleur={pres.cssKleur}
              laatste={i === data.regels.length - 1}
              href={`/offertes/${r.dossier_id}/bewaking`}
            />
          );
        })}
      </div>
    </WidgetShell>
  );
}
