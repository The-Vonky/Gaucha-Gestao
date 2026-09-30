// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
const http=vi.hoisted(()=>vi.fn());
vi.mock("../apps/web/src/core/client",()=>({
 client:createClient("http://127.0.0.1:54321","test-key",{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:http}})
}));
import { finalize } from "../apps/web/src/modules/audit/api";
afterEach(()=>http.mockReset());
describe("Audit evidence finalization client",()=>{
 it("sends the exact complete set selected by the caller",async()=>{
  http.mockResolvedValue(new Response(null,{status:204}));
  await finalize("inspection",1,["evidence-section-9","evidence-section-1"]);
  const [url,init]=http.mock.calls[0];
  expect(String(url)).toContain("/rpc/finalize_inspection");
  expect(JSON.parse(init.body)).toEqual({p_id:"inspection",p_version:1,p_expected_evidence_ids:["evidence-section-9","evidence-section-1"]});
 });
});
