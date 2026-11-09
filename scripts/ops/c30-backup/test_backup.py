"""Testes sintéticos. Docker, Restic, Rclone e systemd são simulados."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import backup

CONTAINER = "a" * 64


class BackupGuards(unittest.TestCase):
    def test_inspect_refuses_erp_even_with_valid_id(self):
        container = {
            "Id": CONTAINER, "Name": "/erp-contratos-temp-postgres-1",
            "Config": {"Labels": {"com.docker.compose.project": "erp-contratos-temp",
                                  "com.docker.compose.service": "db"}},
        }
        with patch.object(backup, "command", return_value=json.dumps([container]).encode()):
            with self.assertRaisesRegex(ValueError, "container-identity"):
                backup.inspect("db", CONTAINER)

    def test_capture_requires_supervisor_before_touching_target(self):
        with patch.dict(backup.os.environ, {}, clear=True), patch.object(backup, "target") as target:
            with self.assertRaisesRegex(ValueError, "systemd-watchdog-required"):
                backup.capture()
        target.assert_not_called()

    def test_thaw_retries_only_stopped_writers_and_keeps_journal_on_failure(self):
        ids = {name: f"{number:064x}" for number, name in enumerate(backup.WRITERS, 1)}
        with tempfile.TemporaryDirectory() as state:
            journal = Path(state) / backup.JOURNAL
            journal.write_text(json.dumps(ids))
            running = {"rest"}

            def inspect(name, ref):
                self.assertEqual(ref, ids[name])
                return {"State": {"Running": name in running}}

            def start(operation, ref, seconds):
                self.assertEqual(operation, "start")
                name = next(name for name, container in ids.items() if ref == container)
                if name == "auth":
                    raise OSError()
                running.add(name)

            with patch.object(backup, "STATE", Path(state)), patch.object(backup, "private"), \
                    patch.object(backup, "inspect", side_effect=inspect), \
                    patch.object(backup, "docker", side_effect=start) as docker:
                with self.assertRaisesRegex(ValueError, "thaw-incomplete"):
                    backup.thaw()
                self.assertTrue(journal.exists())
                self.assertEqual([call.args[1] for call in docker.call_args_list],
                                 [ids["storage"], ids["auth"], ids["kong"]])
                running.add("auth")
                backup.thaw()
                self.assertFalse(journal.exists())
                self.assertEqual(docker.call_count, 3)

    def test_manifest_detects_alterations_extras_and_links(self):
        with tempfile.TemporaryDirectory() as directory:
            package = Path(directory)
            (package / "structure").mkdir()
            for name in ("postgres.dump", "roles.sql", "storage.tar", "recovery.age", "structure/rebuild.json"):
                (package / name).write_bytes(b"synthetic")
            index = {"schema": 1, "scope": backup.PROJECT, "capture_id": "a" * 32,
                     "files": backup.manifest(package)}
            backup.atomic_json(package / "manifest.json", index)
            self.assertEqual(backup.verify(package), index)
            extra = package / "other"
            extra.touch()
            with self.assertRaisesRegex(ValueError, "package-integrity"):
                backup.verify(package)
            extra.unlink()
            extra.symlink_to(package / "postgres.dump")
            with self.assertRaisesRegex(ValueError, "unsupported-tree-entry"):
                backup.verify(package)
            extra.unlink()
            (package / "roles.sql").write_bytes(b"tampered!")
            with self.assertRaisesRegex(ValueError, "package-integrity"):
                backup.verify(package)

    def test_quota_requires_room_for_full_capture_plus_reserve(self):
        with patch.object(backup, "command", return_value=b'{"total":1500,"free":1300}'):
            backup.check_quota({"drive_reserve_bytes": 200}, {}, 1099)
            with self.assertRaisesRegex(ValueError, "drive-quota-or-reserve"):
                backup.check_quota({"drive_reserve_bytes": 200}, {}, 1100)

    def test_upload_retry_reuses_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as state:
            package = Path(state) / "pending"
            package.mkdir()
            data = {"capture_id": "b" * 32, "captured_at": "synthetic", "files": {}}
            existing = json.dumps([{"id": CONTAINER}]).encode()
            with patch.object(backup, "verify", return_value=data), patch.object(backup, "drive_env"), \
                    patch.object(backup, "STATE", Path(state)), patch.object(backup, "command") as command, \
                    patch.object(backup, "restic", side_effect=[existing, b"", existing]) as restic:
                backup.upload(package, {})
                command.assert_not_called()
                self.assertEqual([call.args[2] for call in restic.call_args_list], ["snapshots", "check", "snapshots"])
                self.assertFalse(package.exists())
                self.assertEqual(json.loads((Path(state) / "last-success.json").read_text())["snapshot"], CONTAINER)

    def test_drive_remote_rejects_shared_client_wider_scope_and_other_folder(self):
        settings = {"drive_folder_id": "synthetic-folder"}
        with tempfile.TemporaryDirectory() as config:
            (Path(config) / "drive").mkdir()
            path = Path(config) / "drive/rclone.conf"
            lines = ["[gg-c30]", "type = drive", "scope = drive.file",
                     "client_id = 123-synthetic.apps.googleusercontent.com", "client_secret = fictional",
                     'token = {"refresh_token":"fictional"}', "root_folder_id = synthetic-folder"]
            with patch.object(backup, "CONFIG", Path(config)), patch.object(backup, "private"):
                path.write_text("\n".join(lines))
                self.assertEqual(backup.drive_env(settings)["RCLONE_CONFIG"], str(path))
                for position, line in [(2, "scope = drive"), (3, "client_id = " + backup.SHARED_CLIENT),
                                       (6, "root_folder_id = other-synthetic-folder")]:
                    changed = lines.copy()
                    changed[position] = line
                    path.write_text("\n".join(changed))
                    with self.assertRaisesRegex(ValueError, "drive-client-scope-or-folder"):
                        backup.drive_env(settings)


if __name__ == "__main__":
    unittest.main()
