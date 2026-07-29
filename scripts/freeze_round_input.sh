#!/usr/bin/env bash
set -euo pipefail

readonly BRANCH_PREFIX="codex/gpt-pro"

usage() {
  cat >&2 <<'EOF'
usage: freeze_round_input.sh \
  --repo DIR \
  --task SLUG \
  --revision N \
  --brief FILE \
  --output FILE.zip \
  [--path TRACKED_RELPATH]... \
  [--evidence FILE]...
EOF
  exit 2
}

repo_root=""
task_slug=""
revision=""
brief_file=""
output_zip=""
tracked_scopes=()
evidence_files=()

while (($#)); do
  case "$1" in
    --repo)
      (($# >= 2)) || usage
      repo_root="$2"
      shift 2
      ;;
    --task)
      (($# >= 2)) || usage
      task_slug="$2"
      shift 2
      ;;
    --revision)
      (($# >= 2)) || usage
      revision="$2"
      shift 2
      ;;
    --brief)
      (($# >= 2)) || usage
      brief_file="$2"
      shift 2
      ;;
    --output)
      (($# >= 2)) || usage
      output_zip="$2"
      shift 2
      ;;
    --path)
      (($# >= 2)) || usage
      tracked_scopes+=("$2")
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

[[ -n "$repo_root" && -n "$task_slug" && -n "$revision" ]] || usage
[[ -n "$brief_file" && -n "$output_zip" ]] || usage
[[ "$task_slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
  echo "task must be a lowercase hyphen slug: $task_slug" >&2
  exit 2
}
[[ "$revision" =~ ^[1-9][0-9]*$ ]] || {
  echo "revision must be a positive integer: $revision" >&2
  exit 2
}

repo_root="$(cd "$repo_root" && pwd)"
expected_branch="$BRANCH_PREFIX/$task_slug/r$revision-input"
actual_branch="$(git -C "$repo_root" branch --show-current)"
[[ "$actual_branch" == "$expected_branch" ]] || {
  echo "round input must be frozen from $expected_branch; current branch is $actual_branch" >&2
  exit 2
}
[[ -z "$(git -C "$repo_root" status --porcelain --untracked-files=all)" ]] || {
  echo "round input worktree must be clean before packaging" >&2
  exit 2
}

mkdir -p "$(dirname "$output_zip")"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command=(
  "$script_dir/build_source_bundle.sh"
  --repo "$repo_root"
  --output "$output_zip"
  --brief "$brief_file"
  --require-clean
  --expected-branch "$expected_branch"
)
if ((${#tracked_scopes[@]})); then
  for scope in "${tracked_scopes[@]}"; do
    command+=(--path "$scope")
  done
fi
if ((${#evidence_files[@]})); then
  for evidence in "${evidence_files[@]}"; do
    command+=(--evidence "$evidence")
  done
fi
"${command[@]}"

echo "input_branch=$expected_branch"
echo "input_commit=$(git -C "$repo_root" rev-parse HEAD)"
echo "input_tree=$(git -C "$repo_root" rev-parse HEAD^{tree})"
