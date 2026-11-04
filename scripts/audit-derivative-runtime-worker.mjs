import { workerBoot,executeRuntime } from './audit-derivative-runtime-client.mjs';
const boot=await workerBoot();
try{
  const result=await executeRuntime(boot.config,boot.requestToken);
  process.stdout.write(JSON.stringify({type:'result',result})+'\n');
  if(['failed','orphan'].includes(result.state))process.exitCode=1;
}catch{process.stdout.write(JSON.stringify({type:'result',result:{state:'failed'}})+'\n');process.exitCode=1;}
finally{boot.close();}
