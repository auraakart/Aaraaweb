export type SpreadsheetRow=Record<string,string>

const MAX_XLSX_BYTES=10*1024*1024
const MAX_WORKSHEET_ROWS=10001
const MAX_ENTRY_BYTES=16*1024*1024
const MAX_EXPANDED_BYTES=32*1024*1024
const MAX_ZIP_ENTRIES=512
const MAX_COLUMN=16384
const decoder=new TextDecoder('utf-8')

function u16(view:DataView,offset:number){return view.getUint16(offset,true)}
function u32(view:DataView,offset:number){return view.getUint32(offset,true)}

async function inflateRaw(data:Uint8Array,expected:number){
  if(typeof DecompressionStream==='undefined')throw new Error('This browser cannot decompress XLSX files. Use UTF-8 CSV instead.')
  const input=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength) as ArrayBuffer
  const stream=new Blob([input]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const reader=stream.getReader(),chunks:Uint8Array[]=[]
  let size=0
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break
      size+=value.byteLength
      if(size>expected||size>MAX_ENTRY_BYTES)throw new Error('XLSX expanded entry exceeds its supported size.')
      chunks.push(value)
    }
  }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
  if(size!==expected)throw new Error('XLSX expanded entry size does not match its ZIP directory.')
  const result=new Uint8Array(size);let offset=0
  for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.byteLength}
  return result
}

async function unzip(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer)
  let eocd=-1
  for(let offset=Math.max(0,bytes.length-65557);offset<=bytes.length-22;offset++)if(u32(view,offset)===0x06054b50&&offset+22+u16(view,offset+20)===bytes.length)eocd=offset
  if(eocd<0)throw new Error('XLSX archive is missing its ZIP directory.')
  const entryCount=u16(view,eocd+10),directoryOffset=u32(view,eocd+16),directorySize=u32(view,eocd+12)
  if(u16(view,eocd+4)!==0||u16(view,eocd+6)!==0||u16(view,eocd+8)!==entryCount||entryCount>MAX_ZIP_ENTRIES||directoryOffset+directorySize!==eocd)throw new Error('XLSX ZIP directory exceeds supported bounds.')
  const files=new Map<string,Uint8Array>()
  let cursor=directoryOffset,expanded=0
  for(let i=0;i<entryCount;i++){
    if(cursor+46>eocd||u32(view,cursor)!==0x02014b50)throw new Error('XLSX ZIP directory is malformed.')
    const flags=u16(view,cursor+8),method=u16(view,cursor+10),compressedSize=u32(view,cursor+20),size=u32(view,cursor+24),nameLength=u16(view,cursor+28),extraLength=u16(view,cursor+30),commentLength=u16(view,cursor+32),localOffset=u32(view,cursor+42)
    expanded+=size
    if(size>MAX_ENTRY_BYTES||expanded>MAX_EXPANDED_BYTES)throw new Error('XLSX expanded content exceeds the supported size limit. Use CSV instead.')
    if(flags&1||cursor+46+nameLength+extraLength+commentLength>eocd||localOffset+30>directoryOffset)throw new Error('XLSX ZIP entry is malformed or encrypted.')
    const name=decoder.decode(bytes.slice(cursor+46,cursor+46+nameLength))
    if(files.has(name))throw new Error('XLSX contains duplicate ZIP entries.')
    if(u32(view,localOffset)!==0x04034b50||u16(view,localOffset+8)!==method)throw new Error('XLSX ZIP entry is malformed.')
    const localNameLength=u16(view,localOffset+26),localExtraLength=u16(view,localOffset+28)
    const start=localOffset+30+localNameLength+localExtraLength
    if(start+compressedSize>directoryOffset||decoder.decode(bytes.slice(localOffset+30,localOffset+30+localNameLength))!==name)throw new Error('XLSX ZIP entry is outside its supported bounds.')
    const compressed=bytes.slice(start,start+compressedSize)
    let value:Uint8Array
    if(method===0){if(compressedSize!==size)throw new Error('XLSX stored entry size does not match its ZIP directory.');value=compressed}
    else if(method===8)value=await inflateRaw(compressed,size)
    else throw new Error('XLSX uses an unsupported ZIP compression method.')
    files.set(name,value)
    cursor+=46+nameLength+extraLength+commentLength
  }
  if(cursor!==eocd)throw new Error('XLSX ZIP directory length is inconsistent.')
  return files
}

