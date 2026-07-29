#!/usr/bin/env bash
set -euo pipefail

readonly BRANCH_PREFIX="codex/gpt-pro"

usage() {
  cat >&2 <<'EOF'
usage: import_round_output.sh \
  --repo DIR \
  --task SLUG \
  --revision N \
  --input-branch REF \
  --worktree DIR \
  --patch FILE \
  --delivery-sha256 HEX \
  --report-dir DIR \
  --authorize-commit
EOF
  exit 2
}

repo_root=""
task_slug=""
revision=""
input_branch=""
worktree_path=""
patch_file=""
delivery_sha=""
report_dir=""
authorize_commit=0

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
    --input-branch)
      (($# >= 2)) || usage
      input_branch="$2"
      shift 2
      ;;
    --worktree)
      (($# >= 2)) || usage
      worktree_path="$2"
      shift 2
      ;;
    --patch)
      (($# >= 2)) || usage
      patch_file="$2"
      shift 2
      ;;
    --delivery-sha256)
      (($# >= 2)) || usage
      delivery_sha="$2"
      shift 2
      ;;
    --report-dir)
      (($# >= 2)) || usage
      report_dir="$2"
      shift 2
      ;;
    --authorize-commit)
      authorize_commit=1
      shift
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$repo_root" && -n "$task_slug" && -n "$revision" ]] || usage
[[ -n "$input_branch" && -n "$worktree_path" && -n "$patch_file" ]] || usage
[[ -n "$delivery_sha" && -n "$report_dir" ]] || usage
[[ "$authorize_commit" -eq 1 ]] || {
  echo "refusing to create the Pro output commit without --authorize-commit" >&2
  exit 2
}
[[ "$task_slug" =~ ^[a-z0-9][a-z0-9-]*$ ]] || {
  echo "task must be a lowercase hyphen slug: $task_slug" >&2
  exit 2
}
[[ "$revision" =~ ^[1-9][0-9]*$ ]] || {
  echo "revision must be a positive integer: $revision" >&2
  exit 2
}
[[ "$delivery_sha" =~ ^[0-9a-f]{64}$ ]] || {
  echo "delivery SHA-256 must be 64 lowercase hexadecimal characters" >&2
  exit 2
}

command -v git >/dev/null || { echo "git is required" >&2; exit 2; }
repo_root="$(cd "$repo_root" && pwd)"
patch_file="$(cd "$(dirname "$patch_file")" && pwd)/$(basename "$patch_file")"
[[ -f "$patch_file" ]] || { echo "patch not found: $patch_file" >&2; exit 2; }
git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null
input_commit="$(git -C "$repo_root" rev-parse --verify "$input_branch^{commit}")"
output_branch="$BRANCH_PREFIX/$task_slug/r$revision-output"

[[ ! -e "$worktree_path" ]] || {
  echo "refusing to reuse worktree path: $worktree_path" >&2
  exit 2
}
[[ ! -e "$report_dir" ]] || {
  echo "refusing to overwrite report directory: $report_dir" >&2
  exit 2
}
if git -C "$repo_root" show-ref --verify --quiet "refs/heads/$output_branch"; then
  echo "refusing to reuse branch: $output_branch" >&2
  exit 2
fi

mkdir -p "$(dirname "$worktree_path")" "$(dirname "$report_dir")"
git -C "$repo_root" worktree add -b "$output_branch" "$worktree_path" "$input_commit"

(
  cd "$worktree_path"
  git apply --check --whitespace=error-all "$patch_file"
  git apply --whitespace=nowarn "$patch_file"
)

changed_paths_file="$(mktemp "${TMPDIR:-/tmp}/pro-output-paths.XXXXXX")"
cleanup() {
  rm -f "$changed_paths_file"
}
trap cleanup EXIT
git -C "$worktree_path" ls-files -m -d -o --exclude-standard -z >"$changed_paths_file"
[[ -s "$changed_paths_file" ]] || {
  echo "Pro patch produced no source changes" >&2
  exit 2
}

while IFS= read -r -d '' relative_path; do
  case "$relative_path" in
    ""|/*|../*|*/../*|*/..|.git|.git/*|*/.git|*/.git/*|.gitmodules|\
    node_modules|node_modules/*|*/node_modules|*/node_modules/*|\
    target|target/*|*/target|*/target/*|\
    .cache|.cache/*|*/.cache|*/.cache/*|\
    .runtime|.runtime/*|.runtime-*|.runtime-*/*|*/.runtime|*/.runtime/*|*/.runtime-*|*/.runtime-*/*|\
    __pycache__|__pycache__/*|*/__pycache__|*/__pycache__/*|\
    .pytest_cache|.pytest_cache/*|*/.pytest_cache|*/.pytest_cache/*|\
    .mypy_cache|.mypy_cache/*|*/.mypy_cache|*/.mypy_cache/*|\
    .ruff_cache|.ruff_cache/*|*/.ruff_cache|*/.ruff_cache/*|\
    .env|.env.*|*/.env|*/.env.*|*.pyc|*.pyo|*.pem|*.key|*.p12|*.pfx)
      echo "unsafe or runtime-only path in Pro patch: $relative_path" >&2
      exit 3
      ;;
  esac
  if [[ -L "$worktree_path/$relative_path" ]]; then
    echo "symlink is not allowed in Pro output: $relative_path" >&2
    exit 3
  fi
done <"$changed_paths_file"

patch_sha="$(shasum -a 256 "$patch_file" | awk '{print $1}')"
git -C "$worktree_path" add -A -- .
git -C "$worktree_path" -c core.hooksPath=/dev/null commit \
  -m "pro($task_slug): import revision $revision output" \
  -m "GPT-Pro-Input: $input_commit
GPT-Pro-Delivery-SHA256: $delivery_sha
GPT-Pro-Patch-SHA256: $patch_sha"

output_commit="$(git -C "$worktree_path" rev-parse HEAD)"
output_parent="$(git -C "$worktree_path" rev-parse HEAD^)"
[[ "$output_parent" == "$input_commit" ]] || {
  echo "output commit parent does not equal the effective Pro input commit" >&2
  exit 3
}
[[ -z "$(git -C "$worktree_path" status --porcelain --untracked-files=all)" ]] || {
  echo "output worktree is not clean after the import commit" >&2
  exit 3
}

mkdir "$report_dir"
cp -p "$patch_file" "$report_dir/pro-vs-input.patch"
git -C "$worktree_path" diff --stat "$input_commit..$output_commit" \
  >"$report_dir/pro-vs-input.stat"
git -C "$worktree_path" diff --name-status "$input_commit..$output_commit" \
  >"$report_dir/pro-vs-input.changed-paths"
{
  echo "schema=GPT_PRO_ROUND_OUTPUT_V1"
  echo "task=$task_slug"
  echo "revision=$revision"
  echo "input_branch=$input_branch"
  echo "input_commit=$input_commit"
  echo "output_branch=$output_branch"
  echo "output_commit=$output_commit"
  echo "output_parent=$output_parent"
  echo "delivery_sha256=$delivery_sha"
  echo "patch_sha256=$patch_sha"
  echo "worktree=$worktree_path"
} >"$report_dir/round-output.txt"

echo "input_branch=$input_branch"
echo "input_commit=$input_commit"
echo "output_branch=$output_branch"
echo "output_commit=$output_commit"
echo "worktree=$worktree_path"
echo "report_dir=$report_dir"
