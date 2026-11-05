#!/usr/bin/env node
// Entrada manual. Configuração externa protegida; não instala ou agenda serviço.
import {privateFile} from './audit-derivative-config.mjs';
import {launchRuntime} from './audit-derivative-runtime.mjs';
try{
  const [option,file,...extra]=process.argv.slice(2);
  if(option!=='--config'||!file||extra.length)throw new Error('Explicit config required');
  const config=JSON.parse(await privateFile(file));
  const signingSecret=(await privateFile(config.signingSecretFile)).trim();
  const result=await launchRuntime({workerConfig:config.worker,signingSecret});
  process.stdout.write(JSON.stringify(result)+'\n');
  if(['failed','orphan'].includes(result.state))process.exitCode=1;
}catch{process.stderr.write('Runtime bloqueado ou falhou; verificar configuração, login mínimo e pré-condições do runbook.\n');process.exitCode=2;}
