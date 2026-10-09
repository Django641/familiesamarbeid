#!/usr/bin/env bash
# PreToolUse (Edit|Write): stopper endring av migrasjoner som allerede er committet.
# Kjørte migrasjoner må aldri endres — lag en ny, nummerert fil i stedet.
set -uo pipefail

file=$(node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.tool_input?.file_path??"")}catch{}})')

case "$file" in
  */supabase/migrations/*.sql) ;;
  *) exit 0 ;;
esac

cd "${CLAUDE_PROJECT_DIR:-.}"
rel="${file#"$PWD"/}"
if git cat-file -e "HEAD:$rel" 2>/dev/null; then
  echo "Stopp: $rel er allerede committet og kan være kjørt i produksjon. Lag en ny migrasjonsfil (se /db-migrasjon)." >&2
  exit 2
fi
exit 0
