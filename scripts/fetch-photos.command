#!/bin/bash
# Double-click this file in Finder to download the photographs once (same as `npm run photos:fetch`).
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd "$(dirname "$0")/.." || exit 1
echo "U Stay Fit — downloading photographs into client/public/photos"
echo
if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in this shell. Open Terminal in the project folder and run: npm run photos:fetch"
  exit 1
fi
npm run photos:fetch
status=$?
echo
if [ $status -eq 0 ]; then echo "Finished. You can close this window."; else echo "Something went wrong (exit $status)."; fi
