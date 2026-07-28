#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 --repo DIR --output FILE.zip --brief FILE [--path TRACKED_RELPATH]... [--include RELPATH]... [--evidence FILE]..." >&2
  exit 2
}

repo_root=""
output_zip=""
brief_file=""
tracked_scopes=()
include_paths=()
evidence_files=()

while (($#)); do
  case "$1" in
    --repo)
      (($# >= 2)) || usage
      repo_root="$2"
      shift 2
      ;;
    --output)
      (($# >= 2)) || usage
      output_zip="$2"
      shift 2
      ;;
    --brief)
      (($# >= 2)) || usage
      brief_file="$2"
      shift 2
      ;;
    --path)
      (($# >= 2)) || usage
      tracked_scopes+=("$2")
      shift 2
      ;;
    --include)
      (($# >= 2)) || usage
      include_paths+=("$2")
      shift 2
      ;;
    --evidence)
      (($# >= 2)) || usage
      evidence_files+=("$2")
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$repo_root" && -n "$output_zip" && -n "$brief_file" ]] || usage
git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 ||
  { echo "not a Git worktree: $repo_root" >&2; exit 2; }
[[ -f "$brief_file" ]] || { echo "brief not found: $brief_file" >&2; exit 2; }
[[ ! -e "$output_zip" ]] || { echo "refusing to overwrite: $output_zip" >&2; exit 2; }
command -v rg >/dev/null || { echo "rg is required" >&2; exit 2; }
command -v zip >/dev/null || { echo "zip is required" >&2; exit 2; }

repo_root="$(cd "$repo_root" && pwd)"
output_parent="$(cd "$(dirname "$output_zip")" && pwd)"
output_zip="$output_parent/$(basename "$output_zip")"

staging_root="$(mktemp -d "${TMPDIR:-/tmp}/pro-delegation.XXXXXX")"
bundle_root="$staging_root/source-packet"
mkdir -p "$bundle_root/delegation-evidence"

cleanup() {
  if [[ -n "${staging_root:-}" && -d "$staging_root" && "$staging_root" == "${TMPDIR:-/tmp}"/pro-delegation.* ]]; then
    rm -rf "$staging_root"
  fi
}
trap cleanup EXIT

copy_relative() {
  local relative_path="$1"
  case "$relative_path" in
    ""|/*|../*|*/../*|*/..|.git|.git/*|*/.git|*/.git/*|\
    node_modules|node_modules/*|*/node_modules|*/node_modules/*|\
    target|target/*|*/target|*/target/*|\
    .cache|.cache/*|*/.cache|*/.cache/*|\
    __pycache__|__pycache__/*|*/__pycache__|*/__pycache__/*|\
    .env|.env.*|*/.env|*/.env.*|*.pem|*.key|*.p12|*.pfx)
      echo "unsafe or excluded path: $relative_path" >&2
      return 1
      ;;
  esac
  [[ -e "$repo_root/$relative_path" || -L "$repo_root/$relative_path" ]] || {
    echo "missing path: $relative_path" >&2
    return 1
  }
  if [[ -d "$repo_root/$relative_path" && ! -L "$repo_root/$relative_path" ]]; then
    echo "directory must be expanded to files: $relative_path" >&2
    return 1
  fi
  mkdir -p "$bundle_root/$(dirname "$relative_path")"
  cp -pP "$repo_root/$relative_path" "$bundle_root/$relative_path"
}

copy_tracked_scope() {
  local scope="$1"
  local found=0
  while IFS= read -r -d '' tracked_path; do
    found=1
    case "$tracked_path" in
      .env|.env.*|*/.env|*/.env.*|*.pem|*.key|*.p12|*.pfx)
        continue
        ;;
    esac
    copy_relative "$tracked_path"
  done < <(git -C "$repo_root" ls-files -z -- "$scope")
  ((found == 1)) || {
    echo "tracked scope matched no files: $scope" >&2
    return 1
  }
}

if ((${#tracked_scopes[@]})); then
  for tracked_scope in "${tracked_scopes[@]}"; do
    copy_tracked_scope "$tracked_scope"
  done
else
  copy_tracked_scope "."
fi

if ((${#include_paths[@]})); then
  for include_path in "${include_paths[@]}"; do
    if [[ -d "$repo_root/$include_path" && ! -L "$repo_root/$include_path" ]]; then
      include_found=0
      while IFS= read -r -d '' included_file; do
        include_found=1
        copy_relative "$included_file"
      done < <(
        git -C "$repo_root" ls-files -z --cached --others --exclude-standard -- "$include_path"
      )
      ((include_found == 1)) || {
        echo "include directory matched no Git-visible files: $include_path" >&2
        exit 2
      }
    else
      copy_relative "$include_path"
    fi
  done
fi

if ((${#evidence_files[@]})); then
  for evidence_file in "${evidence_files[@]}"; do
    [[ -f "$evidence_file" ]] || { echo "evidence not found: $evidence_file" >&2; exit 2; }
    evidence_name="$(basename "$evidence_file")"
    case "$evidence_name" in
      .env|.env.*|*.pem|*.key|*.p12|*.pfx)
        echo "excluded evidence file: $evidence_file" >&2
        exit 2
        ;;
    esac
    [[ ! -e "$bundle_root/delegation-evidence/$evidence_name" ]] || {
      echo "duplicate evidence basename: $evidence_name" >&2
      exit 2
    }
    cp -p "$evidence_file" "$bundle_root/delegation-evidence/$evidence_name"
  done
fi

cp -p "$brief_file" "$bundle_root/DELEGATION_BRIEF.md"

if git -C "$repo_root" rev-parse --verify HEAD >/dev/null 2>&1; then
  git_head="$(git -C "$repo_root" rev-parse HEAD)"
else
  git_head="UNBORN"
fi
git_branch="$(git -C "$repo_root" branch --show-current)"
git_status="$(git -C "$repo_root" status --short --branch)"
created_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo "schema=CHATGPT_PRO_SOURCE_BASELINE_V1"
  echo "created_utc=$created_utc"
  echo "commit=$git_head"
  echo "branch=$git_branch"
  echo "current_archive_bytes_are_authoritative=true"
  echo "tracked_scopes=${tracked_scopes[*]:-.}"
  echo "included_untracked_paths=${include_paths[*]:-}"
  echo "git_status_begin"
  echo "$git_status"
  echo "git_status_end"
} >"$bundle_root/SOURCE_BASELINE.txt"

secret_pattern='BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{16,}|(^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}'
if rg -n --hidden "$secret_pattern" "$bundle_root" >"$staging_root/secret-findings.txt"; then
  echo "high-confidence secret findings; bundle not created:" >&2
  sed -n '1,80p' "$staging_root/secret-findings.txt" >&2
  exit 3
fi

unsafe_name="$(
  find "$bundle_root" \
    \( -name '.env' -o -name '.env.*' -o -name '*.pem' -o -name '*.key' -o -name '*.p12' -o -name '*.pfx' \) \
    -print -quit
)"
if [[ -n "$unsafe_name" ]]; then
  echo "credential-like filename found; bundle not created: $unsafe_name" >&2
  exit 3
fi

if rg -n -F "$repo_root" "$bundle_root" >"$staging_root/local-path-findings.txt"; then
  echo "local absolute path findings; bundle not created:" >&2
  sed -n '1,80p' "$staging_root/local-path-findings.txt" >&2
  exit 3
fi

(
  cd "$bundle_root"
  find . -type f ! -name 'INPUT_MANIFEST.sha256' -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 \
    >INPUT_MANIFEST.sha256
)

(
  cd "$staging_root"
  zip -qrX "$output_zip" source-packet
)

unzip -t "$output_zip" >/dev/null
archive_sha="$(shasum -a 256 "$output_zip" | awk '{print $1}')"
archive_bytes="$(stat -f %z "$output_zip" 2>/dev/null || stat -c %s "$output_zip")"
printf '%s  %s\n' "$archive_sha" "$(basename "$output_zip")" >"$output_zip.sha256"

echo "archive=$output_zip"
echo "bytes=$archive_bytes"
echo "sha256=$archive_sha"
echo "commit=$git_head"
