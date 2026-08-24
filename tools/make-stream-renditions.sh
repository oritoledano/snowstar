#!/usr/bin/env bash
# Build the STREAM rendition for every track.
#
# Three renditions now, one job each — the split Artlist uses, and the reason
# is worth stating plainly: the file you let the world hear must not be the
# file you sell.
#
#   masters/<key>          192 kbps AAC, clean   — the deliverable, after purchase
#   masters/stream/<key>   128 kbps AAC, clean   — what the player streams
#   mutra/<key>            192 kbps, watermarked — the free download
#
# Before this, /api/stream served the master itself. Anyone who spoofed a
# Referer got the exact file a licensee pays for. Now the worst case is a
# 128 kbps copy: audibly fine for auditioning, not what anyone would licence.
#
# Idempotent — skips any track whose stream rendition already exists, so it can
# be re-run after an interruption without redoing the work.
set -uo pipefail
cd "$(dirname "$0")/../worker"

WORK="${TMPDIR:-/tmp}/mutra-stream-$$"
mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

KEYS=$(npx wrangler d1 execute snowstar-members --remote \
        --command "SELECT audio_key FROM tracks WHERE audio_key IS NOT NULL ORDER BY slug" --json 2>/dev/null \
       | python3 -c "import sys,json;[print(r['audio_key']) for r in json.load(sys.stdin)[0]['results']]")

total=$(printf '%s\n' "$KEYS" | grep -c .)
n=0; made=0; skipped=0; failed=0
echo "stream renditions for $total tracks"

while IFS= read -r key; do
  [ -z "$key" ] && continue
  n=$((n+1))
  rm -f "$WORK/probe"
  if npx wrangler r2 object get "snowstar-masters/stream/$key" --remote \
       --file "$WORK/probe" >/dev/null 2>&1 && [ -s "$WORK/probe" ]; then
    skipped=$((skipped+1)); continue
  fi

  src="$WORK/src"; out="$WORK/out.m4a"
  # Retry, because a sustained run against the R2 API fails transiently often
  # enough that a single attempt lost 170 of 374 tracks on the first pass — and
  # every one of those "missing masters" was in fact present.
  rm -f "$src"
  got=0
  for try in 1 2 3; do
    if npx wrangler r2 object get "snowstar-masters/$key" --remote --file "$src" >/dev/null 2>&1 \
       && [ -s "$src" ]; then got=1; break; fi
    sleep $((try * 2))
  done
  if [ "$got" -eq 0 ]; then
    echo "  [$n/$total] NO MASTER  $key"; failed=$((failed+1)); continue
  fi
  # -vn drops the embedded cover: it is ~100 KB of every request, and the page
  # already has the artwork. 128k/44.1k stereo matches Artlist's older tier.
  if ! ffmpeg -v error -y -i "$src" -vn -c:a aac -b:a 128k -ar 44100 -ac 2 \
        -movflags +faststart "$out" 2>/dev/null; then
    echo "  [$n/$total] ENCODE FAILED  $key"; failed=$((failed+1)); continue
  fi
  putok=0
  for try in 1 2 3; do
    if npx wrangler r2 object put "snowstar-masters/stream/$key" --remote --file "$out" \
         --content-type audio/mp4 >/dev/null 2>&1; then putok=1; break; fi
    sleep $((try * 2))
  done
  if [ "$putok" -eq 1 ]; then
    made=$((made+1))
    [ $((made % 25)) -eq 0 ] && echo "  [$n/$total] $made made, $skipped skipped, $failed failed"
  else
    echo "  [$n/$total] UPLOAD FAILED  $key"; failed=$((failed+1))
  fi
  rm -f "$src" "$out"
done <<< "$KEYS"

echo "done: $made made, $skipped already there, $failed failed, of $total"