function xml(bytes:Uint8Array,label:string){
  if(/<!DOCTYPE|<!ENTITY/i.test(decoder.decode(bytes)))throw new Error(`XLSX ${label} XML contains unsupported declarations.`)
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
  const letters=(reference.match(/^([A-Za-z]{1,3})[1-9]\d*$/)?.[1]??'').toUpperCase()
  if(!letters)return -1
  let result=0
  for(const ch of letters)result=result*26+(ch.charCodeAt(0)-64)
  return result<=MAX_COLUMN?result-1:-1
}

function cellText(cell:Element,shared:string[]){
  if(cell.getElementsByTagName('f').length)throw new Error('XLSX formulas are not supported. Export calculated values to CSV instead.')
  const type=cell.getAttribute('t')??''
  if(type==='inlineStr')return Array.from(cell.getElementsByTagName('t')).map(node=>node.textContent??'').join('')
  const raw=cell.getElementsByTagName('v')[0]?.textContent??''
  if(type==='s'){
    const index=/^\d+$/.test(raw)?Number(raw):NaN
    if(!Number.isInteger(index)||index<0||index>=shared.length)throw new Error('XLSX contains an invalid shared-string reference.')
    return shared[index]
  }
  if(type==='b'){if(!['0','1'].includes(raw))throw new Error('XLSX contains an invalid boolean value.');return raw==='1'?'TRUE':'FALSE'}
  if(!['','n','str','d'].includes(type))throw new Error('XLSX contains an unsupported cell value. Export values to CSV instead.')
  return raw
}

function worksheetRows(doc:Document,shared:string[]){
  const result:{rowNumber:number;values:string[]}[]=[]
  let previous=0
  for(const row of Array.from(doc.getElementsByTagName('row'))){
    if(result.length>=MAX_WORKSHEET_ROWS)throw new Error('XLSX exceeds the supported 10,000 data-row limit.')
    const rawNumber=row.getAttribute('r')??String(previous+1)
    const rowNumber=/^[1-9]\d*$/.test(rawNumber)?Number(rawNumber):NaN
    if(!Number.isSafeInteger(rowNumber)||rowNumber<=previous||rowNumber>1048576)throw new Error('XLSX contains an invalid or repeated row number.')
    previous=rowNumber
    const values:string[]=[]
    for(const cell of Array.from(row.getElementsByTagName('c'))){
      const index=columnIndex(cell.getAttribute('r')??'')
      if(index<0||Number(cell.getAttribute('r')?.match(/\d+$/)?.[0])!==rowNumber)throw new Error('XLSX contains an invalid cell reference.')
      if(Object.hasOwn(values,index))throw new Error('XLSX contains duplicate cell references.')
      values[index]=cellText(cell,shared)
    }
    result.push({rowNumber,values})
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
  if(!target||relation?.getAttribute('TargetMode')==='External')throw new Error('XLSX first worksheet relationship cannot be resolved.')

  const sharedBytes=files.get('xl/sharedStrings.xml')
  const shared=sharedBytes?Array.from(xml(sharedBytes,'shared strings').getElementsByTagName('si')).map(item=>Array.from(item.getElementsByTagName('t')).map(node=>node.textContent??'').join('')):[]
  const rows=worksheetRows(xml(required(files,normalizeWorksheetTarget(target)),'worksheet'),shared).filter(row=>row.values.some(value=>(value??'').trim()!==''))
  if(rows.length<2)throw new Error('XLSX must contain a header row and at least one data row.')

  const headers=Array.from(rows[0].values,value=>(value??'').trim())
  if(headers.some(value=>!value))throw new Error('XLSX contains an empty column header.')
  if(new Set(headers.map(value=>value.toLowerCase())).size!==headers.length)throw new Error('XLSX contains duplicate column headers.')
  if(headers.some(value=>value.toLowerCase()==='__source_row'))throw new Error('XLSX source row numbers are generated automatically; remove the __source_row column.')

  return rows.slice(1).map(row=>{
    if(row.values.length>headers.length)throw new Error(`XLSX row ${row.rowNumber} contains more values than column headers.`)
    return {...Object.fromEntries(headers.map((header,index)=>[header,row.values[index]??''])),__source_row:String(row.rowNumber)}
  })
}
