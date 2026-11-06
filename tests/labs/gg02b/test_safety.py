"""Testes de contenção: não simulam sucesso de backup/criptografia Restic."""

import json
import os
import subprocess
from pathlib import Path
import unittest
from unittest.mock import patch
import uuid

import lab


class SafetyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.umask(0o077)
        cls.prepared = lab.prepare()

    def fresh(self):
        root = Path("/tmp") / (lab.PREFIX + uuid.uuid4().hex)
        root.mkdir(mode=0o700)
        (root / "LAB.json").write_text(json.dumps({"kind": lab.MARKER}) + "\n")
        return root

    def test_original_fixture_and_manifests(self):
        checked = lab.verify_source(self.prepared / "source", 1)
        self.assertEqual(checked["files"], 5)
        self.assertGreater(checked["bytes"], 32 * lab.MIB)
        self.assertEqual(lab.expected(1), json.loads(
            (self.prepared / "evidence/expected-v1.json").read_text()))
        self.assertNotEqual(lab.expected(1)["objects/blob-a.bin"],
                            lab.expected(2)["objects/blob-a.bin"])
        self.assertEqual(lab.expected(1)["objects/blob-a.bin"],
                         lab.expected(1)["objects/blob-duplicate.bin"])

    def test_operational_remote_relative_and_traversal_paths_refused(self):
        for raw in ("/", "/tmp", "/opt/gaucha-gestao", "/armazenamento2",
                    ".", "sftp:host:/repo", "rclone:drive:repo", "/tmp/gg-02b-invalid",
                    str(self.prepared) + "/../" + self.prepared.name):
            with self.subTest(raw=raw), self.assertRaises(lab.Refused):
                lab.validate_lab(raw)

    def test_root_symlink_refused(self):
        link = Path("/tmp") / (lab.PREFIX + uuid.uuid4().hex)
        link.symlink_to(self.prepared, target_is_directory=True)
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(link))

    def test_inner_symlink_refused_before_content_read(self):
        root = self.fresh()
        (root / "foreign").symlink_to("/etc/passwd")
        with patch.object(Path, "read_text", side_effect=AssertionError("leitura proibida")):
            with self.assertRaises(lab.Refused):
                lab.validate_lab(str(root))

    def test_hardlink_refused(self):
        root = self.fresh()
        (root / "synthetic").write_text("GG-02B FICTICIO")
        os.link(root / "synthetic", root / "duplicate-link")
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(root))

    def test_fifo_refused_without_blocking_read(self):
        root = self.fresh()
        os.mkfifo(root / "fifo", 0o600)
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(root))

    def test_permissions_and_marker_refused(self):
        root = self.fresh()
        root.chmod(0o755)
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(root))
        root.chmod(0o700)
        (root / "LAB.json").write_text("outro laboratorio")
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(root))

    def test_unexpected_source_file_refused(self):
        root = self.fresh()
        (root / "foreign.txt").write_text("GG-02B ARQUIVO EXTRA SINTETICO")
        with self.assertRaises(lab.Refused):
            lab.verify_source(root, 1)

    def test_changed_content_refused(self):
        root = self.fresh()
        # Mantém nomes e tamanhos corretos para exercitar a comparação de bytes.
        with patch.object(lab, "fixture", return_value={"fake.txt": b"ficticio-1"}):
            (root / "fake.txt").write_bytes(b"ficticio-2")
            with self.assertRaises(lab.Refused):
                lab.verify_source(root, 1)

    def test_no_inherited_credentials_or_remote_configuration(self):
        with patch.dict(os.environ, {"RESTIC_REPOSITORY": "sftp:invalid:/repo",
                                   "RESTIC_PASSWORD": "synthetic-test-value",
                                   "RCLONE_CONFIG": "/tmp/invalid",
                                   "HTTPS_PROXY": "http://invalid"}):
            env = lab.clean_env(self.prepared)
        self.assertFalse(any(k.startswith(("RESTIC_", "RCLONE_")) for k in env))
        self.assertNotIn("HTTPS_PROXY", env)
        self.assertEqual(env["HOME"], str(self.prepared / "home"))
        self.assertEqual(env["TMPDIR"], str(self.prepared / "tmp"))

    def test_missing_restic_blocks_without_creating_repositories_or_secrets(self):
        with patch.object(lab, "preflight", return_value={"tools": {"restic": None}}):
            with self.assertRaisesRegex(lab.Refused, "BLOCKED: Restic ausente"):
                lab.run(str(self.prepared))
        for name in ("primary", "primary-password", "secondary-computer", "RUN-STARTED.json"):
            self.assertFalse((self.prepared / name).exists())

    def test_secondary_recovery_refuses_primary_still_available(self):
        root = self.fresh()
        (root / "primary").mkdir()
        with self.assertRaises(lab.Refused):
            lab.recover_secondary(str(root))

    def test_evidence_cannot_be_overwritten(self):
        root = self.fresh()
        path = root / "evidence.json"
        lab.save(path, {"synthetic": True})
        with self.assertRaises(FileExistsError):
            lab.save(path, {"synthetic": False})
        self.assertTrue(json.loads(path.read_text())["synthetic"])

    def test_secondary_validation_does_not_inspect_sealed_primary(self):
        root = self.fresh()
        sealed = root / "primary-unavailable"
        sealed.mkdir()
        (sealed / "inaccessible").symlink_to("/etc/passwd")
        (root / "primary-password-unavailable").symlink_to("/etc/passwd")
        # Até symlinks no primário selado são ignorados; não há leitura dele.
        self.assertEqual(lab.validate_lab(str(root), secondary_only=True), root)
        with self.assertRaises(lab.Refused):
            lab.validate_lab(str(root))

    def test_timeout_records_failure_without_cleanup(self):
        root = self.fresh()
        (root / "evidence").mkdir()
        (root / "primary-password").write_text("GG02B-TEST-ONLY-NOT-A-REPOSITORY-KEY")
        with patch.object(lab, "preflight", return_value={"tools": {"restic": "/synthetic/restic"}}):
            runner = lab.Runner(root)
        with patch.object(lab.subprocess, "run", side_effect=subprocess.TimeoutExpired("synthetic", 120)) as call:
            with self.assertRaisesRegex(lab.Refused, "Timeout"):
                runner.command("synthetic-timeout", root / "primary", root / "primary-password", ["snapshots"])
        self.assertEqual(call.call_args.kwargs["timeout"], 120)
        record = json.loads((root / "evidence/synthetic-timeout.json").read_text())
        self.assertEqual(record["status"], "FAIL")
        self.assertTrue(record["timed_out"])
        self.assertTrue((root / "primary-password").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)
