#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${1:-$SCRIPT_DIR/codex-binance-agent-demo.mp4}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required to generate the demo video." >&2
  exit 1
fi

ffmpeg -hide_banner -loglevel warning -y \
  -f lavfi -i "color=c=0x07111f:s=1280x720:r=30:d=32" \
  -filter_script:v "$SCRIPT_DIR/demo-video.filter" \
  -c:v libx264 -preset medium -crf 20 -movflags +faststart \
  "$OUTPUT"

echo "Generated $OUTPUT"
