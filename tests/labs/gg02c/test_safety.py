#!/usr/bin/env python3
"""Testes negativos locais; não baixam ferramentas nem leem dados externos."""

import os
from pathlib import Path
import sys
import unittest
import uuid

import lab


class Safety(unittest.TestCase):
    def setUp(self):
        os.umask(0o077)
        self.root = Path('/tmp') / ('gg-02c-' + uuid.uuid4().hex)
        self.root.mkdir(mode=0o700)
        (self.root / 'LAB').write_text(lab.MARKER)
        (self.root / 'home').mkdir(mode=0o700)
        (self.root / 'tmp').mkdir(mode=0o700)

    # Evidências preservadas; sem teardown destrutivo.
    def test_valid_private_lab(self):
        lab.guard(self.root)

    def test_arbitrary_path(self):
        with self.assertRaises(RuntimeError):
            lab.guard(Path('/var/backups'))

    def test_relative_path(self):
        with self.assertRaises(RuntimeError):
            lab.guard(Path('gg-02c-' + uuid.uuid4().hex))

    def test_remote_path(self):
        with self.assertRaises(RuntimeError):
            lab.guard(Path('rclone:drive:backup'))

    def test_bad_uuid(self):
        with self.assertRaises(RuntimeError):
            lab.guard(Path('/tmp/gg-02c-not-a-uuid'))

    def test_root_symlink(self):
        link = Path('/tmp') / ('gg-02c-' + uuid.uuid4().hex)
        link.symlink_to(self.root)
        with self.assertRaises(RuntimeError):
            lab.guard(link)

    def test_nested_symlink(self):
        (self.root / 'home/link').symlink_to('/var/backups')
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_marker_symlink(self):
        (self.root / 'LAB').rename(self.root / 'marker-original')
        (self.root / 'LAB').symlink_to('/nonexistent-gg02c')
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_hardlink(self):
        os.link(self.root / 'LAB', self.root / 'copy')
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_fifo(self):
        os.mkfifo(self.root / 'fifo', mode=0o600)
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_world_readable_root(self):
        self.root.chmod(0o755)
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_world_readable_file(self):
        (self.root / 'LAB').chmod(0o644)
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_invalid_marker(self):
        (self.root / 'LAB').write_text('not a synthetic lab\n')
        with self.assertRaises(RuntimeError):
            lab.guard(self.root)

    def test_environment_has_no_inherited_secrets(self):
        os.environ['RESTIC_PASSWORD'] = 'synthetic-inherited-secret'
        os.environ['RCLONE_CONFIG'] = '/nonexistent-config'
        env = lab.clean_env(self.root)
        self.assertNotIn('RESTIC_PASSWORD', env)
        self.assertNotIn('RCLONE_CONFIG', env)
        self.assertEqual(env['HOME'], str(self.root / 'home'))

    def test_exclusive_evidence(self):
        lab.save(self.root / 'evidence.json', {'synthetic': True})
        with self.assertRaises(FileExistsError):
            lab.save(self.root / 'evidence.json', {'synthetic': False})

    def test_timeout(self):
        with self.assertRaisesRegex(RuntimeError, 'TIMEOUT'):
            lab.execute([sys.executable, '-c', 'import time; time.sleep(5)'],
                        self.root / 'home', lab.clean_env(self.root), timeout=0.1)

    def test_secondary_cannot_access_primary(self):
        runner = object.__new__(lab.Lab)
        runner.root = self.root
        runner.secondary_only = True
        with self.assertRaisesRegex(RuntimeError, 'Modo secundário'):
            runner.command('forbidden', ['snapshots'], repo='primary')

    def test_forbidden_command(self):
        runner = object.__new__(lab.Lab)
        runner.root = self.root
        runner.secondary_only = False
        with self.assertRaisesRegex(RuntimeError, 'Comando fora'):
            runner.command('forbidden', ['prune'])

    def test_arbitrary_repository(self):
        runner = object.__new__(lab.Lab)
        runner.root = self.root
        runner.secondary_only = False
        with self.assertRaisesRegex(RuntimeError, 'Repositório fora'):
            runner.command('forbidden', ['snapshots'], repo='/var/backups')

    def test_extra_or_modified_source_refused(self):
        source = self.root / 'source'
        source.mkdir(mode=0o700)
        for name, content in lab.fixture(1).items():
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            path.write_bytes(content)
        lab.verify(source, 1)
        (source / 'data/database.txt').write_bytes(b'synthetic tampering')
        with self.assertRaises(RuntimeError):
            lab.verify(source, 1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
