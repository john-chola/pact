#!/usr/bin/env bash
# Applies supabase/schema.sql to a throwaway Postgres database (twice, to
# prove it is re-runnable) and runs the behaviour tests against it.
#
# Uses the standard libpq env vars (PGHOST, PGUSER, PGPASSWORD, ...).
set -euo pipefail
cd "$(dirname "$0")"

DB="${PACT_TEST_DB:-pact_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"

run() { psql -v ON_ERROR_STOP=1 -q -d "$DB" "$@"; }
run -f supabase-stub.sql
run -f ../schema.sql 2>/dev/null
run -f ../schema.sql 2>/dev/null
run -f schema.test.sql

psql -q -d postgres -c "drop database $DB"
