// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Blob } from 'node:buffer';
import sharp from 'sharp';
const backend = vi.hoisted(() => ({ rpc: vi.fn(), sign: vi.fn(), original: vi.fn(), download: vi.fn() }));
vi.mock('../apps/web/src/core/client', () => ({ client: { storage: { from: (bucket:string) => ({ createSignedUrl: (...args:unknown[]) => backend.sign(bucket,...args) }) } } }));
vi.mock('../apps/web/src/modules/audit/api', () => ({ db: () => ({ rpc: backend.rpc }) }));
vi.mock('../apps/web/src/modules/audit/evidence', async importOriginal => ({
  ...await importOriginal<typeof import('../apps/web/src/modules/audit/evidence')>(),
  downloadUrl: backend.original,
  downloadEvidence: backend.download,
}));
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

describe('miniaturas nativas do Storage',()=>{
 const large = {...row,size_bytes:65_537};
 const signed = `https://storage.example.test/storage/v1/render/image/sign/audit-checklist-evidence/${row.object_key}?token=synthetic`;
 const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR1sAAAAASUVORK5CYII='), c=>c.charCodeAt(0));
 beforeEach(()=>{
  vi.stubGlobal('Blob',Blob);
  vi.stubEnv('VITE_AUDIT_EVIDENCE_STORAGE_TRANSFORMS','true');
  vi.stubEnv('VITE_SUPABASE_URL','https://storage.example.test');
  backend.sign.mockResolvedValue({data:{signedUrl:signed},error:null});
 });
 it('assina a transformação somente no viewport, sem polling, e mantém o original explícito',async()=>{
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  const {rerender}=render(<EvidenceImage row={large} name="Evidência"/>);
  expect(backend.sign).not.toHaveBeenCalled();
  act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');
  expect(backend.rpc).not.toHaveBeenCalled();
  expect(backend.original).not.toHaveBeenCalled();
  expect(backend.sign).toHaveBeenCalledExactlyOnceWith('audit-checklist-evidence',row.object_key,60,{
   transform:{width:480,height:480,resize:'contain',quality:75,format:'origin'},
  });
  expect(fetch).toHaveBeenCalledWith(signed,expect.objectContaining({cache:'no-store',credentials:'omit',redirect:'error'}));
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(large.size_bytes),{headers:{'content-type':'image/png'}}));
  rerender(<EvidenceImage key="expanded" row={large} name="Original" expanded/>);
  await screen.findByRole('img',{name:'Original'});
  expect(backend.original).toHaveBeenCalledOnce();
 });
 async function renderEvidenceCard() {
  const { ChecklistEvidence } = await import('../apps/web/src/modules/audit/ChecklistEvidence');
  const item = { key: 'item-001', number: 1, position: 1, text: 'Critério', template_version: 'v1', section_key: 'section-1' };
  const evidence = { ...large, item_key: item.key, original_name: 'sintetica.png', created_by: 'synthetic-user', uploaded_by_name: 'Teste' };
  const controller = { rows: [evidence], data: [evidence], uploads: {}, loading: false, error: '',
   reload: vi.fn(), send: vi.fn(), retry: vi.fn(), discard: vi.fn() };
  render(<ChecklistEvidence item={item} editable={false} controller={controller}/>);
  act(() => visible([{ isIntersecting: true }]));
 }
 it('oferece ampliação após o carregamento e a remove se a imagem falhar',async()=>{
  await renderEvidenceCard();
  const image = await screen.findByRole('img', { name: 'Evidência 1.png' });
  expect(screen.queryByRole('button', { name: 'Ampliar Evidência 1.png' })).toBeNull();
  fireEvent.load(image);
  const enlarge = screen.getByRole('button', { name: 'Ampliar Evidência 1.png' });
  expect(enlarge.closest('.audit-evidence-thumbnail')).toBe(image.closest('.audit-evidence-thumbnail'));
  expect(enlarge.closest('.audit-evidence-thumbnail')).not.toBeNull();
  expect(backend.original).not.toHaveBeenCalled();
  fireEvent.error(image);
  expect(screen.queryByRole('button', { name: 'Ampliar Evidência 1.png' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Abrir original' }).closest('.audit-evidence-thumbnail')).toBeNull();
 });
 it.each(['transformação indisponível', 'assinatura negada'])('%s exibe o fallback no cartão e abre o original por clique',async failure=>{
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  if (failure === 'assinatura negada') backend.sign.mockResolvedValue({ data: null, error: { message: 'denied' } });
  else vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
  await renderEvidenceCard();
  const status = await screen.findByText('Miniatura indisponível.');
  const open = screen.getByRole('button', { name: 'Abrir original' });
  expect(status.closest('.file-item')).toBe(open.closest('.file-item'));
  expect(status.closest('.audit-evidence-thumbnail')).toBeNull();
  expect(open.closest('.audit-evidence-thumbnail')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Ampliar Evidência 1.png' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Baixar Evidência 1.png' })).toBeTruthy();
  expect(backend.original).not.toHaveBeenCalled();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(large.size_bytes), { headers: { 'content-type': 'image/png' } }));
  fireEvent.click(open);
  expect(screen.getByRole('dialog', { name: 'Evidência 1.png' })).toBeTruthy();
  await screen.findByRole('img', { name: 'Evidência 1.png' });
  expect(backend.original).toHaveBeenCalledOnce();
 });
 it('reutiliza os bytes de um PNG compacto estático e revoga a prévia ao trocar de sessão',async()=>{
  vi.mocked(fetch).mockResolvedValueOnce(new Response(png,{headers:{'content-type':'image/png'}}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={{...row,size_bytes:png.length}} name="Evidência"/>);
  act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');
  expect(backend.original).toHaveBeenCalledOnce();
  expect(backend.sign).not.toHaveBeenCalled();
  expect(backend.rpc).not.toHaveBeenCalled();
  act(()=>cache.setAccess(''));
  expect(screen.queryByRole('img')).toBeNull();
 });
 it('reutiliza um JPEG compacto sem solicitar transformação',async()=>{
  const jpeg=await sharp({create:{width:320,height:480,channels:3,background:'#c36431'}}).jpeg().toBuffer();
  vi.mocked(fetch).mockResolvedValueOnce(new Response(jpeg,{headers:{'content-type':'image/jpeg'}}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={{...row,content_type:'image/jpeg',size_bytes:jpeg.length}} name="Evidência"/>);
  act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');
  expect(backend.original).toHaveBeenCalledOnce();
  expect(backend.sign).not.toHaveBeenCalled();
 });
 it('transforma mesmo um PNG compacto quando a dimensão original supera 480 px',async()=>{
  const source=png.slice();
  new DataView(source.buffer).setUint32(16,481);
  vi.mocked(fetch).mockResolvedValueOnce(new Response(source,{headers:{'content-type':'image/png'}}))
   .mockResolvedValueOnce(new Response(new Uint8Array(30),{headers:{'content-type':'image/png'}}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={{...row,size_bytes:source.length}} name="Evidência"/>);
  act(()=>visible([{isIntersecting:true}]));
  await screen.findByRole('img');
  expect(backend.original).toHaveBeenCalledOnce();
  expect(backend.sign).toHaveBeenCalledOnce();
 });
 it.each(['denied','wrong-origin','original-route','renderer','mime','bytes','empty'])('falha %s exige abrir o original explicitamente',async kind=>{
  if(kind==='denied')backend.sign.mockResolvedValue({data:null,error:{message:'denied'}});
  if(kind==='wrong-origin')backend.sign.mockResolvedValue({data:{signedUrl:signed.replace('storage.example.test','other.example.test')}});
  if(kind==='original-route')backend.sign.mockResolvedValue({data:{signedUrl:signed.replace('/render/image/sign/','/object/sign/')}});
  if(kind==='renderer')vi.mocked(fetch).mockResolvedValueOnce(new Response(null,{status:503}));
  if(kind==='mime')vi.mocked(fetch).mockResolvedValueOnce(new Response(png,{headers:{'content-type':'text/html'}}));
  if(kind==='bytes')vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(large.size_bytes),{headers:{'content-type':'image/png'}}));
  if(kind==='empty')vi.mocked(fetch).mockResolvedValueOnce(new Response(new Uint8Array(),{headers:{'content-type':'image/png'}}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  const open=vi.fn();
  render(<EvidenceImage row={large} name="Evidência" onOpenOriginal={open}/>);
  act(()=>visible([{isIntersecting:true}]));
  await screen.findByText('Miniatura indisponível.');
  if(['denied','wrong-origin','original-route'].includes(kind))expect(fetch).not.toHaveBeenCalled();
  expect(backend.original).not.toHaveBeenCalled();
  expect(backend.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Abrir original'}));
  expect(open).toHaveBeenCalledOnce();
 });
 it('descarta resposta de assinatura que chegou depois do logout',async()=>{
  let release!: (value:unknown)=>void;
  backend.sign.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  const {EvidenceImage}=await import('../apps/web/src/modules/audit/EvidenceImage');
  render(<EvidenceImage row={large} name="Evidência"/>);
  act(()=>visible([{isIntersecting:true}]));
  await waitFor(()=>expect(backend.sign).toHaveBeenCalledOnce());
  act(()=>cache.setAccess(''));
  await act(()=>release({data:{signedUrl:signed},error:null}));
  expect(fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('img')).toBeNull();
 });
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
