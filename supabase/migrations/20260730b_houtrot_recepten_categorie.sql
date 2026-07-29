-- Zet de bestaande houtrot-recepten onder de nieuwe categorie "Houtrot"
-- (kolom `onderdeel`). De variantnaam blijft in `full_name` staan; de houtrot-app
-- leest de naam sinds deze wijziging uit `full_name`, niet meer uit `onderdeel`.
--
-- BELANGRIJK: pas dit pas toe NÁDAT de code (getRecepten → full_name-first) live
-- staat op main/productie. Doe je het eerder, dan toont de nog-oude live-app
-- "Houtrot" als receptnaam. Alle 10 recepten hebben `onderdeel = full_name`, dus
-- er gaat geen naam verloren.
update public.paint_items set onderdeel = 'Houtrot' where groep is not null;
