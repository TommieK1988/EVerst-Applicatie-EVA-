-- log_fout(): ook de melding bijwerken bij een herhaling.
--
-- Bij verificatie bleek de rij inconsistent: `melding` bleef van het EERSTE voorval
-- terwijl `stack` al van het LAATSTE kwam. Bij een melding met een variabel deel
-- ("Rij <uuid> niet gevonden") toonden die twee daardoor verschillende waarden, wat bij
-- het uitzoeken juist op het verkeerde been zet. Beide horen nu bij hetzelfde voorval.
--
-- De fingerprint verandert hier niet van: die is gebouwd op de genormaliseerde melding,
-- dus alle samengevoegde meldingen zijn per definitie dezelfde fout.

create or replace function public.log_fout(
  p_fingerprint   text,
  p_omgeving      text,
  p_bron          text,
  p_melding       text,
  p_soort         text default null,
  p_module        text default null,
  p_fout_type     text default null,
  p_stack         text default null,
  p_digest        text default null,
  p_url           text default null,
  p_medewerker_id uuid default null,
  p_extra         jsonb default null
) returns uuid
language sql
set search_path = public
as $$
  insert into public.fout_logboek as f (
    fingerprint, omgeving, bron, melding, soort, module,
    fout_type, stack, digest, url, medewerker_id, extra
  )
  values (
    p_fingerprint, p_omgeving, p_bron, p_melding, p_soort, p_module,
    p_fout_type, p_stack, p_digest, p_url, p_medewerker_id, p_extra
  )
  on conflict (fingerprint) do update set
    aantal        = f.aantal + 1,
    laatst_op     = now(),
    melding       = excluded.melding,
    -- Laatste voorval wint, maar nooit een gevulde waarde overschrijven met leeg.
    stack         = coalesce(excluded.stack, f.stack),
    digest        = coalesce(excluded.digest, f.digest),
    url           = coalesce(excluded.url, f.url),
    medewerker_id = coalesce(excluded.medewerker_id, f.medewerker_id),
    extra         = coalesce(excluded.extra, f.extra),
    opgelost      = false,
    opgelost_op   = null,
    opgelost_door = null
  returning f.id;
$$;

revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from public;
revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from anon;
revoke all on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) from authenticated;
grant execute on function public.log_fout(text,text,text,text,text,text,text,text,text,text,uuid,jsonb) to service_role;
