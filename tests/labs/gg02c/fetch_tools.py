#!/usr/bin/env python3
"""Obtém somente Rclone oficial portátil; reutiliza Restic GG-02B verificado."""

import argparse
import bz2
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import urllib.request
import uuid
import zipfile

RCLONE_VERSION = "1.76.0"
RESTIC_ARCHIVE_SHA256 = "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c"
RCLONE_ARCHIVE_SHA256 = "b00f00b3266c3764413afe599d3ec316f6f43b3e0ea8a0bc1d186d2133e46df7"
EXPECTED_BINARIES = {
    'restic': '20d4142678d0d95ec11a4759def1b73fd9190abc9ca19e4b62d067c0b387e639',
    'rclone': '62e4d3e5432f2c685f1834b8bb342058ff0611c99d048aeb44bb8d8fd611527e',
}


def require(ok, message):
    if not ok:
        raise RuntimeError(message)


def private_tree(root, pattern):
    require(root.is_absolute() and root.parent == Path('/tmp')
            and re.fullmatch(pattern, root.name) and root.resolve() == root,
            "Caminho fora da allowlist ou link.")
    for p in [root, *root.rglob('*')]:
        s = p.lstat()
        require(s.st_uid == os.getuid() and not (s.st_mode & 0o077)
                and (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode))
                and (not p.is_file() or s.st_nlink == 1), "Árvore privada inválida.")


def download(url):
    with urllib.request.urlopen(url, timeout=45) as response:
        require(response.url.startswith(('https://downloads.rclone.org/',
                                         'https://release-assets.githubusercontent.com/')),
                "Origem divergente.")
        data = response.read(64 * 1024 * 1024 + 1)
    require(len(data) <= 64 * 1024 * 1024, "Download excede limite.")
    return data


def main(bundle):
    require(os.getuid() != 0, "Não executar como root.")
    os.umask(0o077)
    private_tree(bundle, r'gg-02b-tools-[0-9a-f]{32}')
    archive = (bundle / 'restic_0.19.1_linux_amd64.bz2').read_bytes()
    require(hashlib.sha256(archive).hexdigest() == RESTIC_ARCHIVE_SHA256,
            "BLOCKED: checksum Restic divergente.")
    restic = bz2.decompress(archive)
    require(restic == (bundle / 'restic').read_bytes(), "BLOCKED: binário Restic divergente.")
    root = Path('/tmp') / ('gg-02c-tools-' + uuid.uuid4().hex)
    root.mkdir(mode=0o700)
    # Mirror oficial indicado em rclone.org/downloads; sem fallback após checksum inválido.
    base = f'https://github.com/rclone/rclone/releases/download/v{RCLONE_VERSION}/'
    name = f'rclone-v{RCLONE_VERSION}-linux-amd64.zip'
    sums = download(base + 'SHA256SUMS')
    data = download(base + name)
    matches = [line.split()[0] for line in sums.decode().splitlines()
               if line.split() and line.split()[-1].lstrip('*') == name]
    actual = hashlib.sha256(data).hexdigest()
    require(len(matches) == 1 and actual == matches[0] == RCLONE_ARCHIVE_SHA256,
            "BLOCKED: checksum Rclone divergente; não executar.")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        rclone = z.read(f'rclone-v{RCLONE_VERSION}-linux-amd64/rclone')
    for filename, content in [('restic', restic), ('rclone', rclone),
                              ('SHA256SUMS', sums), (name, data)]:
        with (root / filename).open('xb') as stream:
            stream.write(content)
    for filename in ('restic', 'rclone'):
        (root / filename).chmod(0o700)
    provenance = {
        'rclone_version': RCLONE_VERSION, 'rclone_asset_url': base + name,
        'rclone_checksums_url': base + 'SHA256SUMS',
        'rclone_archive_sha256': actual, 'official_checksum_match': True,
        'restic_version': '0.19.1', 'restic_reused_from_gg02b': True,
        'restic_archive_sha256': RESTIC_ARCHIVE_SHA256,
        'restic_release': 'https://github.com/restic/restic/releases/tag/v0.19.1',
        'binaries': {n: hashlib.sha256(b).hexdigest() for n, b in
                     [('restic', restic), ('rclone', rclone)]},
        'signature_verified': False, 'global_install': False,
    }
    with (root / 'provenance.json').open('x') as stream:
        json.dump(provenance, stream, indent=2)
        stream.write('\n')
    print(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--restic-bundle', required=True, type=Path)
    main(parser.parse_args().restic_bundle)
