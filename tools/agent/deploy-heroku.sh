#!/usr/bin/env bash
# Agent-only: deploy current git HEAD to Heroku and wait for health checks.
#
# Usage:
#   bash tools/agent/deploy-heroku.sh --app <app-name>
#   HEROKU_APP=<app-name> bash tools/agent/deploy-heroku.sh
#
# Notes:
# - Uses Windows toolchain wrappers (`tools/agent/gitw`, `tools/agent/win heroku ...`).
# - Verifies `/health` and `/ready` return 200 by default.
set -euo pipefail

usage() {
  cat <<'USAGE'
deploy-heroku.sh

Deploys the current git ref to a Heroku app (git push) and waits for health checks.

Options:
  --app, -a <name>     Heroku app name (or set HEROKU_APP env var)
  --sync-env           Sync dotenv -> Heroku config vars before pushing
  --sync-env-file <p>  Dotenv file path (default: .env)
  --sync-env-all       Include all keys (disables default excludes)
  --sync-env-include   Comma-separated include keys (optional)
  --sync-env-exclude   Comma-separated exclude keys (optional)
  --sync-env-yes       Do not prompt for sync confirmation
  --remote <name>      Git remote (default: heroku)
  --ref <ref>          Git ref to push (default: HEAD)
  --branch <name>      Remote branch (default: main)
  --timeout <seconds>  Health check timeout (default: 180)
  --no-ready           Skip /ready check
  --no-health          Skip /health check
  -h, --help           Show this help

Examples:
  bash tools/agent/deploy-heroku.sh --app evening-dawn-61232
  HEROKU_APP=evening-dawn-61232 bash tools/agent/deploy-heroku.sh --timeout 300
  bash tools/agent/deploy-heroku.sh --app evening-dawn-61232 --sync-env --sync-env-yes
USAGE
}

app="${HEROKU_APP:-}"
remote="heroku"
ref="HEAD"
branch="main"
timeout_seconds=180
check_health=true
check_ready=true
sync_env=false
sync_env_file=".env"
sync_env_all=false
sync_env_include=""
sync_env_exclude=""
sync_env_yes=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app|-a)
      app="${2:-}"
      shift 2
      ;;
    --sync-env)
      sync_env=true
      shift
      ;;
    --sync-env-file)
      sync_env_file="${2:-}"
      shift 2
      ;;
    --sync-env-all)
      sync_env_all=true
      shift
      ;;
    --sync-env-include)
      sync_env_include="${2:-}"
      shift 2
      ;;
    --sync-env-exclude)
      sync_env_exclude="${2:-}"
      shift 2
      ;;
    --sync-env-yes)
      sync_env_yes=true
      shift
      ;;
    --remote)
      remote="${2:-}"
      shift 2
      ;;
    --ref)
      ref="${2:-}"
      shift 2
      ;;
    --branch)
      branch="${2:-}"
      shift 2
      ;;
    --timeout)
      timeout_seconds="${2:-}"
      shift 2
      ;;
    --no-health)
      check_health=false
      shift
      ;;
    --no-ready)
      check_ready=false
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$app" ]]; then
  echo "Missing Heroku app name. Use --app <name> or set HEROKU_APP." >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
cd "$repo_root"

if ! [[ "$timeout_seconds" =~ ^[0-9]+$ ]] || ((timeout_seconds < 1)); then
  echo "--timeout must be a positive integer (seconds)" >&2
  exit 2
fi

if ! bash tools/agent/gitw remote get-url "$remote" >/dev/null 2>&1; then
  echo "Git remote '$remote' not found; configuring it for app '$app'..."
  bash tools/agent/win heroku git:remote --app "$app" -r "$remote" >/dev/null
fi

info="$(bash tools/agent/win heroku apps:info --app "$app")"
web_url="$(
  printf '%s\n' "$info" |
    sed -n 's/^[[:space:]]*Web URL:[[:space:]]*//p' |
    head -n 1 |
    tr -d '\r'
)"

if [[ -z "$web_url" ]]; then
  web_url="https://${app}.herokuapp.com/"
fi

base_url="${web_url%/}"
health_url="${base_url}/health"
ready_url="${base_url}/ready"

if [[ "$sync_env" == "true" ]]; then
  sync_args=(--app "$app" --env-file "$sync_env_file")
  if [[ "$sync_env_all" == "true" ]]; then
    sync_args+=(--all)
  fi
  if [[ -n "$sync_env_include" ]]; then
    sync_args+=(--include "$sync_env_include")
  fi
  if [[ -n "$sync_env_exclude" ]]; then
    sync_args+=(--exclude "$sync_env_exclude")
  fi
  if [[ "$sync_env_yes" == "true" ]]; then
    sync_args+=(--yes)
  fi
  bash tools/agent/heroku-sync-env.sh "${sync_args[@]}"
fi

echo "Deploying ${ref} -> ${remote}:${branch}"
echo "App: ${app}"
echo "Web URL: ${web_url}"

bash tools/agent/gitw push "$remote" "${ref}:${branch}"

wait_for_200() {
  local url="$1"
  local deadline=$((SECONDS + timeout_seconds))
  local last_code="000"

  while ((SECONDS < deadline)); do
    last_code="$(curl -s -o /dev/null -w "%{http_code}" "$url" || true)"
    if [[ "$last_code" == "200" ]]; then
      echo "OK 200: $url"
      return 0
    fi
    sleep 3
  done

  echo "Timed out waiting for 200 from $url (last status: $last_code)" >&2
  return 1
}

if [[ "$check_health" == "true" ]]; then
  wait_for_200 "$health_url"
fi

if [[ "$check_ready" == "true" ]]; then
  wait_for_200 "$ready_url"
fi

echo "Dynos:"
bash tools/agent/win heroku ps --app "$app"
