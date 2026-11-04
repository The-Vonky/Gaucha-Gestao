import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { DERIVATIVE_MAX_ORIGINAL_BYTES, DERIVATIVE_MAX_OUTPUT_BYTES, DERIVATIVE_ENCODER_VERSION } from './audit-derivative-protocol.mjs';
const decoder = fileURLToPath(new URL('./audit-derivative-decoder.mjs', import.meta.url));
const protocol = fileURLToPath(new URL('./audit-derivative-protocol.mjs', import.meta.url));
const modules = fileURLToPath(new URL('../node_modules', import.meta.url));
async function residentBytes(pid) {
  const [status, children] = await Promise.all([readFile(`/proc/${pid}/status`, 'utf8'), readFile(`/proc/${pid}/task/${pid}/children`, 'utf8')]);
  const own = Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1] ?? 0) * 1024;
  const descendants = await Promise.all(children.trim().split(/\s+/).filter(Boolean).map(child => residentBytes(child).catch(() => 0)));
  return own + descendants.reduce((sum, value) => sum + value, 0);
}
const denied = () => new Error('derivative_generation_failed');
export function encodeIsolated({ bytes, contentType, version = DERIVATIVE_ENCODER_VERSION }, { timeoutMs = 20_000, maxRss = 384 * 1024 * 1024 } = {}) {
  if (process.platform !== 'linux' || process.getuid?.() === 0 || !Buffer.isBuffer(bytes) ||
      bytes.length <= 0 || bytes.length > DERIVATIVE_MAX_ORIGINAL_BYTES ||
      !['image/jpeg','image/png'].includes(contentType) || version !== DERIVATIVE_ENCODER_VERSION) return Promise.reject(denied());
  return new Promise((resolve, reject) => {
    // RLIMIT_CPU é aplicado pelo kernel; RSS é vigiado pelo pai (não um hard cgroup).
    const child = spawn('/usr/bin/prlimit', ['--cpu=15', '--as=2147483648', '--core=0', '--fsize=0', '--', '/usr/bin/bwrap',
      '--unshare-all', '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
      '--ro-bind', '/usr', '/usr', '--ro-bind', '/lib', '/lib', '--ro-bind', '/lib64', '/lib64',
      '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--dir', '/app', '--dir', '/runtime',
      '--ro-bind', resolvePath(process.execPath), '/runtime/node',
      '--ro-bind', modules, '/app/node_modules',
      '--ro-bind', decoder, '/app/audit-derivative-decoder.mjs',
      '--ro-bind', protocol, '/app/audit-derivative-protocol.mjs', '--chdir', '/app', '/runtime/node',
      '--max-old-space-size=64', '--max-semi-space-size=4', '/app/audit-derivative-decoder.mjs', contentType],
    { env: { PATH: '/usr/bin:/bin', VIPS_CONCURRENCY: '1', MALLOC_ARENA_MAX: '2' }, stdio: ['pipe','pipe','ignore'] });
    let output = Buffer.alloc(0); let rejected = false;
    const stop = () => { rejected = true; child.kill('SIGKILL'); };
    const timer = setTimeout(stop, timeoutMs);
    const monitor = setInterval(() => {
      void residentBytes(child.pid).then(bytes => { if (bytes > maxRss) stop(); }).catch(() => {});
    }, 25);
    child.on('error', () => { clearTimeout(timer); clearInterval(monitor); reject(denied()); });
    child.stdin.on('error', () => {});
    child.stdout.on('data', chunk => {
      if (output.length + chunk.length > Math.ceil(DERIVATIVE_MAX_OUTPUT_BYTES * 4 / 3) + 1024) stop();
      else output = Buffer.concat([output, chunk]);
    });
    child.on('close', code => {
      clearTimeout(timer); clearInterval(monitor);
      if (rejected || code !== 0) return reject(denied());
      try {
        const result = JSON.parse(output.toString());
        result.bytes = Buffer.from(result.bytes, 'base64');
        resolve(result);
      } catch { reject(denied()); }
    });
    child.stdin.end(bytes);
  });
}
export const isolatedEncoder = { encode: encodeIsolated };
