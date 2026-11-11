import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { encodeIsolated } from '../scripts/audit-derivative-encoder.mjs';
import { runOneShot, storageApiAdapter, authorizedStorageTransport } from '../scripts/audit-derivative-worker.mjs';
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const image = (format = 'jpeg', width = 960, height = 640) => {
  const s = sharp({ create: { width, height, channels: 4, background: { r: 190, g: 40, b: 80, alpha: 0.5 } } });
  return format === 'png' ? s.png().toBuffer() : s.jpeg().toBuffer();
};
describe('encoder real em subprocesso Linux (sem Storage)', () => {
  it.each(['jpeg', 'png'])('reduz %s a 480px, preserva original e remove metadados', async format => {
    const input = await image(format);
    const hash = digest(input);
    const result = await encodeIsolated({ bytes: input, contentType: 'image/' + format });
    const meta = await sharp(result.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([480, 320]);
    expect(result.mime).toBe('image/' + format);
    expect(meta.exif).toBeUndefined(); expect(meta.xmp).toBeUndefined(); expect(meta.icc).toBeUndefined();
    expect(digest(input)).toBe(hash);
    if (format === 'png') {
      expect(meta.hasAlpha).toBe(true);
      const pixel = await sharp(result.bytes).raw().toBuffer();
      expect(pixel[3]).toBeGreaterThan(0); expect(pixel[3]).toBeLessThan(255);
    }
  });
  it('aplica orientação EXIF antes de reduzir e remove EXIF/GPS do derivado', async () => {
    const input = await sharp(await image()).withMetadata({ orientation: 6 }).withExifMerge({
      IFD0: { Copyright: 'synthetic' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1', GPSLongitudeRef: 'E', GPSLongitude: '1/1 2/1 3/1' },
    }).toBuffer();
    expect((await sharp(input).metadata()).orientation).toBe(6);
    const result = await encodeIsolated({ bytes: input, contentType: 'image/jpeg' });
    const meta = await sharp(result.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([320, 480]);
    expect(meta.exif).toBeUndefined(); expect(meta.orientation).toBeUndefined();
    expect(result.bytes.includes(Buffer.from('synthetic'))).toBe(false);
  });
  it.each([['jpeg',4032,3024],['png',3024,4032]] as const)('reduz %s sintético em dimensões de celular (%i × %i)', async (format,width,height) => {
    const input=await image(format,width,height);
    const result=await encodeIsolated({bytes:input,contentType:'image/'+format});
    expect([result.width,result.height]).toEqual(width>height?[480,360]:[360,480]);
    expect(result.bytes.length).toBeLessThan(input.length);
  });
  it('não amplia imagens pequenas', async () => {
    const input=await sharp(await image('png',80,40)).withMetadata().toBuffer();
    const result = await encodeIsolated({ bytes: input, contentType: 'image/png' });
    expect([result.width, result.height]).toEqual([80, 40]);
  });
  it('recusa derivado maior do que PNG mínimo, com código terminal sanitizado',async()=>{
    const bytes=await sharp({create:{width:1,height:1,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png({compressionLevel:9}).toBuffer();
    await expect(encodeIsolated({bytes,contentType:'image/png'})).rejects.toMatchObject({code:'DECODER_NOT_SMALLER'});
  });
  it('nega inválidos, truncamento, MIME falso, bytes excessivos e pixels excessivos', async () => {
    const good = await image();
    for (const input of [Buffer.from('<svg></svg>'), good.subarray(0, 100), Buffer.alloc(10_485_761), await image('png'), await image('png', 5000, 4000)])
      await expect(encodeIsolated({ bytes: input, contentType: 'image/jpeg' })).rejects.toThrow('derivative_generation_failed');
    await expect(encodeIsolated({ bytes: await image('png', 5000, 4000), contentType: 'image/png' })).rejects.toMatchObject({code:'DECODER_DIMENSIONS'});
  });
  it('mata decoder por duração ou orçamento RSS e rejeita versão desconhecida', async () => {
    const bytes = await image();
    await expect(encodeIsolated({ bytes, contentType: 'image/jpeg' }, { timeoutMs: 1 })).rejects.toMatchObject({code:'DECODER_TIMEOUT'});
    await expect(encodeIsolated({ bytes, contentType: 'image/jpeg' }, { maxRss: 1 })).rejects.toMatchObject({code:'DECODER_MEMORY'});
    await expect(encodeIsolated({ bytes, contentType: 'image/jpeg', version: 'other' })).rejects.toThrow();
    const controller=new AbortController();
    const cancelled=encodeIsolated({bytes,contentType:'image/jpeg'},{signal:controller.signal});controller.abort();
    await expect(cancelled).rejects.toMatchObject({code:'DECODER_ABORTED'});
  });
});
async function environment() {
  const bytes = await image();
  const evidence = { id: '22222222-2222-4222-8222-222222222222', inspection_id: '11111111-1111-4111-8111-111111111111',
    status: 'available', object_key: '11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222', content_type: 'image/jpeg', size_bytes: bytes.length };
  let manifest: { derived_sha256: string; original_sha256: string } | undefined;
  let output: Buffer;
  const repository = { claim: vi.fn().mockResolvedValue({ evidence, lease: 'lease', version: 'img-480-v1' }),
    prepare: vi.fn(async (_lease, value) => { manifest = value; return true; }), complete: vi.fn().mockResolvedValue(true), fail: vi.fn() };
  const storage = { readOriginal: vi.fn().mockResolvedValue(bytes), putDerived: vi.fn(async (_key, value) => { output = value; }), readDerived: vi.fn(async () => output) };
  return { repository, storage, bytes, getManifest: () => manifest };
}
describe('one-shot com repositório/Storage fake e encoder real', () => {
  it('hashes correspondem aos bytes lidos e gravados; ready somente após read-back', async () => {
    const e = await environment(); const before = Buffer.from(e.bytes);
    expect(await runOneShot(e)).toEqual({ state: 'ready' });
    expect(e.getManifest()?.original_sha256).toBe(digest(before));
    expect(e.getManifest()?.derived_sha256).toBe(digest(e.storage.putDerived.mock.calls[0][1]));
    expect(e.bytes.equals(before)).toBe(true);
    expect(e.storage.readDerived.mock.invocationCallOrder[0]).toBeLessThan(e.repository.complete.mock.invocationCallOrder[0]);
  });
  it.each(['readOriginal', 'putDerived', 'readDerived'])('falha parcial em %s não publica nem altera original', async stage => {
    const e = await environment(); const before = digest(e.bytes);
    e.storage[stage as keyof typeof e.storage].mockRejectedValueOnce(new Error('private'));
    expect(await runOneShot(e)).toEqual({ state: 'failed' });
    expect(e.repository.complete).not.toHaveBeenCalled(); expect(e.repository.fail).toHaveBeenCalledWith('lease');
    expect(digest(e.bytes)).toBe(before);
  });
  it('nega read-back divergente; lease obsoleta deixa órfão, sem exclusão', async () => {
    const e = await environment(); e.storage.readDerived.mockResolvedValueOnce(Buffer.from('wrong'));
    expect(await runOneShot(e)).toEqual({ state: 'failed' });
    e.repository.complete.mockResolvedValueOnce(false);
    expect(await runOneShot(e)).toEqual({ state: 'orphan' });
  });
  it('idle não toca Storage e prepare recusada não faz upload', async () => {
    const e = await environment(); e.repository.claim.mockResolvedValueOnce(null);
    expect(await runOneShot(e)).toEqual({ state: 'idle' }); expect(e.storage.readOriginal).not.toHaveBeenCalled();
    e.repository.prepare.mockResolvedValueOnce(false);
    expect(await runOneShot(e)).toEqual({ state: 'stale' }); expect(e.storage.putDerived).not.toHaveBeenCalled();
  });
});
describe('adaptador Storage HTTP com mocks; não prova RLS real', () => {
  it('409 aceita read-back; POST sem upsert somente em bucket separado', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 409 });
    await storageApiAdapter({ request }).putDerived('key', Buffer.from('x'), 'image/png');
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST', bucket: 'audit-evidence-thumbnails', upsert: false }));
  });
  it('stream limita bytes, cancela e libera timeout na falha', async () => {
    const release = vi.fn(); const request = vi.fn(async () => ({ ...Object.fromEntries([]), ok: true, headers: new Headers({ 'content-type': 'image/png' }), body: new Response('excess').body, release }));
    await expect(storageApiAdapter({ request }).readOriginal('key', 2, 'image/png')).rejects.toThrow();
    expect(release).toHaveBeenCalled();
  });
  it('transporte bloqueia service_role, secret, HTTP externo, overwrite e redirect', async () => {
    const token = 'e30.' + Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url') + '.test';
    const fetchImpl = vi.fn();
    const request = authorizedStorageTransport({ origin: 'https://storage.example.test', apiKey: 'anon', accessToken: async () => token, fetchImpl });
    await expect(request({ method: 'GET', bucket: 'audit-checklist-evidence', key: 'a/b', timeoutMs: 10 })).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(() => authorizedStorageTransport({ origin: 'http://external.test', apiKey: 'anon', accessToken: async () => 'token' })).toThrow();
    await expect(request({ method: 'POST', bucket: 'audit-checklist-evidence', key: 'a/b', upsert: false })).rejects.toThrow();
    fetchImpl.mockResolvedValue(new Response('ok'));
    const safe = authorizedStorageTransport({ origin: 'https://storage.example.test', apiKey: 'anon', accessToken: async () => 'limited-test-token', fetchImpl });
    const response = await safe({ method: 'GET', bucket: 'audit-checklist-evidence', key: 'a/b', timeoutMs: 100 }); response.release();
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' });
  });
});

it('409 no fluxo completo só publica se os bytes já existentes forem idênticos', async () => {
  const e = await environment();
  const encoded = await encodeIsolated({bytes:e.bytes,contentType:'image/jpeg'});
  const request = vi.fn(async ({method}:{method:string}) => method === 'POST'
    ? {ok:false,status:409} : {ok:true,headers:new Headers({'content-type':'image/jpeg'}),body:new Response(encoded.bytes).body});
  const storage=storageApiAdapter({request});
  storage.readOriginal=e.storage.readOriginal;
  expect(await runOneShot({...e,storage})).toEqual({state:'ready'});
  request.mockImplementation(async ({method}:{method:string}) => method === 'POST'
    ? {ok:false,status:409} : {ok:true,headers:new Headers({'content-type':'image/jpeg'}),body:new Response('different').body});
  expect(await runOneShot({...e,storage})).toEqual({state:'failed'});
  expect(e.repository.complete).toHaveBeenCalledTimes(1);
});
it('limita aquisição de token antes de iniciar HTTP',async()=>{
  const fetchImpl=vi.fn();
  const request=authorizedStorageTransport({origin:'https://storage.example.test',apiKey:'anon',accessToken:()=>new Promise(()=>{}),fetchImpl});
  await expect(request({method:'GET',bucket:'audit-checklist-evidence',key:'a/b',timeoutMs:5})).rejects.toThrow();
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('callback de token recebe signal, bucket e chave exatos; cancelamento externo interrompe HTTP',async()=>{
 const accessToken=vi.fn().mockResolvedValue('limited-test-token');
 const controller=new AbortController();
 const fetchImpl=vi.fn(async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})));
 const request=authorizedStorageTransport({origin:'https://storage.example.test',apiKey:'anon',accessToken,fetchImpl,signal:controller.signal});
 const result=request({method:'GET',bucket:'audit-checklist-evidence',key:'a/b',timeoutMs:100});
 await vi.waitFor(()=>expect(fetchImpl).toHaveBeenCalledTimes(1));controller.abort();await expect(result).rejects.toThrow();
 expect(accessToken).toHaveBeenCalledWith(expect.any(AbortSignal),{bucket:'audit-checklist-evidence',key:'a/b',method:'GET'});
});
