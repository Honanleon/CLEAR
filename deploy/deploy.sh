#!/usr/bin/env bash
# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
#
# Deploy a static build to the shared host over SSH (the host has no rsync).
# Usage: deploy/deploy.sh <build_dir> <docroot>
#   build_dir  local folder with index.html (web/dist, or deploy/placeholder)
#   docroot    staging.rohayhu.org | clear.rohayhu.org (folder under the remote home)
# SSH target: $DEPLOY_SSH_HOST (an ~/.ssh/config alias), default "clear-cpanel".
#
# The build is unpacked into ~/releases/<docroot>-<timestamp> (last 3 kept for rollback),
# then copied over the docroot. cPanel files (.well-known, .user.ini, php.ini) are kept;
# the existing .htaccess is kept unless the build ships its own.
set -euo pipefail

SRC=${1:?build dir}
DOCROOT=${2:?docroot}
HOST=${DEPLOY_SSH_HOST:-clear-cpanel}

case "$DOCROOT" in
  staging.rohayhu.org | clear.rohayhu.org) ;;
  *) echo "refusing to deploy to unknown docroot: $DOCROOT" >&2; exit 1 ;;
esac
[ -f "$SRC/index.html" ] || { echo "no index.html in $SRC" >&2; exit 1; }

REL="releases/${DOCROOT}-$(date -u +%Y%m%dT%H%M%SZ)"
echo "deploying $SRC -> $HOST:~/$DOCROOT (via ~/$REL)"

COPYFILE_DISABLE=1 tar -C "$SRC" -czf - . | ssh "$HOST" "set -euo pipefail
  mkdir -p ~/$REL && tar -xzf - -C ~/$REL
  cd ~/$DOCROOT
  find . -mindepth 1 -maxdepth 1 ! -name .well-known ! -name .user.ini ! -name php.ini ! -name .htaccess -exec rm -rf {} +
  find ~/$REL -mindepth 1 -maxdepth 1 -exec cp -a {} ~/$DOCROOT/ \;
  ls -1dt ~/releases/${DOCROOT}-* | tail -n +4 | xargs -r rm -rf
  echo \"deployed: \$(find ~/$DOCROOT -type f | wc -l) files\""
