#!/bin/sh
# publicnote.com — daily notes.db backup with 7-day retention.
# Runs as the `publicnote` user via the publicnote-backup.timer systemd unit.
set -eu
DB=/opt/publicnote/notes.db
DIR=/opt/publicnote/backups
KEEP=7
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$DIR"
sqlite3 "$DB" ".backup '$DIR/notes-$TS.db'"
[ "$(sqlite3 "$DIR/notes-$TS.db" 'PRAGMA integrity_check;')" = "ok" ]
ls -1t "$DIR"/notes-*.db | tail -n +$((KEEP + 1)) | while read -r f; do rm -f "$f"; done
echo "$(date -Is) ok notes-$TS.db" >> "$DIR/backup.log"
tail -n 200 "$DIR/backup.log" > "$DIR/backup.log.tmp" && mv "$DIR/backup.log.tmp" "$DIR/backup.log"
