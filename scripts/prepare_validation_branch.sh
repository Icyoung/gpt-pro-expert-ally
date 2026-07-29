#!/usr/bin/env bash
set -euo pipefail

# Legacy reconstruction helper for downloads created before immutable round
# input/output branches. New delegations must use freeze_round_input.sh and
# import_round_output.sh.
readonly BRANCH_PREFIX="codex/gpt-pro"

usage() {
  cat >&2 <<'EOF'
usage: prepare_validation_branch.sh \
  --repo DIR \
  --baseline COMMIT \
  --task SLUG \
  --revision N \
  --worktree DIR \
  --input-tree DIR \
  --patch FILE \
  --report-dir DIR
EOF
  exit 2
}

repo_root=""
baseline=""
task_slug=""
revision=""
worktree_path=""
input_tree=""
patch_file=""
report_dir=""

while (($#)); do
  case "$1" in
    --repo)
      (($# >= 2)) || usage
      repo_root="$2"
      shift 2
      ;;
    --baseline)
      (($# >= 2)) || usage
      baseline="$2"
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
    --worktree)
      (($# >= 2)) || usage
      worktree_path="$2"
      shift 2
      ;;
    --input-tree)
      (($# >= 2)) || usage
      input_tree="$2"
      shift 2
      ;;
    --patch)
      (($# >= 2)) || usage
      patch_file="$2"
      shift 2
      ;;
    --report-dir)
      (($# >= 2)) || usage
      report_dir="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$repo_root" && -n "$baseline" && -n "$task_slug" ]] || usage
[[ -n "$revision" && -n "$worktree_path" && -n "$input_tree" ]] || usage
[[ -n "$patch_file" && -n "$report_dir" ]] || usage
[[ "$task_slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
  echo "task must be a lowercase hyphen slug: $task_slug" >&2
  exit 2
}
[[ "$revision" =~ ^[1-9][0-9]*$ ]] || {
  echo "revision must be a positive integer: $revision" >&2
  exit 2
}
command -v git >/dev/null || { echo "git is required" >&2; exit 2; }
command -v rsync >/dev/null || { echo "rsync is required" >&2; exit 2; }

repo_root="$(cd "$repo_root" && pwd)"
input_tree="$(cd "$input_tree" && pwd)"
patch_file="$(cd "$(dirname "$patch_file")" && pwd)/$(basename "$patch_file")"
mkdir -p "$(dirname "$report_dir")" "$(dirname "$worktree_path")"
report_parent="$(cd "$(dirname "$report_dir")" && pwd)"
report_dir="$report_parent/$(basename "$report_dir")"
worktree_parent="$(cd "$(dirname "$worktree_path")" && pwd)"
worktree_path="$worktree_parent/$(basename "$worktree_path")"
branch_name="$BRANCH_PREFIX/$task_slug-r$revision"

git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null
git -C "$repo_root" rev-parse --verify "$baseline^{commit}" >/dev/null
[[ -f "$patch_file" ]] || { echo "patch not found: $patch_file" >&2; exit 2; }
[[ ! -e "$worktree_path" ]] || {
  echo "refusing to reuse worktree path: $worktree_path" >&2
  exit 2
}
[[ ! -e "$report_dir" ]] || {
  echo "refusing to overwrite report directory: $report_dir" >&2
  exit 2
}
if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$branch_name"; then
  echo "refusing to reuse branch: $branch_name" >&2
  exit 2
fi

git -C "$repo_root" worktree add -b "$branch_name" "$worktree_path" "$baseline"

# Reconstruct the exact source bytes sent to Pro without importing packet
# metadata, runtime state, caches, or generated delivery-control files.
rsync -a \
  --exclude='.git' \
  --exclude='.runtime/' \
  --exclude='.runtime-*/' \
  --exclude='__pycache__/' \
  --exclude='.pytest_cache/' \
  --exclude='.mypy_cache/' \
  --exclude='.ruff_cache/' \
  --exclude='.cache/' \
  --exclude='*.pyc' \
  --exclude='*.pyo' \
  --exclude='.DS_Store' \
  --exclude='DELEGATION_BRIEF.md' \
  --exclude='SOURCE_BASELINE.txt' \
  --exclude='INPUT_MANIFEST.sha256' \
  --exclude='OUTPUT_MANIFEST.sha256' \
  --exclude='PRO_REPORT.md' \
  --exclude='changes.patch' \
  "$input_tree/" "$worktree_path/"

(
  cd "$worktree_path"
  git apply --check "$patch_file"
  git apply "$patch_file"
)

mkdir -p "$report_dir"
cp -p "$patch_file" "$report_dir/pro-vs-sent.patch"

{
  echo "schema=GPT_PRO_VALIDATION_BRANCH_V1"
  echo "branch=$branch_name"
  echo "branch_prefix=$BRANCH_PREFIX/"
  echo "baseline=$(git -C "$repo_root" rev-parse "$baseline^{commit}")"
  echo "primary_branch=$(git -C "$repo_root" branch --show-current)"
  echo "primary_head=$(git -C "$repo_root" rev-parse HEAD)"
  echo "worktree=$worktree_path"
  echo "input_tree=$input_tree"
  echo "patch=$patch_file"
} >"$report_dir/branch-info.txt"

git -C "$worktree_path" diff --stat >"$report_dir/candidate-vs-baseline.stat"
git -C "$worktree_path" diff --binary >"$report_dir/candidate-vs-baseline.patch"

candidate_paths="$report_dir/candidate-paths.zlist"
git -C "$worktree_path" ls-files -m -d -o --exclude-standard -z \
  | LC_ALL=C sort -zu >"$candidate_paths"

: >"$report_dir/candidate-vs-current.diff"
: >"$report_dir/candidate-vs-current.changed-paths"
while IFS= read -r -d '' relative_path; do
  current_path="$repo_root/$relative_path"
  candidate_path="$worktree_path/$relative_path"
  if [[ -e "$current_path" && -e "$candidate_path" ]] &&
    cmp -s "$current_path" "$candidate_path"; then
    continue
  fi
  printf '%s\n' "$relative_path" \
    >>"$report_dir/candidate-vs-current.changed-paths"
  current_diff_path="$current_path"
  candidate_diff_path="$candidate_path"
  [[ -e "$current_diff_path" ]] || current_diff_path="/dev/null"
  [[ -e "$candidate_diff_path" ]] || candidate_diff_path="/dev/null"
  git diff --no-index --binary -- "$current_diff_path" "$candidate_diff_path" \
    >>"$report_dir/candidate-vs-current.diff" || {
      status=$?
      [[ "$status" -eq 1 ]] || exit "$status"
    }
done <"$candidate_paths"
rm "$candidate_paths"

echo "branch=$branch_name"
echo "worktree=$worktree_path"
echo "report_dir=$report_dir"
