import { workerBoot,executeRuntime } from './audit-derivative-runtime-client.mjs';
const boot=await workerBoot();
try{
  const result=await executeRuntime(boot.config,boot.requestToken,boot.requestEncode);
  await boot.sendResult(result);
  if(['failed','orphan'].includes(result.state))process.exitCode=1;
}catch(error){await boot.sendResult({state:'failed',phase:'worker runtime',code:/^[A-Z0-9_]{1,32}$/.test(error.code??'')?error.code:undefined}).catch(()=>{});process.exitCode=1;}
finally{boot.close();}
