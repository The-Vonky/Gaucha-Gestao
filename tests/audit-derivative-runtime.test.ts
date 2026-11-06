import {describe,it,expect,vi} from 'vitest';
import {createHmac} from 'node:crypto';
import {leaseIssuer,TECHNICAL_TOKEN_TTL} from '../scripts/audit-derivative-runtime.mjs';
const lease='11111111-1111-4111-8111-111111111111';
const secret='synthetic-unit-test-signing-key-only-'.repeat(2);
const base={lease,login:'audit_derivative_worker',bucket:'audit-checklist-evidence',key:'synthetic/source',server_now:100,lease_expires:220};
function fixture(){const query=vi.fn().mockResolvedValue({rows:[{result:base}]});return {query,issue:leaseIssuer({connection:{query},signingSecret:secret})};}
describe('emissor one-shot: contratos novos (DB fake; integração real no CI)',()=>{
 it('assina só a role fixa, bucket/chave do banco e TTL curto, com HMAC válido',async()=>{
  const f=fixture();const issued=await f.issue({lease,kind:'source'});const [head,body,signature]=issued.token.split('.');
  const claims=JSON.parse(Buffer.from(body,'base64url').toString());
  expect(claims).toMatchObject({role:'audit_derivative_storage_runtime',audit_derivative_lease:lease,audit_derivative_key:base.key,exp:130,iat:100});
  expect(signature).toBe(createHmac('sha256',secret).update(head+'.'+body).digest('base64url'));
  expect(TECHNICAL_TOKEN_TTL).toBe(30);
  expect(f.query).toHaveBeenCalledWith(expect.stringContaining('runtime_derivative_scope'),[lease,'source']);
 });
 it('renovação não estende lease, muda jti e respeita escopo fresco do banco',async()=>{
  const f=fixture();const first=await f.issue({lease,kind:'source'});
  f.query.mockResolvedValue({rows:[{result:{...base,server_now:125,lease_expires:140}}]});
  const next=await f.issue({lease,kind:'source'});expect(next.expires).toBe(140);expect(next.token).not.toBe(first.token);
 });
 it('não aceita kind/lease arbitrários, outro login, chave ausente ou lease encerrada',async()=>{
  const f=fixture();await expect(f.issue({lease,kind:'service_role'})).rejects.toThrow();expect(f.query).not.toHaveBeenCalled();
  await f.issue({lease,kind:'source'});
  await expect(f.issue({lease:'other',kind:'source'})).rejects.toThrow();
  for(const change of [{login:'postgres'},{key:null},{server_now:219},{bucket:'other'}]){
   f.query.mockResolvedValue({rows:[{result:{...base,...change}}]});await expect(f.issue({lease,kind:'source'})).rejects.toThrow();
  }
  f.query.mockRejectedValue(new Error('closed'));await expect(f.issue({lease,kind:'source'})).rejects.toThrow();
 });
 it('limita a emissão por processo, sem refresh token ou serviço permanente',async()=>{
  const f=fixture();for(let i=0;i<32;i++)await f.issue({lease,kind:'source'});
  await expect(f.issue({lease,kind:'source'})).rejects.toThrow();expect(f.query).toHaveBeenCalledTimes(32);
 });
});
