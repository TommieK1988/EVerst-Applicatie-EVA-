-- cao-documenten bevat CAO-/loonschaal-PDF's (salarisdata) en stond publiek.
-- Op privaat gezet: inzien gebeurt voortaan via kortstondige signed URLs
-- (getCaoSignedUrl) en de AI-extractie downloadt via de service-role. De
-- bijbehorende cao_documenten/cao_loonschalen tabellen waren al RLS-gelockt.
update storage.buckets set public = false where id = 'cao-documenten';
