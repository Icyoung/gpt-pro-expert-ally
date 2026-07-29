#!/usr/bin/env python3
"""Safely verify and extract one ChatGPT Pro round-output ZIP."""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import stat
import sys
import tempfile
import zipfile
from pathlib import Path, PurePosixPath


REQUIRED_MEMBERS = {
    "PRO_REPORT.md",
    "changes.patch",
    "OUTPUT_MANIFEST.sha256",
}
UNSAFE_NAMES = {".env", ".gitmodules"}
UNSAFE_SUFFIXES = {".pem", ".key", ".p12", ".pfx"}
SECRET_RE = re.compile(
    rb"BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY"
    rb"|AKIA[0-9A-Z]{16}"
    rb"|xox[baprs]-[A-Za-z0-9-]{16,}"
    rb"|(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{24,}"
    rb"|gh[pousr]_[A-Za-z0-9]{30,}",
    re.MULTILINE,
)
MANIFEST_RE = re.compile(r"^([0-9a-f]{64})[ \t]+\*?(.+)$")


def fail(message: str, code: int = 2) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def safe_relative(name: str) -> PurePosixPath:
    if not name or "\\" in name or "\x00" in name:
        fail(f"unsafe ZIP member name: {name!r}", 3)
    relative = PurePosixPath(name.rstrip("/"))
    if relative.is_absolute() or not relative.parts:
        fail(f"unsafe ZIP member path: {name}", 3)
    if any(part in {"", ".", ".."} for part in relative.parts):
        fail(f"unsafe ZIP member path: {name}", 3)
    return relative


def member_kind(info: zipfile.ZipInfo) -> str:
    unix_mode = info.external_attr >> 16
    file_type = stat.S_IFMT(unix_mode)
    if info.is_dir():
        return "dir"
    if file_type == stat.S_IFLNK:
        fail(f"symlink is not allowed in Pro output: {info.filename}", 3)
    if file_type not in {0, stat.S_IFREG}:
        fail(f"special file is not allowed in Pro output: {info.filename}", 3)
    return "file"


def packet_root(files: set[str]) -> str:
    candidates: set[str] = set()
    for name in files:
        path = PurePosixPath(name)
        if path.name == "PRO_REPORT.md":
            parent = "" if str(path.parent) == "." else f"{path.parent.as_posix()}/"
            if all(f"{parent}{required}" in files for required in REQUIRED_MEMBERS):
                candidates.add(parent)
    if len(candidates) != 1:
        fail(
            "output ZIP must contain exactly one packet root with "
            "PRO_REPORT.md, changes.patch, and OUTPUT_MANIFEST.sha256",
            3,
        )
    return candidates.pop()


