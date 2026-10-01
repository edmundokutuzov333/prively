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

O workflow `.github/workflows/backup.yml` está agora versionado na `main` e agenda a execução diária às 03:00 Africa/Maputo. A execução só é operacional depois de os secrets de produção estarem configurados e de existir prova de uma execução bem-sucedida.

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

Bloqueador formal: projecto Supabase de staging. Este bloqueador não é mascarado pelo workflow de backup.
