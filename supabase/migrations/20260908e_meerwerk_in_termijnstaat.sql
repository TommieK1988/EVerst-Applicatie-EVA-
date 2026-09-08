-- Wordt de termijnstaat aangemaakt op het **contracttotaal**, dan zit het op dat moment
-- goedgekeurde meerwerk al in de termijnen verdeeld. Zulke regels mogen daarna geen eigen
-- meerwerktermijn meer krijgen; dat zou hetzelfde bedrag twee keer factureerbaar maken.
alter table public.meerwerk_regels
  add column if not exists in_termijnstaat boolean not null default false;
comment on column public.meerwerk_regels.in_termijnstaat is
  'True als dit meerwerk al in de grondslag van de Bouw7-termijnstaat is meegenomen; dan volgt geen aparte meerwerktermijn.';
