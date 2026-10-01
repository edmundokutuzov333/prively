# Prively Vercel deployment

## Estado verificado em 2026-10-01

A conta ligada ao conector Vercel é a equipa KUTUZOV (team_7od7FPsJHlZTwqQ0U2qscNH4). A listagem real dessa equipa contém apenas portfoliokutuzov, barber-os e txunabet2026. Não existe actualmente um projecto Vercel chamado prively.

Os aliases prively.vercel.app e privately.vercel.app não foram confirmados pela API Vercel da equipa ligada. Portanto, o site que respondeu durante o smoke test não prova que exista um projecto Prively controlado por esta conta.

O repository está preparado para Vercel, mas o deployment de produção de Prively permanece NOT VERIFIED até existir/importar o projecto oficial e ligar os secrets de produção.

## deploy.yml

.github/workflows/deploy.yml publica com:

npx vercel@61.0.0 deploy --prod --yes --token="$VERCEL_TOKEN" --scope="$VERCEL_ORG_ID"

e usa VERCEL_PROJECT_ID, VERCEL_ORG_ID e VERCEL_TOKEN no GitHub Environment production.

Isto confirma o contrato do workflow. Não confirma que o project exista na conta Vercel conectada.

## Configuração do projecto

Framework: Vite
Build: npm run build
Output: dist
Node: 24.x
SPA rewrite: /index.html

## Variáveis públicas necessárias

VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_APP_ENV

Segredos server-side nunca devem ser enviados para o browser.

## Gate

Não criar um segundo projecto de produção nem fazer deploy alternativo para contornar a ausência do projecto oficial.
