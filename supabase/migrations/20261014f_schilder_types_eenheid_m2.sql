-- Twee schildertypes (Beton plafond: Vlak en Diktekant) stonden op eenheid 'm2'
-- in plaats van 'm²'. De meetstaat telde ze daardoor als een eigen eenheid naast
-- m² (gesplitste totalen), en de mini-meetstaat viel terug op alleen een aantal.
-- Rechtgezet naar de schrijfwijze van de rest van de bibliotheek.
update public.schilder_types set eenheid = 'm²' where eenheid = 'm2';
update public.schilder_types set eenheid = 'm¹' where eenheid = 'm1';
update public.schilder_types set eenheid = 'm³' where eenheid = 'm3';
