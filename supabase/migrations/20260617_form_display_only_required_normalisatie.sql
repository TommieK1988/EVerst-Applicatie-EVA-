-- =====================================================================
-- Form Builder — normaliseer weergave-only velden
-- =====================================================================
-- Kop (heading), tekstblok (paragraph) en scheidingslijn (divider) zijn puur
-- opmaak en renderen geen invoer. Als zo'n veld per ongeluk required=true heeft,
-- blokkeert het het indienen van het formulier ("verplicht veld" zonder invoer).
-- Deze migratie zet `required` op false voor al die velden in bestaande schema's,
-- inclusief velden binnen herhalende secties (children).

create or replace function public._normalize_form_fields(fields jsonb)
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(
    (case
       when elem->>'type' in ('heading', 'paragraph', 'divider')
         then jsonb_set(elem, '{required}', 'false'::jsonb)
       else elem
     end)
    || (case
          when elem ? 'children'
            then jsonb_build_object('children', public._normalize_form_fields(elem->'children'))
          else '{}'::jsonb
        end)
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(fields, '[]'::jsonb)) elem;
$$;

update public.form_versies
set schema = jsonb_set(schema, '{fields}', public._normalize_form_fields(schema->'fields'))
where schema ? 'fields';

drop function public._normalize_form_fields(jsonb);
