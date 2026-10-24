// Converts the reviewed editorial source to the C++ runtime document.
// Input is a public catalog snapshot, never an env file or authenticated response.
import {readFile,writeFile} from 'node:fs/promises';
const snapshot=JSON.parse(await readFile(process.argv[2]||'artifacts/catalog-copy/before-public.json','utf8'));
const lines=(await readFile('database/catalog-copy.vi.tsv','utf8')).trimEnd().split(/\r?\n/).slice(1);
const seen=new Set();
const products=lines.map(line=>{
 const [key,name,introduction,usage,...extra]=line.split('\t');
 const source_id=Number(key);
 if(extra.length||!Number.isSafeInteger(source_id)||seen.has(source_id)||![name,introduction,usage].every(Boolean))throw Error('Invalid editorial row '+key);
 seen.add(source_id);
 const source=snapshot.products.find(p=>p.source_id===source_id&&!p.demo_series);
 if(!source)throw Error('Missing source '+source_id);
 if(source.name===name)throw Error('Use the original pre-edit snapshot, not the localized catalog: '+source_id);
 return {source_id,source_title:source.name,source_image:source.image,name,introduction,usage};
});
const ids=new Set(snapshot.products.map(p=>p.source_id));
if(ids.size!==products.length||[...ids].some(id=>!seen.has(id)))throw Error('Incomplete editorial coverage');
await writeFile('database/catalog-copy.vi.json',JSON.stringify({version:1,language:'vi',source:'DummyJSON',products},null,2)+'\n');
console.log(`Prepared ${products.length} reviewed originals for ${snapshot.products.length} listings.`);
