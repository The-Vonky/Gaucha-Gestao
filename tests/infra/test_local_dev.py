import importlib.util
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("local_dev", ROOT / "infra/local/local-dev.py")
local_dev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(local_dev)


class MigrationBatchTests(unittest.TestCase):
    entry = f"insert into {local_dev.LEDGER}(version, name) values ('1', 'test');\n"

    def batch(self, source):
        file = Mock(name="migration", **{"read_text.return_value": source})
        file.name = "1_test.sql"
        return local_dev.migration_batch(file, "1", "test")

    def test_explicit_transaction_places_ledger_before_commit(self):
        body = "-- migration\nbegin;\nselect 1;\n"
        self.assertEqual(self.batch(body + "commit;\n"), body + self.entry + "commit;\n")

    def test_dollar_quoted_do_and_ledger_share_one_transaction(self):
        source = "-- migration\nDO $body$\nBEGIN\n  PERFORM '$$';\nEND;\n$body$; -- final"
        self.assertEqual(self.batch(source), "begin;\n" + source + "\n" + self.entry + "commit;\n")

    def test_rejects_incomplete_transactions_and_extra_statements_after_do(self):
        block = "do $$ begin null; end; $$;"
        for source in (
            "select 1;", "begin;\nselect 1;", "begin;\nrollback;\ncommit;",
            "begin;\ncommit;\nselect 1;", "do $$ begin null; end;",
            block + "\ncommit;\ndo $$ begin null; end; $$;",
            block + "\nbegin;\ncommit;", block + "\n\\q",
        ):
            with self.subTest(source=source), self.assertRaises(SystemExit):
                self.batch(source)

    def test_prepares_all_current_migrations_and_wraps_sales_do(self):
        for file in local_dev.migrations():
            with self.subTest(file=file.name):
                version, name = file.stem.split("_", 1)
                batch = local_dev.migration_batch(file, version, name)
                self.assertIn(f"values ('{version}', '{name}');", batch)
                if version == "20261118132509":
                    self.assertTrue(batch.startswith("begin;\n" + file.read_text()))


class ResumeInstallTests(unittest.TestCase):
    def test_no_recreate_is_forwarded_to_both_compose_starts(self):
        with (patch.object(local_dev, "cli_containers", return_value=[]),
              patch.object(local_dev, "compose") as compose,
              patch.object(local_dev, "apply") as apply):
            local_dev.install(Path("backend.env"), local_dev.PROJECT, no_recreate=True)

        self.assertEqual(compose.call_count, 2)
        for call in compose.call_args_list:
            self.assertIn("--no-recreate", call.args)
        apply.assert_called_once_with(Path("backend.env"), local_dev.PROJECT)


if __name__ == "__main__":
    unittest.main()
