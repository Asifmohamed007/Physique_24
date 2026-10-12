#!/bin/bash
# Rebuilds a scratch database and runs every migration + the RLS test.
set -e
cd "$(dirname "$0")/../.."
su postgres -c "dropdb --if-exists fit; createdb fit"
for f in tests/db/00_supabase_stub.sql database/migrations/001_schema.sql database/migrations/002_security_and_functions.sql database/migrations/003_storage.sql database/seed.sql database/migrations/004_variety_and_time.sql tests/db/99_grants.sql; do
  su postgres -c "psql -q -v ON_ERROR_STOP=1 -d fit -f $f" >/tmp/mig.log 2>&1 || { echo "MIGRATION FAILED: $f"; grep -v NOTICE /tmp/mig.log; exit 1; }
  echo "migrated $f"
done
su postgres -c "psql -q -At -d fit -f tests/db/rls_isolation_test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
