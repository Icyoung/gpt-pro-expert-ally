#!/usr/bin/env python3
"""Build a sanitized local-source delta packet for an existing ChatGPT Pro task."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile


SECRET_PATTERN = re.compile(
    rb"BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY"
    rb"|AKIA[0-9A-Z]{16}"
    rb"|xox[baprs]-[A-Za-z0-9-]{16,}"
    rb"|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{24,}"
    rb"|gh[pousr]_[A-Za-z0-9]{30,}",
    re.MULTILINE,
)
UNSAFE_NAMES = {".env", ".git", "node_modules", "target", "__pycache__"}
UNSAFE_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".pyc", ".pyo"}
UNSAFE_PART_PREFIXES = (".runtime",)
UNSAFE_CACHE_PARTS = {".cache", ".pytest_cache", ".mypy_cache", ".ruff_cache"}


def fail(message: str, code: int = 2) -> "NoReturn":
    print(message, file=sys.stderr)
    raise SystemExit(code)


def run(
    args: list[str],
    *,
    cwd: Path | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        args,
        cwd=cwd,
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalize_relative(raw: str) -> PurePosixPath:
    value = raw.replace("\\", "/")
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts:
        fail(f"unsafe relative path: {raw}")
    return path


def is_excluded(path: PurePosixPath) -> bool:
    for part in path.parts:
        if part in UNSAFE_NAMES or part in UNSAFE_CACHE_PARTS:
            return True
        if any(part.startswith(prefix) for prefix in UNSAFE_PART_PREFIXES):
            return True
        if part.startswith(".env"):
            return True
    return path.suffix.lower() in UNSAFE_SUFFIXES


def reject_symlink(path: Path, label: str) -> None:
    try:
        mode = path.lstat().st_mode
    except FileNotFoundError:
        return
    if stat.S_ISLNK(mode):
        fail(f"symlink is not allowed in {label}: {path}")


def files_under(root: Path, scopes: list[PurePosixPath]) -> set[PurePosixPath]:
    result: set[PurePosixPath] = set()
    for scope in scopes:
        candidate = root.joinpath(*scope.parts)
        if not candidate.exists() and not candidate.is_symlink():
            continue
        reject_symlink(candidate, "base tree")
        if candidate.is_file():
            if not is_excluded(scope):
                result.add(scope)
            continue
        for directory, dirnames, filenames in os.walk(candidate, followlinks=False):
            directory_path = Path(directory)
            kept_dirs: list[str] = []
            for dirname in dirnames:
                child = directory_path / dirname
                relative = PurePosixPath(child.relative_to(root).as_posix())
                reject_symlink(child, "base tree")
                if not is_excluded(relative):
                    kept_dirs.append(dirname)
            dirnames[:] = kept_dirs
            for filename in filenames:
                child = directory_path / filename
                relative = PurePosixPath(child.relative_to(root).as_posix())
                reject_symlink(child, "base tree")
                if not is_excluded(relative):
                    result.add(relative)
    return result


def git_visible_files(repo: Path, scopes: list[PurePosixPath]) -> set[PurePosixPath]:
    command = [
        "git",
        "-C",
        str(repo),
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        *[str(scope) for scope in scopes],
    ]
    output = run(command).stdout
    result: set[PurePosixPath] = set()
    for raw in output.split(b"\0"):
        if not raw:
            continue
        relative = normalize_relative(raw.decode("utf-8", "surrogateescape"))
        if is_excluded(relative):
            continue
        candidate = repo.joinpath(*relative.parts)
        reject_symlink(candidate, "current worktree")
        if candidate.is_file():
            result.add(relative)
    return result


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination, follow_symlinks=False)


def write_manifest(root: Path) -> None:
    manifest = root / "UPDATE_MANIFEST.sha256"
    lines = []
    for path in sorted(p for p in root.rglob("*") if p.is_file() and p != manifest):
        lines.append(f"{sha256_file(path)}  {path.relative_to(root).as_posix()}\n")
    manifest.write_text("".join(lines), encoding="utf-8")


def scan_packet(packet_root: Path, repo: Path) -> None:
    repo_bytes = str(repo).encode()
    findings = []
    for path in sorted(p for p in packet_root.rglob("*") if p.is_file()):
        relative = PurePosixPath(path.relative_to(packet_root).as_posix())
        if is_excluded(relative):
            findings.append(f"credential-like or excluded filename: {relative}")
            continue
        content = path.read_bytes()
        if SECRET_PATTERN.search(content):
            findings.append(f"high-confidence secret pattern: {relative}")
        if repo_bytes and repo_bytes in content:
            findings.append(f"local repository path: {relative}")
    if findings:
        fail("unsafe update packet:\n" + "\n".join(findings), 3)


def rewrite_diff_paths(content: bytes) -> bytes:
    return (
        content.replace(b"a/base/", b"a/")
        .replace(b"b/current/", b"b/")
        .replace(b"a/base", b"a/")
        .replace(b"b/current", b"b/")
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-tree", required=True, type=Path)
    parser.add_argument("--repo", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--brief", required=True, type=Path)
    parser.add_argument("--update-id", required=True)
    parser.add_argument("--path", action="append", required=True, dest="paths")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base_tree = args.base_tree.resolve()
    repo = args.repo.resolve()
    output = args.output.resolve()
    brief = args.brief.resolve()
    scopes = [normalize_relative(path) for path in args.paths]

    if not base_tree.is_dir():
        fail(f"base tree not found: {base_tree}")
    if not repo.is_dir():
        fail(f"repository not found: {repo}")
    if run(["git", "-C", str(repo), "rev-parse", "--is-inside-work-tree"], check=False).returncode:
        fail(f"not a Git worktree: {repo}")
    if not brief.is_file():
        fail(f"brief not found: {brief}")
    if output.exists():
        fail(f"refusing to overwrite: {output}")
    if not re.fullmatch(r"U[0-9]{3,}", args.update_id):
        fail("update ID must match U001, U002, ...")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pro-local-update.") as temporary:
        staging = Path(temporary)
        base_snapshot = staging / "base"
        current_snapshot = staging / "current"
        packet = staging / "local-update-packet"
        current_files_root = packet / "current-files"
        base_snapshot.mkdir()
        current_snapshot.mkdir()
        packet.mkdir()

        base_files = files_under(base_tree, scopes)
        current_files = git_visible_files(repo, scopes)
        for relative in base_files:
            copy_file(
                base_tree.joinpath(*relative.parts),
                base_snapshot.joinpath(*relative.parts),
            )
        for relative in current_files:
            copy_file(
                repo.joinpath(*relative.parts),
                current_snapshot.joinpath(*relative.parts),
            )

        added = sorted(current_files - base_files)
        deleted = sorted(base_files - current_files)
        modified = sorted(
            relative
            for relative in base_files & current_files
            if sha256_file(base_tree.joinpath(*relative.parts))
            != sha256_file(repo.joinpath(*relative.parts))
        )
        if not (added or deleted or modified):
            fail("empty delta: selected local bytes match the Pro-known snapshot")

        for relative in [*added, *modified]:
            copy_file(
                repo.joinpath(*relative.parts),
                current_files_root.joinpath(*relative.parts),
            )

        changed_lines = [
            *[f"A\t{path}\n" for path in added],
            *[f"M\t{path}\n" for path in modified],
            *[f"D\t{path}\n" for path in deleted],
        ]
        (packet / "CHANGED_PATHS.tsv").write_text(
            "".join(changed_lines), encoding="utf-8"
        )
        (packet / "DELETED_PATHS.txt").write_text(
            "".join(f"{path}\n" for path in deleted), encoding="utf-8"
        )

        diff = run(
            [
                "git",
                "diff",
                "--no-index",
                "--no-renames",
                "--no-ext-diff",
                "--no-textconv",
                "--",
                "base",
                "current",
            ],
            cwd=staging,
            check=False,
        )
        if diff.returncode not in (0, 1):
            fail(diff.stderr.decode("utf-8", "replace"))
        patch = rewrite_diff_paths(diff.stdout)
        (packet / "incremental.patch").write_bytes(patch)

        diffstat = run(
            ["git", "apply", "--stat", str(packet / "incremental.patch")],
            cwd=staging,
        )
        (packet / "DIFFSTAT.txt").write_bytes(diffstat.stdout)

        copy_file(brief, packet / "LOCAL_UPDATE_BRIEF.md")
        head = run(["git", "-C", str(repo), "rev-parse", "HEAD"]).stdout.decode().strip()
        branch = (
            run(["git", "-C", str(repo), "branch", "--show-current"])
            .stdout.decode()
            .strip()
        )
        status_output = run(
            ["git", "-C", str(repo), "status", "--short", "--branch"]
        ).stdout.decode("utf-8", "replace")
        baseline = (
            "schema=CHATGPT_PRO_LOCAL_UPDATE_V1\n"
            f"update_id={args.update_id}\n"
            f"current_commit={head}\n"
            f"current_branch={branch}\n"
            "current_selected_bytes_are_authoritative=true\n"
            f"selected_paths={' '.join(str(path) for path in scopes)}\n"
            "git_status_begin\n"
            f"{status_output}"
            "git_status_end\n"
        )
        (packet / "LOCAL_UPDATE_BASELINE.txt").write_text(
            baseline, encoding="utf-8"
        )

        scan_packet(packet, repo)
        write_manifest(packet)

        with zipfile.ZipFile(
            output, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=9
        ) as archive:
            for path in sorted(p for p in packet.rglob("*") if p.is_file()):
                archive.write(path, path.relative_to(staging).as_posix())

    with zipfile.ZipFile(output) as archive:
        bad_member = archive.testzip()
        if bad_member:
            fail(f"archive integrity failure: {bad_member}", 3)
    digest = sha256_file(output)
    digest_path = Path(f"{output}.sha256")
    digest_path.write_text(f"{digest}  {output.name}\n", encoding="utf-8")
    print(f"archive={output}")
    print(f"bytes={output.stat().st_size}")
    print(f"sha256={digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
