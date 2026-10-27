"""AG-01: PostgreSQL 17 exclusivo, sem rede/portas, PGDATA em tmpfs.
Executar da raiz: python3 tests/integration/room-booking.py
Não aceita URL de banco externo; remove somente o container que criou.
"""
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
NAME = 'gaucha-ag01-' + uuid.uuid4().hex[:12]
IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.167'


def docker(*args, **kwargs):
    return subprocess.run(['docker', *args], check=True, text=True, capture_output=True, **kwargs)


def command(app='ag01'):
    return ['docker', 'exec', '-i', '-e', 'PGAPPNAME=' + app, NAME, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres']


def sql(source):
    result = subprocess.run(command(), input=source, text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def race(commit=True):
    day = '2031-01-01' if commit else '2031-01-02'
    booking = f"select public.ag01_booking('{day} 09:00-03','{day} 10:00-03');"
    first = subprocess.Popen(command('ag01-first'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    second = None
    try:
        first.stdin.write('begin;\n' + booking + "\nselect 'ready';\n")
        first.stdin.flush()
        while first.stdout.readline().strip() != 'ready':
            if first.poll() is not None:
                raise RuntimeError(first.stderr.read())
        second = subprocess.Popen(command('ag01-second'), stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        second.stdin.write(booking + '\n')
        second.stdin.close()
        deadline = time.monotonic() + 10
        while sql("select count(*) from pg_stat_activity where application_name='ag01-second' and wait_event_type='Lock'") != '1':
            assert second.poll() is None, 'Segunda sessão não aguardou exclusão'
            assert time.monotonic() < deadline, 'Timeout ao observar concorrência'
            time.sleep(0.05)
        first.stdin.write(('commit' if commit else 'rollback') + ';\n')
        first.stdin.close()
        assert first.wait(timeout=10) == 0
        result = second.wait(timeout=10)
        error = second.stderr.read()
        assert (result != 0 and 'exclusion constraint' in error) if commit else result == 0, error
        assert sql(f"select count(*) from room_booking.bookings where starts_at='{day} 09:00-03'") == '1'
    finally:
        for process in [first, second]:
            if process and process.poll() is None:
                process.kill()
                process.wait()


created = False
try:
    docker('run', '-d', '--name', NAME, '--label', 'owner=codex-ag01', '--network', 'none',
           '--tmpfs', '/var/lib/postgresql/data:rw', '-e', 'PGDATA=/var/lib/postgresql/data/ag01',
           '--entrypoint', '/bin/bash', IMAGE, '-c',
           'install -d -o postgres -g postgres "$PGDATA"; su postgres -c "initdb -D $PGDATA --auth=trust" >/dev/null && exec su postgres -c "postgres -D $PGDATA -c listen_addresses=localhost"')
    created = True
    for attempt in range(100):
        try:
            sql('select 1')
            break
        except RuntimeError:
            time.sleep(0.1)
    else:
        raise RuntimeError('PostgreSQL não iniciou')
    print('Runtime exclusivo:', NAME, IMAGE, 'rede none; sem portas; tmpfs; dono codex-ag01')
    print('PostgreSQL:', sql('show server_version'))
    sql((ROOT / 'tests/fixtures/room-booking-auth.sql').read_text())
    stub = (ROOT / 'tests/storage-stub.ts').read_text().split('`')[1]
    sql(stub)
    for migration in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
        sql(migration.read_text())
    print('PASS: todas as migrations aplicadas do zero')
    print('btree_gist:', sql("select extversion from pg_extension where extname='btree_gist'"))
    sql((ROOT / 'tests/fixtures/room-booking.sql').read_text())
    print('PASS: integridade, datas, grants, RLS, delegação/revogação e auditoria Core')
    race(True)
    print('PASS: duas sessões sobrepostas, primeiro COMMIT, segundo conflito')
    race(False)
    print('PASS: duas sessões sobrepostas, primeiro ROLLBACK, segundo confirma')
finally:
    if created:
        docker('rm', '-f', NAME)
        print('Runtime exclusivo removido; nenhum volume persistente criado')
