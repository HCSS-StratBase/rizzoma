#!/bin/bash
# Run a showcase driver in a HEADED Chromium on a PRIVATE virtual display (Xvfb), never on the
# operator's desktop. Records the virtual display with ffmpeg. One at a time (private-display lock).
# usage: run-private.sh <script.mjs> [args]    env: FS_DISPLAY (default :93), FS_OUT
set -u
DISP=${FS_DISPLAY:-:93}; OUT=${FS_OUT:-/mnt/c/Apps/rizzoma/session-2026-11-16/screenshots/fractal-showcase}
mkdir -p "$OUT/videos" "$OUT/steps"
exec 9>/tmp/rizzoma-visible-browser.lock
flock 9
unset WAYLAND_DISPLAY
if ! pgrep -f "Xvfb $DISP " >/dev/null; then
  Xvfb "$DISP" -screen 0 1600x900x24 -nolisten tcp >/tmp/fs-xvfb.log 2>&1 9>&- &
  sleep 2
fi
export DISPLAY="$DISP"
STAMP=$(date +%y%m%d-%H%M%S)
FF=""
if [ "${FS_NO_FFMPEG:-0}" != 1 ]; then
ffmpeg -loglevel error -y -f x11grab -framerate 10 -video_size 1600x900 -i "$DISP" -c:v libx264 -preset ultrafast -pix_fmt yuv420p "$OUT/videos/screen-$STAMP.mp4" </dev/null 9>&- &
FF=$!
fi
node "$@"
RC=$?
[ -n "$FF" ] && { kill -INT $FF 2>/dev/null; wait $FF 2>/dev/null; }
exit $RC
