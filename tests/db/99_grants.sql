-- Supabase grants table privileges to authenticated by default; RLS does the filtering.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
