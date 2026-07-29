#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
test_root="$(mktemp -d "${TMPDIR:-/tmp}/gpt-pro-round-test.XXXXXX")"
cleanup() {
  if [[ -n "${test_root:-}" && -d "$test_root" && "$test_root" == "${TMPDIR:-/tmp}"/gpt-pro-round-test.* ]]; then
    rm -rf "$test_root"
  fi
}
trap cleanup EXIT

repo="$test_root/repo"
mkdir "$repo"
git -C "$repo" init -q
git -C "$repo" config user.name "GPT Pro Skill Test"
git -C "$repo" config user.email "gpt-pro-skill-test@example.invalid"
printf '%s\n' "version one" >"$repo/source.txt"
git -C "$repo" add source.txt
git -C "$repo" commit -q -m "base"
git -C "$repo" switch -q -c codex/gpt-pro/demo/r1-input

brief="$test_root/DELEGATION_BRIEF.md"
printf '%s\n' "# Demo delegation" >"$brief"
input_zip="$test_root/demo-r1-input.zip"
"$script_dir/freeze_round_input.sh" \
  --repo "$repo" \
  --task demo \
  --revision 1 \
  --brief "$brief" \
  --output "$input_zip" \
  --path source.txt \
  >"$test_root/freeze.out"

input_commit="$(git -C "$repo" rev-parse HEAD)"
input_tree="$(git -C "$repo" rev-parse HEAD^{tree})"
unzip -p "$input_zip" source-packet/SOURCE_BASELINE.txt \
  >"$test_root/source-baseline.txt"
grep -Fx "branch=codex/gpt-pro/demo/r1-input" "$test_root/source-baseline.txt" >/dev/null
grep -Fx "commit=$input_commit" "$test_root/source-baseline.txt" >/dev/null
grep -Fx "tree=$input_tree" "$test_root/source-baseline.txt" >/dev/null
grep -Fx "clean_worktree=true" "$test_root/source-baseline.txt" >/dev/null

printf '%s\n' "dirty input" >>"$repo/source.txt"
if "$script_dir/freeze_round_input.sh" \
  --repo "$repo" \
  --task demo \
  --revision 1 \
  --brief "$brief" \
  --output "$test_root/dirty-input.zip" \
  --path source.txt \
  >"$test_root/dirty-freeze.out" 2>"$test_root/dirty-freeze.err"
then
  echo "dirty round input unexpectedly packaged" >&2
  exit 1
fi
grep -F "must be clean" "$test_root/dirty-freeze.err" >/dev/null
git -C "$repo" restore -- source.txt

update_worktree="$test_root/r1-input-u001"
git -C "$repo" worktree add -q \
  -b codex/gpt-pro/demo/r1-input-u001 \
  "$update_worktree" \
  "$input_commit"
printf '%s\n' "version one local update" >"$update_worktree/source.txt"
git -C "$update_worktree" add source.txt
git -C "$update_worktree" commit -q -m "local update"
mkdir "$test_root/extracted-input"
unzip -q "$input_zip" -d "$test_root/extracted-input"
update_brief="$test_root/LOCAL_UPDATE_BRIEF.md"
printf '%s\n' "# Required update" >"$update_brief"
update_zip="$test_root/demo-r1-input-u001.zip"
python3 "$script_dir/build_incremental_update_bundle.py" \
  --base-tree "$test_root/extracted-input/source-packet" \
  --base-branch codex/gpt-pro/demo/r1-input \
  --base-commit "$input_commit" \
  --base-git-tree "$input_tree" \
  --repo "$update_worktree" \
  --output "$update_zip" \
  --brief "$update_brief" \
  --update-id U001 \
  --path source.txt \
  >"$test_root/update.out"
unzip -p "$update_zip" local-update-packet/LOCAL_UPDATE_BASELINE.txt \
  >"$test_root/update-baseline.txt"
grep -Fx "base_commit=$input_commit" "$test_root/update-baseline.txt" >/dev/null
grep -Fx "current_worktree_clean=true" "$test_root/update-baseline.txt" >/dev/null

printf '%s\n' "version two" >"$repo/source.txt"
git -C "$repo" diff --binary -- source.txt >"$test_root/changes.patch"
git -C "$repo" restore -- source.txt

delivery_root="$test_root/pro-output"
mkdir "$delivery_root"
cp "$test_root/changes.patch" "$delivery_root/changes.patch"
printf '%s\n' "# Pro report" >"$delivery_root/PRO_REPORT.md"
printf '%s\n' "harmless runtime note" >"$delivery_root/debug.log"
(
  cd "$delivery_root"
  find . -type f ! -name OUTPUT_MANIFEST.sha256 -print0 \
    | sort -z \
    | xargs -0 shasum -a 256 \
    >OUTPUT_MANIFEST.sha256
)
delivery_zip="$test_root/demo-pro-output.zip"
(
  cd "$test_root"
  zip -qrX "$delivery_zip" pro-output
)
verified_output="$test_root/verified-output"
verification_report="$test_root/verification-report"
python3 "$script_dir/verify_round_output.py" \
  --archive "$delivery_zip" \
  --extract-dir "$verified_output" \
  --report-dir "$verification_report" \
  >"$test_root/verify.out"
cmp "$test_root/changes.patch" "$verified_output/changes.patch"
grep -F "archive_sha256=" \
  "$verification_report/round-output-verification.txt" >/dev/null
delivery_sha="$(shasum -a 256 "$delivery_zip" | awk '{print $1}')"

output_worktree="$test_root/r1-output"
report_dir="$test_root/report"
if "$script_dir/import_round_output.sh" \
  --repo "$repo" \
  --task demo \
  --revision 1 \
  --input-branch codex/gpt-pro/demo/r1-input \
  --worktree "$test_root/unauthorized-output" \
  --patch "$verified_output/changes.patch" \
  --delivery-sha256 "$delivery_sha" \
  --report-dir "$test_root/unauthorized-report" \
  >"$test_root/unauthorized.out" 2>"$test_root/unauthorized.err"
then
  echo "unauthorized output commit unexpectedly succeeded" >&2
  exit 1
fi
grep -F "without --authorize-commit" "$test_root/unauthorized.err" >/dev/null

"$script_dir/import_round_output.sh" \
  --repo "$repo" \
  --task demo \
  --revision 1 \
  --input-branch codex/gpt-pro/demo/r1-input \
  --worktree "$output_worktree" \
  --patch "$verified_output/changes.patch" \
  --delivery-sha256 "$delivery_sha" \
  --report-dir "$report_dir" \
  --authorize-commit \
  >"$test_root/import.out"

output_commit="$(git -C "$output_worktree" rev-parse HEAD)"
[[ "$(git -C "$output_worktree" rev-parse HEAD^)" == "$input_commit" ]]
[[ "$(git -C "$output_worktree" branch --show-current)" == "codex/gpt-pro/demo/r1-output" ]]
[[ "$(sed -n '1p' "$output_worktree/source.txt")" == "version two" ]]
grep -Fx "output_commit=$output_commit" "$report_dir/round-output.txt" >/dev/null
git -C "$output_worktree" log -1 --format=%B \
  | grep -F "GPT-Pro-Delivery-SHA256: $delivery_sha" \
  >/dev/null

echo "git round handoff test passed"
