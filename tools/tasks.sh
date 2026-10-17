#!/usr/bin/env bash
# List the open maintenance tasks for the site: GitHub issues labelled `claude-task` (with the
# command each one gives) and `maintenance` (needing a look). See docs/MAINTENANCE.md.
#   tools/tasks.sh            # needs the GitHub CLI, authenticated (gh auth login)
set -euo pipefail
REPO=${REPO:-matthewjohnpayne/matthewjohnpayne.github.io}
command -v gh >/dev/null || { echo "tasks.sh: the GitHub CLI (gh) is not installed" >&2; exit 1; }

for label in claude-task maintenance; do
  json=$(gh issue list --repo "$REPO" --state open --label "$label" --limit 100 \
           --json number,title,createdAt,body,url 2>/dev/null || echo '[]')
  n=$(printf '%s' "$json" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
  echo "== $label: $n open"
  printf '%s' "$json" | python3 -c '
import json, sys, re
for i in sorted(json.load(sys.stdin), key=lambda i: i["createdAt"]):
    print("#%s  %s  %s" % (i["number"], i["createdAt"][:10], i["title"]))
    m = re.search(r"```bash\n(.*?)\n```", i["body"] or "", re.S)
    if m:
        print("    " + m.group(1).strip())
    print("    " + i["url"])
'
done
