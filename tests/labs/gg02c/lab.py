#!/usr/bin/env python3
"""GG-02C: Restic → Rclone stdio → backend local, somente massa sintética."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import stat
import subprocess
import time
import uuid

from fetch_tools import EXPECTED_BINARIES, private_tree, require

MIB = 1024 * 1024
TIMEOUT = 120
MARKER = 'GG-02C-SYNTHETIC-v1\n'
SEALED = {'primary-sealed', 'source-sealed', 'password-sealed'}
CANARY = b'GG02C_ONLY_SYNTHETIC_PLAINTEXT_CANARY_20261106'


class CommandTimeout(RuntimeError):
    def __init__(self, out, err):
        super().__init__('TIMEOUT: processo e filhos encerrados; laboratório preservado.')
        self.out = out.decode(errors='replace')
        self.err = err.decode(errors='replace')


def save(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2, ensure_ascii=False)
        stream.write('\n')


def tree(root):
    result = {}
    require(root.is_dir() and not root.is_symlink(), 'Diretório inválido.')
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            p = Path(directory) / name
            s = p.lstat()
            require(s.st_uid == os.getuid() and not (s.st_mode & 0o077)
                    and (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)),
                    'Link, permissão, proprietário ou arquivo especial recusado.')
            if stat.S_ISREG(s.st_mode):
                require(s.st_nlink == 1, 'Hardlink recusado.')
                result[str(p.relative_to(root))] = p
    return result


def guard(root):
    require(root.is_absolute() and root.parent == Path('/tmp')
            and re.fullmatch(r'gg-02c-[0-9a-f]{32}', root.name)
            and root.resolve() == root, 'Destino fora da allowlist.')
    info = root.lstat()
    require(info.st_uid == os.getuid() and stat.S_IMODE(info.st_mode) == 0o700,
            'Raiz deve ser própria e 0700.')
    # Não percorre recursos selados da origem durante a recuperação secundária.
    for p in root.iterdir():
        if p.name in SEALED:
            continue
        s = p.lstat()
        require(not (s.st_mode & 0o077) and s.st_uid == os.getuid()
                and (stat.S_ISDIR(s.st_mode) or stat.S_ISREG(s.st_mode))
                and (not stat.S_ISREG(s.st_mode) or s.st_nlink == 1), 'Entrada insegura.')
        if p.is_dir():
            tree(p)
    require((root / 'LAB').read_text() == MARKER, 'Marcador inválido.')


def fixture(version):
    blob = hashlib.shake_256(b'GG02C deterministic synthetic').digest(16 * MIB)
    data = {
        'data/objects/a.bin': blob, 'data/objects/duplicate.bin': blob,
        'data/database.txt': CANARY + b'\nfictional records v1\n',
        'data/roles.txt': b'SYNTHETIC roles; no SQL or credentials\n',
        'structure/rebuild.txt': b'SYNTHETIC structure; no executable runtime\n',
        'recovery/README.txt': b'SYNTHETIC: restore all files, verify SHA-256 manifest\n',
    }
    if version == 2:
        delta = bytearray(blob)
        delta[8 * MIB:8 * MIB + 4096] = hashlib.shake_256(b'GG02C delta').digest(4096)
        data['data/objects/a.bin'] = bytes(delta)
        data['data/database.txt'] = CANARY + b'\nfictional records v2\n'
        data['data/objects/new.bin'] = hashlib.shake_256(b'GG02C new').digest(MIB)
    manifest = {'synthetic': True, 'generation': version,
                'tools': {'restic': '0.19.1', 'rclone': '1.76.0'},
                'application': 'fictional-no-real-release',
                'files': hashes(data)}
    data['manifest.json'] = (json.dumps(manifest, sort_keys=True) + '\n').encode()
    return data


def hashes(data):
    return {n: {'bytes': len(b), 'sha256': hashlib.sha256(b).hexdigest()}
            for n, b in sorted(data.items())}


def verify(root, version):
    files = tree(root)
    expected = hashes(fixture(version))
    require(set(files) == set(expected), 'Lista restaurada divergente.')
    actual = hashes({n: p.read_bytes() for n, p in files.items()})
    require(actual == expected, 'SHA-256 ou tamanho divergente.')
    return {'status': 'PASS', 'files': len(actual), 'manifest': actual}


def clean_env(root):
    return {'PATH': os.defpath, 'HOME': str(root / 'home'), 'TMPDIR': str(root / 'tmp'),
            'LANG': 'C', 'LC_ALL': 'C', 'GOMAXPROCS': '2'}


def execute(argv, cwd, env, timeout=TIMEOUT):
    # Mata também o Rclone filho no timeout; preserva dados, locks e evidências.
    with subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE,
                          stderr=subprocess.PIPE, start_new_session=True) as process:
        try:
            out, err = process.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            out, err = process.communicate()
            raise CommandTimeout(out, err)
    return process.returncode, out.decode(errors='replace'), err.decode(errors='replace')


def inventory(repo):
    if not repo.exists():
        return {}
    return {n: {'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for n, p in tree(repo).items()}


class Lab:
    def __init__(self, tools):
        private_tree(tools, r'gg-02c-tools-[0-9a-f]{32}')
        self.tools = tools
        self.provenance = json.loads((tools / 'provenance.json').read_text())
        for n in ('restic', 'rclone'):
            require(hashlib.sha256((tools / n).read_bytes()).hexdigest()
                    == self.provenance['binaries'][n] == EXPECTED_BINARIES[n], 'Binário alterado.')
        require(os.getuid() != 0, 'Não executar como root.')
        require(shutil.disk_usage('/tmp').free >= 512 * MIB, 'Exige 512 MiB livres.')
        self.root = Path('/tmp') / ('gg-02c-' + uuid.uuid4().hex)
        self.root.mkdir(mode=0o700)
        (self.root / 'LAB').write_text(MARKER)
        for name in ('source', 'logs', 'home', 'tmp', 'secondary'):
            (self.root / name).mkdir(mode=0o700)
        for name in ('home', 'tmp'):
            (self.root / 'secondary' / name).mkdir(mode=0o700)
        for name in ('password', 'wrong-password'):
            (self.root / name).write_text(secrets.token_hex(32) + '\n')
        (self.root / 'secondary/password').write_text(secrets.token_hex(32) + '\n')
        (self.root / 'rclone.conf').write_text('# GG02C local only; no remotes or tokens\n')
        (self.root / 'unavailable').write_text('SYNTHETIC: regular file blocks destination\n')
        self.records = []
        self.secondary_only = False
        self.evidence = {'status': 'RUNNING', 'root': str(self.root),
                         'provenance': self.provenance, 'commands': self.records,
                         'script_sha256': {n: hashlib.sha256(Path(__file__).with_name(n).read_bytes()).hexdigest()
                                           for n in ('lab.py', 'fetch_tools.py')},
                         'network': 'none: rclone local backend over stdio; no TCP server'}
        self.write_fixture(1)

    def write_fixture(self, version):
        guard(self.root)
        for name, data in fixture(version).items():
            p = self.root / 'source' / name
            p.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            # Escrita somente em nomes sintéticos fixos; versão anterior validada antes.
            p.write_bytes(data)
        return verify(self.root / 'source', version)

    def command(self, label, args, repo='primary', wrong=False):
        guard(self.root)
        require(re.fullmatch(r'[a-z0-9-]+', label), 'Rótulo inválido.')
        require(repo in ('primary', 'secondary/repo', 'unavailable/repo', 'missing-config'),
                'Repositório fora da allowlist.')
        require(args and args[0] in ('init', 'backup', 'snapshots', 'restore', 'check', 'copy'),
                'Comando fora da allowlist.')
        if self.secondary_only:
            require(repo == 'secondary/repo' and args[0] in ('snapshots', 'restore', 'check'),
                    'Modo secundário não pode usar origem.')
        if args[0] == 'backup':
            require(repo == 'primary', 'Backup deve usar primário.')
            verify(self.root / 'source', 2 if label == 'changed' else 1)
        password = self.root / ('secondary/password' if repo == 'secondary/repo' else 'password')
        if wrong:
            password = self.root / 'wrong-password'
        target = self.root / repo
        endpoint = ('rclone:' + str(target) if repo != 'secondary/repo' else str(target))
        if repo == 'missing-config':
            endpoint = 'rclone:gg02c_missing_remote:synthetic'
        logfile = self.root / 'logs' / (label + '.rclone.jsonl')
        require(not logfile.exists(), 'Nunca sobrescrever log.')
        rargs = (f'serve restic --stdio --append-only --config={self.root}/rclone.conf '
                 f'--log-file={logfile} --use-json-log --log-level=INFO --stats=100ms '
                 '--stats-log-level=INFO --retries=1 --low-level-retries=1')
        argv = [str(self.tools / 'restic'), '--repo', endpoint, '--password-file', str(password),
                '--no-cache', '--compression', 'off', '-o', f'rclone.program={self.tools}/rclone',
                '-o', f'rclone.args={rargs}', '-o', 'rclone.timeout=10s', *args]
        if self.secondary_only:
            argv = [str(self.tools / 'restic'), '--repo', endpoint, '--password-file', str(password),
                    '--no-cache', '--compression', 'off', *args]
        start = time.monotonic()
        timed_out = False
        try:
            code, out, err = execute(argv, self.root / ('source' if args[0] == 'backup' else 'home'),
                                     clean_env(self.root / 'secondary' if self.secondary_only else self.root),
                                     timeout=10 if repo == 'unavailable/repo' else TIMEOUT)
        except CommandTimeout as exc:
            if repo != 'unavailable/repo':
                raise
            code, out, err = 124, exc.out, exc.err
            timed_out = True
        record = {'label': label, 'command': argv, 'exit_code': code,
                  'timeout': timed_out,
                  'seconds': round(time.monotonic() - start, 6), 'stdout': out, 'stderr': err}
        if logfile.exists():
            record['rclone_log'] = logfile.read_text()
            stats = [json.loads(s)['stats'] for s in record['rclone_log'].splitlines()
                     if 'stats' in json.loads(s)]
            # Amostragem, não contador final garantido: ausência não significa zero.
            record['rclone_accounted_bytes_sample'] = max((s['bytes'] for s in stats), default=None)
        self.records.append(record)
        save(self.root / 'logs' / (label + '.json'), record)
        require((code != 0) if wrong or repo in ('unavailable/repo', 'missing-config') else code == 0,
                f'Código de retorno inesperado em {label}: {code}.')
        return record

    def run(self):
        r = self.root
        versions = {}
        for name, flag in [('restic', 'version'), ('rclone', 'version')]:
            code, out, err = execute([str(self.tools / name), flag], r / 'home', clean_env(r), 10)
            require(code == 0, 'Falha na versão.')
            versions[name] = out.strip()
        self.evidence['versions'] = versions
        self.command('init', ['init', '--repository-version', '2'])
        self.command('wrong-credential', ['snapshots', '--json'], wrong=True)
        self.command('missing-remote', ['snapshots'], repo='missing-config')
        self.command('unavailable-destination', ['snapshots'], repo='unavailable/repo')
        self.command('recovery-after-errors', ['check', '--read-data'])
        snapshots, measures = [], []
        for label, version in [('initial', 1), ('unchanged', 1), ('changed', 2)]:
            if version == 2:
                verify(r / 'source', 1)
                self.write_fixture(2)
            before = inventory(r / 'primary')
            result = self.command(label, ['backup', '.', '--json', '--host', 'gg02c-synthetic',
                                          '--tag', label])
            summaries = [json.loads(line) for line in result['stdout'].splitlines()
                         if line.startswith('{') and json.loads(line).get('message_type') == 'summary']
            require(len(summaries) == 1, 'Resumo backup ausente.')
            summary = summaries[0]
            snapshots.append((summary['snapshot_id'], label, version))
            after = inventory(r / 'primary')
            added = {n: v for n, v in after.items() if n not in before}
            require(all(after.get(n) == v for n, v in before.items()), 'Objetos prévios alterados.')
            measures.append({'label': label, 'seconds': result['seconds'], 'summary': summary,
                             'rclone_accounted_bytes_sample': result.get('rclone_accounted_bytes_sample'),
                             'new_persisted_object_bytes': sum(v['bytes'] for v in added.values()),
                             'new_persisted_objects': len(added),
                             'repository_bytes': sum(v['bytes'] for v in after.values()),
                             'logical_bytes': sum(len(b) for b in fixture(version).values())})
        require(measures[1]['summary']['data_added_packed'] == 0
                and measures[1]['summary']['data_blobs'] == 0
                and measures[1]['summary']['tree_blobs'] == 0, 'Deduplicação inalterada falhou.')
        self.evidence['measurements'] = measures
        restored = []
        for snapshot, label, version in snapshots:
            dest = r / ('restore-primary-' + label)
            self.command('restore-primary-' + label, ['restore', snapshot, '--target', str(dest)])
            restored.append({'repository': 'primary', 'label': label, **verify(dest, version)})
        self.command('check-primary', ['check', '--read-data'])
        from_args = ['--from-repo', 'rclone:' + str(r / 'primary'),
                     '--from-password-file', str(r / 'password')]
        self.command('init-secondary', ['init', '--copy-chunker-params', *from_args], repo='secondary/repo')
        self.command('copy-secondary', ['copy', *from_args], repo='secondary/repo')
        self.command('wrong-secondary-credential', ['snapshots'], repo='secondary/repo', wrong=True)
        # Confirma ausência do canário em todos os objetos dos dois repositórios.
        for repo in ('primary', 'secondary/repo'):
            require(all(CANARY not in p.read_bytes() for p in tree(r / repo).values()),
                    'Texto claro encontrado em repositório.')
        for p in (r / 'password', r / 'wrong-password', r / 'secondary/password'):
            require(p.read_text().strip() not in json.dumps(self.evidence), 'Segredo em evidência.')
        for name in ('primary', 'source', 'password'):
            p = r / name
            sealed = r / (name + '-sealed')
            p.rename(sealed)
            sealed.chmod(0)
        self.secondary_only = True
        listing = self.command('offline-snapshots', ['snapshots', '--json'], repo='secondary/repo')
        secondary = json.loads(listing['stdout'])
        require(len(secondary) == 3, 'Cópia secundária incompleta.')
        for _, label, version in snapshots:
            selected = [s for s in secondary if label in s.get('tags', [])]
            require(len(selected) == 1, 'Snapshot secundário ambíguo.')
            dest = r / ('restore-secondary-' + label)
            self.command('restore-secondary-' + label,
                         ['restore', selected[0]['id'], '--target', str(dest)], repo='secondary/repo')
            restored.append({'repository': 'secondary', 'label': label, **verify(dest, version)})
        self.command('check-secondary-offline', ['check', '--read-data'], repo='secondary/repo')
        self.evidence['restores'] = restored
        self.evidence['secondary_repository_bytes'] = sum(v['bytes'] for v in inventory(r / 'secondary/repo').values())
        # Senhas aleatórias nunca são evidências; nenhum config OAuth foi criado.
        content = json.dumps(self.evidence)
        for p in (r / 'wrong-password', r / 'secondary/password'):
            require(p.read_text().strip() not in content, 'Segredo em evidência.')
        require(not re.search(r'(?i)ya29\.|refresh_token|access_token|client_secret', content),
                'Marcador de credencial em log.')
        self.evidence.update(status='PASS', plaintext_canary_absent='PASS', log_secret_scan='PASS',
                             independent_recovery='logical-same-host-only',
                             blocked=['Google OAuth/upload/quota/restore', 'physical second PC',
                                      'external password custody', 'real PostgreSQL/Storage consistency'])
        return self.evidence


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--tools', type=Path, required=True)
    args = parser.parse_args()
    os.umask(0o077)
    lab = Lab(args.tools)
    print('LAB=' + str(lab.root), flush=True)
    try:
        result = lab.run()
    except Exception as exc:
        lab.evidence.update(status='FAIL', error=str(exc))
        save(lab.root / 'execution.json', lab.evidence)
        raise
    save(lab.root / 'execution.json', result)
    print(json.dumps({'status': result['status'], 'evidence': str(lab.root / 'execution.json')}))


if __name__ == '__main__':
    main()
