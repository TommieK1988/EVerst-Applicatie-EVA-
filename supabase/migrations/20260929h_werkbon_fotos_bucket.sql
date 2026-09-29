-- Storage-bucket voor de werkbon-flow (planning/werkbon/actions.ts): foto's via
-- uploadWerkbonFoto en de handtekening-PNG bij sluitWerkbon. De bucket bestond niet,
-- waardoor uploads mislukten. Publiek, net als oplever-fotos (20260707_oplevering.sql):
-- de code slaat getPublicUrl() op in werkbon_fotos.storage_url / werkbonnen.handtekening_url.
insert into storage.buckets (id, name, public)
values ('werkbon-fotos', 'werkbon-fotos', true)
on conflict (id) do nothing;
