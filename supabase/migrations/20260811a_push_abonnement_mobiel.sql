-- Pushmeldingen: onthouden of een abonnement op een telefoon zit.
--
-- De user-agent is daar geen betrouwbare bron voor. Safari meldt zich in een
-- geïnstalleerde web-app op de iPhone als "Macintosh; Intel Mac OS X", precies
-- zoals een Mac. `isMobileUA()` ziet dat dus als een desktop, waardoor het pad in
-- de pushmelding niet naar de mobiele schermen werd omgezet en elke aangetikte
-- melding op /m bleef hangen in plaats van bij het dossier.
--
-- De browser wéét het wel: EVA gebruikt zelf het viewport (<768px) om naar de
-- mobiele omgeving te sturen. Die uitkomst wordt bij het aanmelden meegestuurd en
-- hier vastgelegd. Null = onbekend (oudere rijen); dan valt de verzendkant terug
-- op de user-agent.

alter table public.push_abonnementen
  add column if not exists mobiel boolean;

comment on column public.push_abonnementen.mobiel is
  'Meldde de browser zich aan vanaf een telefoon-viewport? Bepaalt of pushmeldingen het mobiele pad (/m/...) meekrijgen. Null = onbekend, dan telt de user-agent.';
