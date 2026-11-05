import { afterEach, expect, it, vi } from "vitest";
const transport=vi.hoisted(()=>({rpc:vi.fn(),abort:vi.fn()}));
vi.mock('../apps/web/src/core/client',()=>({client:{schema:(schema:string)=>{
 if(schema!=='public') throw new Error('Schema inesperado');
 return {rpc:transport.rpc};
}}}));
import { loadPublishedNotices, saveNotice } from '../apps/web/src/modules/announcements/api';
const published={version:1,enabled:true,announcements:[],serverNow:'2026-11-05T12:00:00Z',nextRefreshAt:'2026-11-05T12:01:00Z'};
afterEach(()=>{vi.restoreAllMocks();transport.rpc.mockReset();transport.abort.mockReset();});
it('loader autenticado usa somente RPC, signal e relógio SQL; falha nunca consulta JSON público',async()=>{
 const fetch=vi.spyOn(globalThis,'fetch');
 const signal=new AbortController().signal;
 transport.rpc.mockReturnValue({abortSignal:transport.abort});transport.abort.mockResolvedValue({data:published,error:null});
 expect(await loadPublishedNotices(signal)).toMatchObject({announcements:[],serverNow:Date.parse(published.serverNow),nextRefreshAt:Date.parse(published.nextRefreshAt)});
 expect(transport.rpc).toHaveBeenCalledWith('announcements_published',{});expect(transport.abort).toHaveBeenCalledWith(signal);
 transport.abort.mockResolvedValue({data:null,error:{code:'42501'}});await expect(loadPublishedNotices(signal)).rejects.toMatchObject({code:'42501'});
 expect(fetch).not.toHaveBeenCalled();
});
it.each([{...published,serverNow:'invalid'},{...published,announcements:[{type:'critical',tone:'success'}]}])('nega resposta incompatível antes de renderizar',async value=>{
 transport.rpc.mockReturnValue({abortSignal:transport.abort});transport.abort.mockResolvedValue({data:value,error:null});
 await expect(loadPublishedNotices(new AbortController().signal)).rejects.toThrow('incompatível');
});
it('escrita envia somente parâmetros de domínio com versão esperada; erro do servidor é propagado',async()=>{
 transport.rpc.mockResolvedValue({data:null,error:{code:'40001'}});
 await expect(saveNotice({title:'Título',message:'Mensagem',category:'information',tone:'info',priority:0,starts_at:null,ends_at:null,state:'published',show_feedback:false},null)).rejects.toMatchObject({code:'40001'});
 expect(transport.rpc).toHaveBeenCalledWith('announcements_notice_save',expect.objectContaining({p_id:null,p_expected_version:null,p_state:'published',p_show_feedback:false}));
});
