import {open,realpath} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function privateFile(filename){
 if(!path.isAbsolute(filename))throw new Error('Absolute private file required');
 const resolved=await realpath(filename);if(resolved.startsWith(root))throw new Error('Private file must be outside checkout');
 const file=await open(filename,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const s=await file.stat();if(!s.isFile()||(s.mode&0o077)!==0||s.uid!==process.getuid())throw new Error('Private owner/mode required');return await file.readFile('utf8');}
 finally{await file.close();}
}
