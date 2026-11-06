// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
const backend = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), original: vi.fn(), download: vi.fn() }));
vi.mock('../apps/web/src/core/client', () => ({ client: { storage: { from: (bucket:string) => ({ createSignedUrl: (...args:unknown[]) => backend.sign(bucket,...args) }) } } }));
vi.mock('../apps/web/src/modules/audit/api', () => ({ db: () => ({ rpc: backend.rpc }) }));
vi.mock('../apps/web/src/modules/audit/evidence', () => ({ downloadUrl: backend.original, downloadEvidence: backend.download }));
const row = { id: '22222222-2222-4222-8222-222222222222', inspection_id:'11111111-1111-4111-8111-111111111111',
  object_key:'11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222',content_type:'image/png',size_bytes:800,uploaded_at:'2026-11-04' };
const manifest = { evidence_id:row.id,encoder_version:'img-480-v1',derived_object_key:`${row.id}/img-480-v1/${'a'.repeat(64)}/${'b'.repeat(64)}.png`,derived_sha256:'b'.repeat(64),mime:'image/png',bytes:120 };
const readyState={data:[{state:'ready',reason:null,retryable:false}],error:null};
let cache: typeof import('../apps/web/src/shared/privateImageCache').privateImages;
let visible: (entries:{isIntersecting:boolean}[]) => void;
beforeEach(async () => {
  vi.resetModules();vi.stubEnv('VITE_AUDIT_EVIDENCE_THUMBNAILS','true');
  cache=(await import('../apps/web/src/shared/privateImageCache')).privateImages;cache.setAccess('synthetic-user');
  Object.defineProperty(URL,'createObjectURL',{value:vi.fn(()=> 'blob:synthetic'),configurable:true});
  Object.defineProperty(URL,'revokeObjectURL',{value:vi.fn(),configurable:true});
  vi.stubGlobal('IntersectionObserver',class { constructor(callback:typeof visible){visible=callback;}observe(){}disconnect(){} });
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(120),{headers:{'content-type':'image/png'}})));
  backend.rpc.mockImplementation(async(name:string)=>name==='checklist_evidence_thumbnail_state'?readyState:{data:[manifest],error:null});
  backend.sign.mockResolvedValue({data:{signedUrl:'https://storage.example.test/thumb'},error:null});
  backend.original.mockResolvedValue('https://storage.example.test/original');
});
afterEach(()=>{cleanup();cache.setAccess('');vi.resetAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
describe('lista de miniaturas com backend mockado',()=>{
 it('flag desligada preserva original e não consulta manifesto',async()=>{
  vi.stubEnv('VITE_AUDIT_EVIDENCE_THUMBNAILS','false');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(800),{headers:{'content-type':'image/png'}})));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={row} name="Evidência"/>);act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');expect(backend.original).toHaveBeenCalledTimes(1);expect(backend.rpc).not.toHaveBeenCalled();
 });
 it('flag ligada pede somente derivado visível; modal explícito baixa original com cache separado',async()=>{
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  const {imageKey,thumbnailKey}=await import('../apps/web/src/modules/audit/evidenceImages');
  const {rerender}=render(<EvidenceImage row={row} name="Evidência"/>);
  expect(backend.rpc).not.toHaveBeenCalled();act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');expect(backend.original).not.toHaveBeenCalled();
  expect(backend.rpc).toHaveBeenCalledWith('checklist_evidence_thumbnail',{p_evidence:row.id});
  expect(backend.sign).toHaveBeenCalledWith('audit-evidence-thumbnails',manifest.derived_object_key,60);
  expect(cache.peek(thumbnailKey(row))).toBeTruthy();expect(cache.peek(imageKey(row))).toBe('');
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array(800),{headers:{'content-type':'image/png'}})));
  rerender(<EvidenceImage key="explicit-modal" row={row} name="Original" expanded/>);
  await screen.findByRole('img',{name:'Original'});expect(backend.original).toHaveBeenCalledTimes(1);
  expect(cache.peek(imageKey(row))).toBeTruthy();expect(cache.peek(thumbnailKey(row))).toBeTruthy();
 });
 it.each(['missing','rpc','sign','get','key'])('falha %s exibe ação explícita sem GET/assinatura do original',async stage=>{
  if(stage==='missing')backend.rpc.mockResolvedValue({data:[],error:null});
  if(stage==='rpc')backend.rpc.mockResolvedValue({data:null,error:{message:'not deployed'}});
  if(stage==='sign')backend.sign.mockResolvedValue({data:null,error:{message:'denied'}});
  if(stage==='get')vi.stubGlobal('fetch',vi.fn(async()=>new Response(null,{status:404})));
  if(stage==='key')backend.rpc.mockImplementation(async(name:string)=>name==='checklist_evidence_thumbnail_state'?readyState:{data:[{...manifest,derived_object_key:row.object_key}],error:null});
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  const open=vi.fn();render(<EvidenceImage row={row} name="Evidência" onOpenOriginal={open}/>);act(()=>visible([{isIntersecting:true}]));
  await screen.findByText('Miniatura indisponível.');expect(backend.original).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Abrir original'}));expect(open).toHaveBeenCalledTimes(1);expect(backend.original).not.toHaveBeenCalled();
  if(['missing','rpc','key'].includes(stage)){expect(fetch).not.toHaveBeenCalled();expect(backend.sign).not.toHaveBeenCalled();}
 });
 it('pending/processing atualiza a miniatura sem reload e cancela polling no unmount',async()=>{
  vi.useFakeTimers();
  backend.rpc.mockImplementation(async(name:string)=>name==='checklist_evidence_thumbnail_state'?{data:[{state:'processing',reason:null,retryable:true}],error:null}:{data:[manifest],error:null});
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  const {unmount}=render(<EvidenceImage row={row} name="Evidência"/>);
  await act(async()=>visible([{isIntersecting:true}]));
  expect(screen.getByText('Preparando miniatura…')).toBeTruthy();
  expect(backend.sign).not.toHaveBeenCalled();expect(backend.original).not.toHaveBeenCalled();
  backend.rpc.mockImplementation(async(name:string)=>name==='checklist_evidence_thumbnail_state'?readyState:{data:[manifest],error:null});
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000);});
  expect(screen.getByRole('img')).toBeTruthy();expect(backend.original).not.toHaveBeenCalled();
  unmount();const count=backend.rpc.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10000);expect(backend.rpc).toHaveBeenCalledTimes(count);
  vi.useRealTimers();
 });
 it('imagem sem ganho de bytes tem estado terminal explícito e nunca baixa o original sozinha',async()=>{
  backend.rpc.mockResolvedValue({data:[{state:'failed',reason:'derivative_not_smaller',retryable:false}],error:null});
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={row} name="Evidência" onOpenOriginal={vi.fn()}/>);act(()=>visible([{isIntersecting:true}]));
  await screen.findByText('Imagem já compacta; não foi possível reduzir a miniatura.');
  expect(backend.original).not.toHaveBeenCalled();expect(backend.sign).not.toHaveBeenCalled();
 });
 it('remoção/reconciliação e troca de acesso descartam ambos os caches',async()=>{
  const images=await import('../apps/web/src/modules/audit/evidenceImages');
  await images.loadEvidenceThumbnail(row);
  expect(cache.peek(images.thumbnailKey(row))).toBeTruthy();
  images.reconcileEvidenceImages(row.inspection_id,[]);expect(cache.peek(images.thumbnailKey(row))).toBe('');
  await images.loadEvidenceThumbnail(row);cache.setAccess('other-user');expect(cache.peek(images.thumbnailKey(row))).toBe('');
  expect(backend.original).not.toHaveBeenCalled();
 });
 it('descarta assinatura/GET tardios após logout',async()=>{
  let release!: (value:unknown)=>void;
  backend.rpc.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={row} name="Evidência"/>);act(()=>visible([{isIntersecting:true}]));
  await waitFor(()=>expect(backend.rpc).toHaveBeenCalled());act(()=>cache.setAccess(''));
  await act(async()=>release({data:[manifest],error:null}));
  expect(backend.sign).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole('img')).toBeNull();
 });
});
