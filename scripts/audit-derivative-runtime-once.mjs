#!/usr/bin/env node
// Entrada manual. Configuração externa protegida; não instala ou agenda serviço.
import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {launchRuntime} from './audit-derivative-runtime.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
async function privateFile(filename){
  if(!path.isAbsolute(filename))throw new Error('Absolute private file required');
  const resolved=await realpath(filename);if(resolved.startsWith(root))throw new Error('Private file must be outside checkout');
  const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{const s=await file.stat();if(!s.isFile()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw new Error('Private owner/mode required');return await file.readFile('utf8');}
  finally{await file.close();}
}
try{
  const [option,file,...extra]=process.argv.slice(2);
  if(option!=='--config'||!file||extra.length)throw new Error('Explicit config required');
  const config=JSON.parse(await privateFile(file));
  const signingSecret=(await privateFile(config.signingSecretFile)).trim();
  const result=await launchRuntime({workerConfig:config.worker,signingSecret});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(['failed','orphan'].includes(result.state))process.exitCode=1;
}catch{process.stderr.write('Runtime bloqueado ou falhou; verificar configuração, login mínimo e pré-condições do runbook.\n');process.exitCode=2;}
