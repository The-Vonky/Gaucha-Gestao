// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AnnouncementsPage } from "../apps/web/src/modules/announcements/AnnouncementsPage";
import { visibleNavigation } from "../apps/web/src/app/navigation";
import type { NoticeRecord } from "../apps/web/src/modules/announcements/api";
const state=vi.hoisted(()=>({allowed:true,user:'synthetic-a'}));
const calls=vi.hoisted(()=>({list:vi.fn(),save:vi.fn()}));
vi.mock('../apps/web/src/core/auth/AuthProvider',()=>({useAuth:()=>({can:()=>state.allowed,session:{user:{id:state.user}},grants:[{permission:'announcements.notice.manage',scope_type:'global',unit_id:null,sector_id:null}]})}));
vi.mock('../apps/web/src/modules/announcements/api',async original=>({...await original<typeof import('../apps/web/src/modules/announcements/api')>(),listNotices:calls.list,saveNotice:calls.save}));
const row:NoticeRecord={id:'00000000-0000-4000-8000-000000000001',title:'Aviso sintético',message:'Mensagem sintética integral.',category:'information',tone:'info',priority:1,starts_at:null,ends_at:null,state:'draft',status:'draft',show_feedback:true,created_by:'synthetic',updated_by:'synthetic',created_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',version:1};
beforeEach(()=>{
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
 HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 state.allowed=true;state.user='synthetic-a';calls.list.mockReset().mockResolvedValue({items:[row],total:1});calls.save.mockReset().mockResolvedValue(row);
});
afterEach(cleanup);
it('menu somente global e página nega sem capacidade, sem chamada administrativa',()=>{
 const grant={permission:'announcements.notice.manage',scope_type:'global' as const,unit_id:null,sector_id:null};
 expect(visibleNavigation(true,[grant]).flatMap(g=>g.destinations).map(d=>d.path)).toEqual(['/admin/announcements']);
 expect(visibleNavigation(true,[{...grant,scope_type:'unit',unit_id:'u'}])).toEqual([]);
 expect(visibleNavigation(false,[grant])).toEqual([]);
 state.allowed=false;render(<AnnouncementsPage/>);expect(screen.getByRole('alert').textContent).toContain('não autorizado');expect(calls.list).not.toHaveBeenCalled();
});
it('falha real de backend impede criar e não aparenta salvar',async()=>{
 calls.list.mockRejectedValue({code:'PGRST202'});render(<AnnouncementsPage/>);
 await screen.findByRole('alert');expect((screen.getByRole('button',{name:'Novo comunicado'}) as HTMLButtonElement).disabled).toBe(true);
 expect(calls.save).not.toHaveBeenCalled();
});
it('rascunho só confirma após resposta; categoria e cor são independentes e envio real de estado',async()=>{
 let finish:(value:NoticeRecord)=>void=()=>{};calls.save.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 render(<AnnouncementsPage/>);await screen.findByText(row.title);fireEvent.click(screen.getByRole('button',{name:'Novo comunicado'}));
 const editor=screen.getByRole('dialog',{name:'Novo comunicado'});
 fireEvent.change(within(editor).getByLabelText('Assunto'),{target:{value:'Aviso crítico'}});
 fireEvent.change(within(editor).getByLabelText('Mensagem completa'),{target:{value:'Texto completo seguro.'}});
 fireEvent.change(within(editor).getByLabelText('Categoria'),{target:{value:'critical'}});
 expect(within(editor).getAllByRole('radio')).toHaveLength(5);
 expect((within(editor).getByLabelText('Azul') as HTMLInputElement).checked).toBe(true);
 fireEvent.click(within(editor).getByLabelText('Verde'));
 fireEvent.click(within(editor).getByRole('button',{name:'Salvar rascunho'}));
 await waitFor(()=>expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({state:'draft',category:'critical',tone:'success'}),null,expect.any(AbortSignal)));
 expect(screen.queryByText('Comunicado salvo no servidor.')).toBeNull();
 await act(async()=>finish({...row,title:'Aviso crítico'}));expect(await screen.findByText('Comunicado salvo no servidor.')).toBeTruthy();
});
it('conflito preserva texto e bloqueia reenvio obsoleto; fechar e recarregar consulta recupera',async()=>{
 calls.save.mockRejectedValue({code:'40001'});render(<AnnouncementsPage/>);await screen.findByText(row.title);
 fireEvent.click(screen.getByRole('button',{name:`Editar ${row.title}`}));const editor=screen.getByRole('dialog',{name:'Editar comunicado'});
 fireEvent.change(within(editor).getByLabelText('Mensagem completa'),{target:{value:'Meu texto preservado'}});
 fireEvent.click(within(editor).getByRole('button',{name:'Publicar comunicado'}));await screen.findByRole('alert');
 expect((within(editor).getByLabelText('Mensagem completa') as HTMLTextAreaElement).value).toBe('Meu texto preservado');
 expect((within(editor).getByRole('button',{name:'Salvar alterações'}) as HTMLButtonElement).disabled).toBe(true);
 expect(calls.save).toHaveBeenCalledWith(expect.objectContaining({state:'published'}),row,expect.any(AbortSignal));
});
it('troca de identidade descarta resposta anterior e desmonta formulário pendente',async()=>{
 let finish:(value:unknown)=>void=()=>{};calls.list.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=render(<AnnouncementsPage/>);state.user='synthetic-b';calls.list.mockResolvedValue({items:[],total:0});view.rerender(<AnnouncementsPage/>);
 await screen.findByText('Nenhum comunicado');await act(async()=>finish({items:[row],total:1}));expect(screen.queryByText(row.title)).toBeNull();
});
it('destaca ATIVO e exibe apenas Editar, sem prioridade ou histórico',async()=>{
 calls.list.mockResolvedValue({items:[{...row,state:'published',status:'active'}],total:1});
 render(<AnnouncementsPage/>);
 const card=await screen.findByRole('article');
 expect(within(card).getByText('ATIVO')).toBeTruthy();
 expect(within(card).getByRole('button',{name:`Editar ${row.title}`}).textContent).toBe('Editar');
 expect(within(card).queryByText(/Histórico|Prioridade/)).toBeNull();
});
