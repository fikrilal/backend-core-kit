#!/usr/bin/env bash
# Agent-only: sync local .env key/value pairs into Heroku config vars.
#
# Safety notes:
# - Heroku does NOT read your local `.env`. This script pushes config vars via CLI.
# - By default, it skips common Heroku/system vars (e.g., PORT, DYNO) and addon URLs
#   (e.g., DATABASE_URL, REDIS_URL). Use `--all` to include everything.
# - It never prints values; only keys. Still, be mindful that secrets will be sent to
#   Heroku and may end up in your shell history depending on how you run this.
#
# Usage:
#   bash tools/agent/heroku-sync-env.sh --app <app-name>
#   HEROKU_APP=<app-name> bash tools/agent/heroku-sync-env.sh --yes
set -euo pipefail

usage() {
  cat <<'USAGE'
heroku-sync-env.sh

Reads a dotenv file and sets Heroku config vars via `heroku config:set`.

Options:
  --app, -a <name>        Heroku app name (or set HEROKU_APP env var)
  --env-file <path>       Env file path (default: .env)
  --all                   Include all parsed keys (disables built-in excludes)
  --include <k1,k2,...>   Only include these keys (comma-separated)
  --exclude <k1,k2,...>   Exclude these keys (comma-separated)
  --dry-run               Print keys that would be set (default: false)
  --yes                   Do not prompt for confirmation
  -h, --help              Show this help

Examples:
  bash tools/agent/heroku-sync-env.sh --app evening-dawn-61232
  bash tools/agent/heroku-sync-env.sh --app evening-dawn-61232 --dry-run
  bash tools/agent/heroku-sync-env.sh --app evening-dawn-61232 --include PUSH_PROVIDER,FCM_PROJECT_ID
USAGE
}

app="${HEROKU_APP:-}"
env_file=".env"
include_all=false
include_keys_csv=""
exclude_keys_csv=""
dry_run=false
assume_yes=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app|-a)
      app="${2:-}"
      shift 2
      ;;
    --env-file)
      env_file="${2:-}"
      shift 2
      ;;
    --all)
      include_all=true
      shift
      ;;
    --include)
      include_keys_csv="${2:-}"
      shift 2
      ;;
    --exclude)
      exclude_keys_csv="${2:-}"
      shift 2
      ;;
    --dry-run)
      dry_run=true
      shift
      ;;
    --yes)
      assume_yes=true
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

if [[ ! -f "$env_file" ]]; then
  echo "Env file not found: $env_file" >&2
  exit 2
fi

split_csv_to_lines() {
  local csv="$1"
  if [[ -z "$csv" ]]; then
    return 0
  fi

  local part
  IFS=',' read -r -a parts <<<"$csv"
  for part in "${parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    [[ -n "$part" ]] && printf '%s\n' "$part"
  done
}

declare -A include_keys=()
declare -A exclude_keys=()

while IFS= read -r key; do
  include_keys["$key"]=1
done < <(split_csv_to_lines "$include_keys_csv")

while IFS= read -r key; do
  exclude_keys["$key"]=1
done < <(split_csv_to_lines "$exclude_keys_csv")

declare -A default_excludes=()
if [[ "$include_all" == "false" ]]; then
  # Avoid overriding Heroku/system-provided vars or addon URLs by default.
  default_excludes["PORT"]=1
  default_excludes["DYNO"]=1
  default_excludes["NODE_ENV"]=1
  default_excludes["DATABASE_URL"]=1
  default_excludes["REDIS_URL"]=1
  # Binding addresses differ between local and Heroku; let the app pick defaults.
  default_excludes["HOST"]=1
  default_excludes["WORKER_HOST"]=1
fi

is_valid_key() {
  local k="$1"
  [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]
}