def parse_manifest(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not raw_line.strip():
            continue
        match = MANIFEST_RE.fullmatch(raw_line)
        if not match:
            fail(f"invalid manifest line {line_number}: {raw_line!r}", 3)
        digest, name = match.groups()
        relative = safe_relative(name).as_posix()
        if relative == "OUTPUT_MANIFEST.sha256":
            fail("manifest must not contain its own digest", 3)
        if relative in entries:
            fail(f"duplicate manifest path: {relative}", 3)
        entries[relative] = digest
    if not entries:
        fail("OUTPUT_MANIFEST.sha256 is empty", 3)
    return entries


def scan_extracted(packet: Path) -> list[str]:
    warnings: list[str] = []
    for path in sorted(item for item in packet.rglob("*") if item.is_file()):
        relative = path.relative_to(packet)
        lowered_parts = {part.lower() for part in relative.parts}
        if ".git" in lowered_parts:
            fail(f".git content is not allowed in Pro output: {relative}", 3)
        if path.name.lower() in UNSAFE_NAMES or path.suffix.lower() in UNSAFE_SUFFIXES:
            fail(f"credential-like filename in Pro output: {relative}", 3)
        if path.stat().st_size <= 8 * 1024 * 1024:
            data = path.read_bytes()
            if SECRET_RE.search(data):
                fail(f"high-confidence secret found in Pro output: {relative}", 3)
            if b"\x00" in data and relative.as_posix() != "OUTPUT_MANIFEST.sha256":
                warnings.append(f"binary-content={relative.as_posix()}")
        if os.access(path, os.X_OK):
            warnings.append(f"executable={relative.as_posix()}")
    return warnings


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--extract-dir", required=True, type=Path)
    parser.add_argument("--report-dir", required=True, type=Path)
    parser.add_argument(
        "--max-uncompressed-bytes",
        type=int,
        default=2 * 1024 * 1024 * 1024,
    )
    args = parser.parse_args()

    archive = args.archive.expanduser().resolve()
    extract_dir = args.extract_dir.expanduser().resolve()
    report_dir = args.report_dir.expanduser().resolve()
    if not archive.is_file():
        fail(f"archive not found: {archive}")
    if extract_dir.exists() or report_dir.exists():
        fail("refusing to overwrite extract-dir or report-dir")
    if args.max_uncompressed_bytes <= 0:
        fail("--max-uncompressed-bytes must be positive")

    archive_sha = sha256_file(archive)
    archive_bytes = archive.stat().st_size
    extract_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=".pro-output-verify.", dir=extract_dir.parent)
    )
    extracted = staging / "archive"
    extracted.mkdir()
    warnings: list[str] = []

    try:
        with zipfile.ZipFile(archive) as zipped:
            infos = zipped.infolist()
            if not infos:
                fail("output ZIP is empty", 3)
            total_bytes = sum(info.file_size for info in infos)
            if total_bytes > args.max_uncompressed_bytes:
                fail(
                    f"output ZIP expands to {total_bytes} bytes, over configured limit",
                    3,
                )
            if zipped.testzip() is not None:
                fail("output ZIP failed CRC verification", 3)

            seen: set[str] = set()
            files: set[str] = set()
            for info in infos:
                relative = safe_relative(info.filename)
                normalized = relative.as_posix()
                if normalized in seen:
                    fail(f"duplicate ZIP member: {normalized}", 3)
                seen.add(normalized)
                kind = member_kind(info)
                if kind == "file" and ((info.external_attr >> 16) & 0o111):
                    warnings.append(f"executable={normalized}")
                destination = extracted.joinpath(*relative.parts)
                if kind == "dir":
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                files.add(normalized)
                destination.parent.mkdir(parents=True, exist_ok=True)
                with zipped.open(info) as source, destination.open("xb") as target:
                    shutil.copyfileobj(source, target)

        root_prefix = packet_root(files)
        outside_packet = sorted(
            name for name in files if root_prefix and not name.startswith(root_prefix)
        )
        if outside_packet:
            fail(f"files exist outside the packet root: {outside_packet}", 3)
        packet = extracted.joinpath(*PurePosixPath(root_prefix).parts)
        manifest_path = packet / "OUTPUT_MANIFEST.sha256"
        entries = parse_manifest(manifest_path)
        actual_files = {
            path.relative_to(packet).as_posix()
            for path in packet.rglob("*")
            if path.is_file() and path != manifest_path
        }
        if set(entries) != actual_files:
            missing = sorted(actual_files - set(entries))
            undeclared = sorted(set(entries) - actual_files)
            fail(
                f"manifest file set mismatch; missing={missing}, undeclared={undeclared}",
                3,
            )
        for relative, expected in entries.items():
            actual = sha256_file(packet.joinpath(*PurePosixPath(relative).parts))
            if actual != expected:
                fail(f"manifest digest mismatch: {relative}", 3)

        warnings.extend(scan_extracted(packet))
        shutil.move(str(packet), extract_dir)
        report_dir.mkdir(parents=True)
        report = report_dir / "round-output-verification.txt"
        report.write_text(
            "\n".join(
                [
                    "schema=GPT_PRO_OUTPUT_VERIFICATION_V1",
                    f"archive={archive}",
                    f"archive_bytes={archive_bytes}",
                    f"archive_sha256={archive_sha}",
                    f"packet_root={root_prefix or '.'}",
                    f"manifest_entries={len(entries)}",
                    f"extract_dir={extract_dir}",
                    *warnings,
                    "",
                ]
            ),
            encoding="utf-8",
        )
        (report_dir / f"{archive.name}.sha256").write_text(
            f"{archive_sha}  {archive.name}\n", encoding="utf-8"
        )
    finally:
        shutil.rmtree(staging, ignore_errors=True)

    print(f"archive={archive}")
    print(f"bytes={archive_bytes}")
    print(f"sha256={archive_sha}")
    print(f"extract_dir={extract_dir}")
    print(f"patch={extract_dir / 'changes.patch'}")
    print(f"pro_report={extract_dir / 'PRO_REPORT.md'}")
    print(f"verification_report={report_dir / 'round-output-verification.txt'}")


if __name__ == "__main__":
    main()
