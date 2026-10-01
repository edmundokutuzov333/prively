# Prively backups

## Estado em 2026-10-01

O runner de backup foi preparado, mas o restore drill completo continua bloqueado porque a conta Supabase ligada só possui o projecto de produção gaonupelgtpfthouyobh. Não existe projecto Supabase de staging.

## Política

Frequência: diária.
Horário: 03:00 Africa/Maputo, equivalente a 01:00 UTC.
Formato: pg_dump --format=custom --no-owner --no-acl, seguido de gzip.
Destino: bucket B2 separado prively-backups.
Retenção: 30 dias.
Path: postgres/YYYY-MM-DD/<run-id>-<sha>.dump.gz.

## Artefactos

scripts/backup-db.mjs
supabase/migrations/20261001112000_prephase_backup_runs.sql

O ficheiro .github/workflows/backup.yml foi preparado conceptualmente, mas a API de escrita de workflows bloqueou a criação nesta execução. O agendamento não deve ser considerado activo.

## Secrets

SUPABASE_PROJECT_REF
SUPABASE_DB_PASSWORD
B2_BACKUP_ENDPOINT
B2_BACKUP_REGION
B2_BACKUP_KEY_ID
B2_BACKUP_APPLICATION_KEY
B2_BACKUP_BUCKET

A credencial B2 deve ser específica do bucket de backups.

## Restore drill

Não executado. Sem staging não existe local seguro para restaurar o dump.

Bloqueador formal: projecto Supabase de staging.
