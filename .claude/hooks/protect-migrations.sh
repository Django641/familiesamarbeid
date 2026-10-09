#!/usr/bin/env bash
# PreToolUse (Edit|Write): stopper endring av migrasjoner som allerede er committet.
# Kjørte migrasjoner må aldri endres — lag en ny med `npm run db:generate`.
set -uo pipefail

file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.tool_input?.file_path??"")}catch{}})')

case "$file" in
  */drizzle/*.sql | */drizzle/meta/*.json) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}"
rel="${file#"$PWD"/}"
if git cat-file -e "HEAD:$rel" 2>/dev/null && [ "$(basename "$rel")" != "_journal.json" ]; then
  echo "Stopp: $rel er allerede committet og kan være kjørt i produksjon. Endre lib/db/app-schema.ts og kjør npm run db:generate i stedet (se /db-migrasjon)." >&2
  exit 2
fi
exit 0
