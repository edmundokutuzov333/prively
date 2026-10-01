#!/usr/bin/env bash
set -euo pipefail
eval "$(supabase status -o env)"
tmp="$(mktemp)"
path="phase2-test/kyc-proof.txt"
printf 'phase2-private-storage\n' > "$tmp"
cleanup(){ curl -fsS -X DELETE -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" "$API_URL/storage/v1/object/prively-kyc/$path" >/dev/null 2>&1 || true; rm -f "$tmp"; }
trap cleanup EXIT
curl -fsS -X POST -H "Authorization: Bearer $SERVICE_ROLE_KEY" -H "apikey: $SERVICE_ROLE_KEY" -F "file=@$tmp;type=text/plain" "$API_URL/storage/v1/object/prively-kyc/$path" >/dev/null
status="$(curl -sS -o /dev/null -w "%{http_code}" "$API_URL/storage/v1/object/public/prively-kyc/$path")"
if [ "$status" -ge 200 ] && [ "$status" -lt 300 ]; then
  echo "Private KYC object was publicly readable (HTTP $status)"
  exit 1
fi
echo "KYC public object endpoint denied access as expected (HTTP $status)"