should_include_key() {
  local k="$1"

  if ! is_valid_key "$k"; then
    return 1
  fi

  if [[ ${#include_keys[@]} -gt 0 ]]; then
    [[ -n "${include_keys[$k]:-}" ]]
    return $?
  fi

  if [[ -n "${exclude_keys[$k]:-}" ]]; then
    return 1
  fi

  if [[ -n "${default_excludes[$k]:-}" ]]; then
    return 1
  fi

  return 0
}

trim_left() {
  local s="$1"
  printf '%s' "${s#"${s%%[![:space:]]*}"}"
}

trim_right() {
  local s="$1"
  printf '%s' "${s%"${s##*[![:space:]]}"}"
}

strip_inline_comment_unquoted() {
  local s="$1"
  # If unquoted, strip trailing comments like: value # comment
  # (We only strip when there is whitespace before the '#'.)
  if [[ "$s" == \"*\" || "$s" == \'*\' ]]; then
    printf '%s' "$s"
    return 0
  fi

  if [[ "$s" == *$'\t#'* ]]; then
    printf '%s' "${s%%$'\t#'*}"
    return 0
  fi

  if [[ "$s" == *" #"* ]]; then
    printf '%s' "${s%%" #"*}"
    return 0
  fi

  printf '%s' "$s"
}

unquote_simple() {
  local s="$1"
  local first="${s:0:1}"
  local last="${s: -1}"
  if [[ "$first" == "\"" && "$last" == "\"" && ${#s} -ge 2 ]]; then
    printf '%s' "${s:1:${#s}-2}"
    return 0
  fi
  if [[ "$first" == "'" && "$last" == "'" && ${#s} -ge 2 ]]; then
    printf '%s' "${s:1:${#s}-2}"
    return 0
  fi
  printf '%s' "$s"
}

base64_encode_single_line() {
  local s="$1"
  if base64 --help 2>/dev/null | grep -q -- ' -w'; then
    printf '%s' "$s" | base64 -w0
    return 0
  fi
  printf '%s' "$s" | base64 | tr -d '\n'
}

read_pairs=()
read_keys=()
unset_keys=()

while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
  # Strip CR for CRLF files.
  line="${raw_line%$'\r'}"
  line="$(trim_left "$line")"

  [[ -z "$line" ]] && continue
  [[ "$line" == \#* ]] && continue

  if [[ "$line" == export[[:space:]]* ]]; then
    line="$(trim_left "${line#export}")"
  fi

  # Only accept KEY=VALUE lines.
  if ! [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*[[:space:]]*= ]]; then
    continue
  fi

  key="$(trim_right "${line%%=*}")"
  value_raw="${line#*=}"
  value_raw="$(trim_left "$value_raw")"
  value_raw="$(trim_right "$value_raw")"

  if ! should_include_key "$key"; then
    continue
  fi

  value_raw="$(strip_inline_comment_unquoted "$value_raw")"
  value_raw="$(trim_right "$value_raw")"
  value="$(unquote_simple "$value_raw")"

  if [[ "$value" == *$'\n'* || "$value" == *$'\r'* ]]; then
    echo "Refusing to set multiline value for key '$key' (use BASE64/JSON file or single-line encoding)." >&2
    exit 2
  fi

  # The Windows toolchain path (`tools/agent/win`) can drop literal `"` characters when passing
  # arguments through Windows command-line parsing. For known JSON fields, prefer BASE64 vars.
  if [[ "$value" == *"\""* ]]; then
    if [[ "$key" == "AUTH_SIGNING_KEYS_JSON" ]]; then
      read_pairs+=("AUTH_SIGNING_KEYS_JSON_BASE64=$(base64_encode_single_line "$value")")
      read_keys+=("AUTH_SIGNING_KEYS_JSON_BASE64")
      unset_keys+=("AUTH_SIGNING_KEYS_JSON")
      continue
    fi
    if [[ "$key" == "FCM_SERVICE_ACCOUNT_JSON" ]]; then
      read_pairs+=("FCM_SERVICE_ACCOUNT_JSON_BASE64=$(base64_encode_single_line "$value")")
      read_keys+=("FCM_SERVICE_ACCOUNT_JSON_BASE64")
      unset_keys+=("FCM_SERVICE_ACCOUNT_JSON")
      continue
    fi

    echo "Refusing to set key '$key': value contains double quotes and may not survive Windows argument parsing." >&2
    echo "Use a BASE64/encoded variant for this secret." >&2
    exit 2
  fi

  read_pairs+=("${key}=${value}")
  read_keys+=("$key")
done < "$env_file"

if [[ ${#read_pairs[@]} -eq 0 ]]; then
  echo "No keys to sync from '$env_file' (after filtering)." >&2
  exit 0
fi

echo "Will set ${#read_pairs[@]} config vars on Heroku app '$app':"
printf ' - %s\n' "${read_keys[@]}"

if [[ "$dry_run" == "true" ]]; then
  echo "Dry run only; not applying changes."
  exit 0
fi

if [[ "$assume_yes" == "false" ]]; then
  read -r -p "Apply these to Heroku now? [y/N] " reply
  reply="${reply:-N}"
  if [[ ! "$reply" =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
  fi
fi

# Heroku CLI args can get large; set in small batches.
batch_size=20
total=${#read_pairs[@]}
idx=0

while ((idx < total)); do
  batch=("${read_pairs[@]:idx:batch_size}")
  bash tools/agent/win heroku config:set --app "$app" "${batch[@]}" >/dev/null
  idx=$((idx + batch_size))
done

if [[ ${#unset_keys[@]} -gt 0 ]]; then
  bash tools/agent/win heroku config:unset --app "$app" "${unset_keys[@]}" >/dev/null
fi

echo "Done. You can verify with:"
echo "  bash tools/agent/win heroku config:get --app $app PUSH_PROVIDER"
