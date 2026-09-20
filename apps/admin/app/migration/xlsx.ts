export type SpreadsheetRow=Record<string,string>

const MAX_XLSX_BYTES=10*1024*1024
const MAX_WORKSHEET_ROWS=10001
const decoder=new TextDecoder('utf-8')

function u16(view:DataView,offset:number){return view.getUint16(offset,true)}
function u32(view:DataView,offset:number){return view.getUint32(offset,true)}

async function inflateRaw(data:Uint8Array){
  if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress XLSX files. Use UTF-8 CSV instead.')
  const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzip(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer)
  let eocd=-1
  for(let offset=Math.max(0,bytes.length-65557);offset<=bytes.length-22;offset++)if(u32(view,offset)===0x06054b50)eocd=offset
  if(eocd<0)throw new Error('XLSX archive is missing its ZIP directory.')
  const entryCount=u16(view,eocd+10),directoryOffset=u32(view,eocd+16)
  const files=new Map<string,Uint8Array>()
  let cursor=directoryOffset
  for(let i=0;i<entryCount;i++){
    if(u32(view,cursor)!==0x02014b50)throw new Error('XLSX ZIP directory is malformed.')
    const method=u16(view,cursor+10),compressedSize=u32(view,cursor+20),nameLength=u16(view,cursor+28),extraLength=u16(view,cursor+30),commentLength=u16(view,cursor+32),localOffset=u32(view,cursor+42)
    const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLength))
    if(u32(view,localOffset)!==0x04034b50)throw new Error('XLSX ZIP entry is malformed.')
    const localNameLength=u16(view,localOffset+26),localExtraLength=u16(view,localOffset+28)
    const start=localOffset+30+localNameLength+localExtraLength
    const compressed=bytes.slice(start,start+compressedSize)
    let value:Uint8Array
    if(method===0)value=compressed
    else if(method===8)value=await inflateRaw(compressed)
    else throw new Error('XLSX uses an unsupported ZIP compression method.')
    files.set(name,value)
    cursor+=46+nameLength+extraLength+commentLength
  }
  return files
}

function xml(bytes:Uint8Array,label:string){
  const doc=new DOMParser().parseFromString(decoder.decode(bytes),'application/xml')
  if(doc.querySelector('parsererror'))throw new Error(`XLSX ${label} XML is malformed.`)
  return doc
}

function required(files:Map<string,Uint8Array>,path:string){
  const value=files.get(path)
  if(!value)throw new Error(`XLSX is missing ${path}.`)
  return value
}

function normalizeWorksheetTarget(target:string){
  const value=target.replaceAll('\\','/')
  if(value.startsWith('/'))return value.slice(1)
  const parts=('xl/'+value).split('/')
  const normalized:string[]=[]
  for(const part of parts){if(part==='.'||part==='')continue;if(part==='..')normalized.pop();else normalized.push(part)}
  return normalized.join('/')
}

function columnIndex(reference:string){
  const letters=(reference.match(/^[A-Za-z]+/)?.[0]??'').toUpperCase()
  if(!letters)return -1
  let result=0
  for(const ch of letters)result=result*26+(ch.charCodeAt(0)-64)
  return result-1
}

function cellText(cell:Element,shared:string[]){
  const type=cell.getAttribute('t')??''
  if(type==='inlineStr')return Array.from(cell.getElementsByTagName('t')).map(node=>node.textContent??'').join('')
  const raw=cell.getElementsByTagName('v')[0]?.textContent??''
  if(type==='s'){
    const index=Number.parseInt(raw,10)
    if(!Number.isInteger(index)||index<0||index>=shared.length)throw new Error('XLSX contains an invalid shared-string reference.')
    return shared[index]
  }
  if(type==='b')return raw==='1'?'TRUE':'FALSE'
  return raw
}

function worksheetRows(doc:Document,shared:string[]){
  const result:{rowNumber:number;values:string[]}[]=[]
  for(const row of Array.from(doc.getElementsByTagName('row'))){
    if(result.length>=MAX_WORKSHEET_ROWS)throw new Error('XLSX exceeds the supported 10,000 data-row limit.')
    const rowNumber=Number.parseInt(row.getAttribute('r')??String(result.length+1),10)
    const values:string[]=[]
    for(const cell of Array.from(row.getElementsByTagName('c'))){
      const index=columnIndex(cell.getAttribute('r')??'')
      if(index<0)continue
      values[index]=cellText(cell,shared)
    }
    result.push({rowNumber:Number.isFinite(rowNumber)?rowNumber:result.length+1,values})
  }
  return result
}

export async function parseXlsx(file:File):Promise<SpreadsheetRow[]>{
  if(file.size>MAX_XLSX_BYTES)throw new Error('XLSX file exceeds the 10 MB staging limit.')
  const files=await unzip(await file.arrayBuffer())
  const workbook=xml(required(files,'xl/workbook.xml'),'workbook')
  const relations=xml(required(files,'xl/_rels/workbook.xml.rels'),'workbook relationships')
  const sheet=workbook.getElementsByTagName('sheet')[0]
  if(!sheet)throw new Error('XLSX workbook does not contain a worksheet.')
  const relationId=sheet.getAttribute('r:id')??sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')
  if(!relationId)throw new Error('XLSX first worksheet has no relationship id.')
  const relation=Array.from(relations.getElementsByTagName('Relationship')).find(node=>node.getAttribute('Id')===relationId)
  const target=relation?.getAttribute('Target')
  if(!target)throw new Error('XLSX first worksheet relationship cannot be resolved.')

  const sharedBytes=files.get('xl/sharedStrings.xml')
  const shared=sharedBytes?Array.from(xml(sharedBytes,'shared strings').getElementsByTagName('si')).map(item=>Array.from(item.getElementsByTagName('t')).map(node=>node.textContent??'').join('')):[]
  const rows=worksheetRows(xml(required(files,normalizeWorksheetTarget(target)),'worksheet'),shared).filter(row=>row.values.some(value=>(value??'').trim()!==''))
  if(rows.length<2)throw new Error('XLSX must contain a header row and at least one data row.')

  const headers=rows[0].values.map(value=>(value??'').trim())
  if(headers.some(value=>!value))throw new Error('XLSX contains an empty column header.')
  if(new Set(headers.map(value=>value.toLowerCase())).size!==headers.length)throw new Error('XLSX contains duplicate column headers.')

  return rows.slice(1).map(row=>Object.fromEntries(headers.map((header,index)=>[header,row.values[index]??'']))).map((item,index)=>({...item,__source_row:String(rows[index+1].rowNumber)}))
}
