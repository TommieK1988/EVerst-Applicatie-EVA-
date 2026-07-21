-- Handmatig toegekende afwijkingen per rit.
--
-- Tot nu toe kwam elke bevinding uit de compliance-engine. Een planner die ziet
-- dat de engine iets mist, kon dat nergens vastleggen. Met `bron` onderscheiden
-- we beide: 'automatisch' (de engine) en 'handmatig' (door een mens toegekend).
--
-- Dit onderscheid is niet cosmetisch. De compliance-run verwijdert aan het begin
-- van elke check álle open bevindingen die hij niet opnieuw produceert — een
-- handmatige bevinding zou daarmee bij de eerstvolgende run verdwijnen. De
-- delete-query in de applicatie filtert daarom op bron = 'automatisch'.

alter table public.compliance_bevindingen
  add column if not exists bron text not null default 'automatisch';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'compliance_bevindingen_bron_check'
  ) then
    alter table public.compliance_bevindingen
      add constraint compliance_bevindingen_bron_check
      check (bron in ('automatisch', 'handmatig'));
  end if;
end $$;

comment on column public.compliance_bevindingen.bron is
  'automatisch = door de compliance-engine gegenereerd; handmatig = door een medewerker toegekend aan een rit. Handmatige bevindingen worden nooit door een compliance-run opgeruimd.';
