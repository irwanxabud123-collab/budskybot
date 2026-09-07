#!/usr/bin/env bash
set -euo pipefail
DATASET="${1:-datasets/budsky-replay.json}"
OUT="${2:-runtime/validation-report.json}"
mkdir -p "$(dirname "$OUT")"
npm run build
node dist/src/validation/run-validation.js "$DATASET" "$OUT"
status=$?
if [ "$status" -eq 10 ]; then
  echo "VALIDATION BLOCKED: NEED LIVE DATA. Ini bukan pass; statistik tidak boleh diproduksi dari dataset yang belum lengkap."
fi
exit "$status"
