import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.cwd());
const apiRoot=path.join(root,'services/api/src');
const policy=JSON.parse(fs.readFileSync(path.join(root,'docs/api-contract-policy.json'),'utf8'));

function walk(dir){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const full=path.join(dir,entry.name);
    return entry.isDirectory()?walk(full):[full];
  });
}
function routePath(prefix,sub){
  const joined=[prefix,sub].filter(Boolean).join('/').replace(/\/+/g,'/');
  return '/api/v1/'+joined.replace(/^\/|\/$/g,'').replace(/:([A-Za-z0-9_]+)/g,'{$1}');
}
function pathParameters(value){
  return [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map(match=>({
    name:match[1],in:'path',required:true,schema:{type:'string'}
  }));
}

const files=walk(apiRoot).filter(file=>file.endsWith('.controller.ts')).sort();
const routes=new Map();
const roots=new Set();
let literalOperations=0;
for(const file of files){
  const source=fs.readFileSync(file,'utf8');
  const controllers=[...source.matchAll(/@Controller\(\s*['"`]([^'"`]+)['"`]\s*\)/g)];
  for(let index=0;index<controllers.length;index++){
    const controller=controllers[index];
    const prefix=controller[1];
    roots.add(prefix.split('/')[0]);
    const start=controller.index??0;
    const end=index+1<controllers.length?(controllers[index+1].index??source.length):source.length;
    const segment=source.slice(start,end);
    const methods=/@(Get|Post|Put|Patch|Delete)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let match;
    while((match=methods.exec(segment))){
      const method=match[1].toLowerCase();
      const route=routePath(prefix,match[2]||'');
      const key=`${method.toUpperCase()} ${route}`;
      if(routes.has(key)){
        console.error(`Duplicate literal API route: ${key} in ${path.relative(root,file)} and ${routes.get(key)}`);
        process.exit(1);
      }
      routes.set(key,path.relative(root,file));
      literalOperations++;
    }
  }
}
if(literalOperations<policy.minimumLiteralOperations){
  console.error(`API contract shrank unexpectedly: ${literalOperations} < ${policy.minimumLiteralOperations}`);
  process.exit(1);
}
for(const required of policy.requiredRoots){
  if(!roots.has(required)){
    console.error(`Required API contract root missing: ${required}`);
    process.exit(1);
  }
}

const clientRoots=new Set();
for(const base of ['apps/admin','apps/resident/lib','apps/guard/lib']){
  for(const file of walk(path.join(root,base)).filter(file=>/\.(ts|tsx|dart)$/.test(file))){
    for(const line of fs.readFileSync(file,'utf8').split('\n')){
      if(!/(fetch\(|adminApi|\bapi[<(]|_send\(|apiClient\.(get|post|put|patch|delete))/.test(line))continue;
      const matches=line.matchAll(/['"`](\/api\/v1\/|\/)([a-z][a-z0-9-]+)/g);
      for(const match of matches)clientRoots.add(match[2]);
    }
  }
}
const ignored=new Set(policy.clientOnlyRoots??[]);
const unknown=[...clientRoots].filter(value=>!roots.has(value)&&!ignored.has(value)).sort();
if(unknown.length){
  console.error(`Client API roots without a Nest controller root: ${unknown.join(', ')}`);
  process.exit(1);
}

const openapi={openapi:'3.1.0',info:{title:'Aaraagate Repository API Contract',version:'4.36.0'},paths:{}};
for(const [key,file] of [...routes.entries()].sort(([a],[b])=>a.localeCompare(b))){
  const space=key.indexOf(' ');
  const method=key.slice(0,space).toLowerCase();
  const route=key.slice(space+1);
  openapi.paths[route]??={};
  openapi.paths[route][method]={
    operationId:`${file.replaceAll('/','_').replace('.controller.ts','')}_${method}`,
    responses:{'200':{description:'Repository route contract response'}},
    ...(pathParameters(route).length?{parameters:pathParameters(route)}:{})
  };
}
const rendered=JSON.stringify(openapi,null,2)+'\n';
const out=process.env.AARAAGATE_OPENAPI_OUTPUT||'/tmp/aaraagate-openapi.generated.json';
fs.writeFileSync(out,rendered);
console.log(`V4.36 API contract clean: ${literalOperations} literal operations, ${roots.size} roots; generated ${out}`);
