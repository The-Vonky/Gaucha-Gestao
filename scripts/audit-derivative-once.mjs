#!/usr/bin/env node
// Sem configuração automática: adapter externo somente após GO C/identidade comprovada.
import { pathToFileURL } from 'node:url';
import { isAbsolute } from 'node:path';
import { runOneShot } from './audit-derivative-worker.mjs';
try {
  const [option, adapter, ...extra] = process.argv.slice(2);
  if (option !== '--adapter' || !adapter || !isAbsolute(adapter) || extra.length) {
    process.stderr.write('Integração bloqueada: informe --adapter /caminho/absoluto/config.mjs somente após GO e prova de menor privilégio.\n');
    process.exitCode = 2;
  } else {
    const { createAdapters } = await import(pathToFileURL(adapter).href);
    const { repository, storage, close } = await createAdapters();
    try {
      const result = await runOneShot({ repository, storage });
      process.stdout.write(JSON.stringify(result) + '\n');
      if (['failed','orphan'].includes(result.state)) process.exitCode = 1;
    }
    finally { await close?.(); }
  }
} catch {
  process.stderr.write('derivative_generation_failed\n');
  process.exitCode = 1;
}
