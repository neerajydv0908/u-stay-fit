#!/usr/bin/env bash
# The official PostgreSQL image runs this once, on an EMPTY production data volume.
set -euo pipefail
# psql variables are read from environment, never password command arguments.
export USF_APP_PASSWORD USF_MIGRATOR_PASSWORD USF_READER_PASSWORD
USF_APP_PASSWORD="$(cat /run/secrets/db_app_password)"
USF_MIGRATOR_PASSWORD="$(cat /run/secrets/db_migrator_password)"
USF_READER_PASSWORD="$(cat /run/secrets/db_reader_password)"
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password USF_APP_PASSWORD
\getenv migrator_password USF_MIGRATOR_PASSWORD
\getenv reader_password USF_READER_PASSWORD
CREATE ROLE usf_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'migrator_password';
CREATE ROLE usf_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE ROLE usf_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'reader_password';
REVOKE ALL ON DATABASE u_stay_fit FROM PUBLIC;
GRANT CONNECT ON DATABASE u_stay_fit TO usf_migrator,usf_app,usf_reader;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE,CREATE ON SCHEMA public TO usf_migrator;
SQL
