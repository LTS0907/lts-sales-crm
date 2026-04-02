#!/bin/bash
# Monthly billing remind script - runs on 1st of each month
# Creates billing records for variable subscriptions

BASE_URL="${CRM_BASE_URL:-http://localhost:3000}"
CRON_SECRET="${CRON_API_SECRET:-a5b970e0e8a1f516c07264ed0e561d9e2934bbed196b8f519d91c80c24daa5d9}"

echo "[$(date)] Starting billing reminder..."

curl -s -X POST "${BASE_URL}/api/subscriptions/cron/remind" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  -H "Content-Type: application/json" | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const data = JSON.parse(Buffer.concat(chunks).toString());
  console.log('[Result]', JSON.stringify(data, null, 2));
});
"

echo "[$(date)] Done."
