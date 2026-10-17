import {test,expect} from '@playwright/test'
import {deflateRawSync} from 'node:zlib'

// Real ZIP bytes drive the production File/DecompressionStream/DOMParser path.
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=crc>>>1^((crc&1)?0xedb88320:0)}return(crc^0xffffffff)>>>0}
function archive(entries){
  const local=[],directory=[];let offset=0
  for(const entry of entries){
    const name=Buffer.from(entry.name),value=Buffer.from(entry.value),method=entry.method??8
    const data=method===0?value:deflateRawSync(value),size=entry.size??value.length,crc=crc32(value)
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(method,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(size,22);header.writeUInt16LE(name.length,26)
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(method,10);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(size,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42)
    local.push(header,name,data);directory.push(central,name);offset+=header.length+name.length+data.length
  }
  const table=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(table.length,12);end.writeUInt32LE(offset,16)
  return Buffer.concat([...local,table,end])
}
const cell=(ref,text)=>`<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`
const row=(number,cells)=>`<row r="${number}">${cells}</row>`
const simple=row(1,cell('A1','name'))+row(2,cell('A2','Alpha'))
function workbook(rows=simple,{method=8,shared,size,duplicate=false}={}){
  const sheet={name:'xl/worksheets/sheet1.xml',value:`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`,method,...(size===undefined?{}:{size})}
  const entries=[
    {name:'xl/workbook.xml',value:'<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>',method},
    {name:'xl/_rels/workbook.xml.rels',value:'<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',method},
    sheet,
  ]
  if(shared)entries.push({name:'xl/sharedStrings.xml',value:shared,method})
  if(duplicate)entries.push(sheet)
  return archive(entries)
}
async function upload(page,buffer){
  await page.goto('/adoption.html')
  await page.getByLabel('CSV or XLSX file').setInputFiles({name:'import.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer})
}
async function previewRows(page){
  await page.getByRole('button',{name:'Preview validation'}).click()
  await expect.poll(()=>page.evaluate(()=>window.adoption.requests.length)).toBe(1)
  return page.evaluate(()=>window.adoption.requests[0].body.rows)
}
for(const method of [0,8])test(`XLSX ${method===0?'stored':'deflated'} upload preserves sparse values and physical row provenance`,async({page})=>{
  await upload(page,workbook(row(1,cell('A1','name')+cell('B1','notes'))+row(3,cell('A3','Alpha'))+row(7,cell('A7','Beta &amp; Ω')+cell('B7','Line one&#10;Line two')),{method}))
  expect(await previewRows(page)).toEqual([{name:'Alpha',notes:'',__source_row:'3'},{name:'Beta & Ω',notes:'Line one\nLine two',__source_row:'7'}])
  expect(await page.evaluate(()=>window.adoption.requests[0].path)).toContain('/migration/preview')
  expect(await page.evaluate(()=>window.adoption.created)).toBe(0)
})
test('XLSX shared strings preserve decoded values',async({page})=>{
  await upload(page,workbook(row(1,cell('A1','name'))+row(2,'<c r="A2" t="s"><v>0</v></c>'),{shared:'<sst><si><r><t>Alpha </t></r><r><t>&amp; Ω</t></r></si></sst>'}))
  expect(await previewRows(page)).toEqual([{name:'Alpha & Ω',__source_row:'2'}])
})
test('XLSX preview errors retain the worksheet source row rather than the record ordinal',async({page})=>{
  await upload(page,workbook(row(1,cell('A1','name'))+row(3,cell('A3','Alpha'))+row(7,cell('A7','Beta'))))
  await previewRows(page)
  await page.evaluate(()=>window.adoption.reply(0,{entityType:'BUILDING',totalRows:2,validRows:1,invalidRows:1,duplicateRows:0,normalizedRows:[{name:'Alpha'},{name:'Beta'}],issues:[{row:2,field:'code',code:'REQUIRED',message:'Code is required'}]}))
  await expect(page.getByText('Source row 7 · code',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
})
const rejected=[
  ['extra cells',workbook(row(1,cell('A1','name'))+row(2,cell('A2','Alpha')+cell('B2','Lost data'))),'XLSX row 2 contains more values than column headers.'],
  ['sparse header',workbook(row(1,cell('A1','name')+cell('C1','notes'))+row(2,cell('A2','Alpha'))),'XLSX contains an empty column header.'],
  ['duplicate header',workbook(row(1,cell('A1','name')+cell('B1','Name'))+row(2,cell('A2','Alpha'))),'XLSX contains duplicate column headers.'],
  ['reserved provenance',workbook(row(1,cell('A1','__SOURCE_ROW'))+row(2,cell('A2','999'))),'XLSX source row numbers are generated automatically; remove the __source_row column.'],
  ['duplicate cell',workbook(row(1,cell('A1','name'))+row(2,cell('A2','Alpha')+cell('A2','Overwritten'))),'XLSX contains duplicate cell references.'],
  ['invalid column',workbook(row(1,cell('A1','name'))+row(2,cell('XFE2','Alpha'))),'XLSX contains an invalid cell reference.'],
  ['invalid reference',workbook(row(1,cell('A1','name'))+row(2,cell('A2junk','Alpha'))),'XLSX contains an invalid cell reference.'],
  ['wrong row reference',workbook(row(1,cell('A1','name'))+row(2,cell('A3','Alpha'))),'XLSX contains an invalid cell reference.'],
  ['duplicate row',workbook(simple+row(2,cell('A2','Overwritten'))),'XLSX contains an invalid or repeated row number.'],
  ['malformed row',workbook(row(1,cell('A1','name'))+row('2junk',cell('A2','Alpha'))),'XLSX contains an invalid or repeated row number.'],
  ['cached formula',workbook(row(1,cell('A1','amountPaise'))+row(2,'<c r="A2"><f>1+1</f><v>99999</v></c>')),'XLSX formulas are not supported. Export calculated values to CSV instead.'],
  ['error cell',workbook(row(1,cell('A1','name'))+row(2,'<c r="A2" t="e"><v>#REF!</v></c>')),'XLSX contains an unsupported cell value. Export values to CSV instead.'],
  ['malformed shared reference',workbook(row(1,cell('A1','name'))+row(2,'<c r="A2" t="s"><v>0junk</v></c>'),{shared:'<sst><si><t>Alpha</t></si></sst>'}),'XLSX contains an invalid shared-string reference.'],
  ['invalid boolean',workbook(row(1,cell('A1','name'))+row(2,'<c r="A2" t="b"><v>2</v></c>')),'XLSX contains an invalid boolean value.'],
  ['duplicate archive entry',workbook(simple,{duplicate:true}),'XLSX contains duplicate ZIP entries.'],
  ['declared expansion limit',workbook(simple,{size:16*1024*1024+1}),'XLSX expanded content exceeds the supported size limit. Use CSV instead.'],
  ['actual inflation exceeds declaration',workbook(simple,{size:1}),'XLSX expanded entry exceeds its supported size.'],
  ['incomplete expanded entry',workbook(simple,{size:100000}),'XLSX expanded entry size does not match its ZIP directory.'],
  ['inconsistent stored size',workbook(simple,{method:0,size:1}),'XLSX stored entry size does not match its ZIP directory.'],
]
for(const [name,buffer,message]of rejected)test(`XLSX rejects ${name} before preview or batch creation`,async({page})=>{
  await upload(page,buffer)
  await expect(page.getByText(message,{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:'Preview validation'})).toBeDisabled()
  await expect(page.getByRole('button',{name:'Create dry-run batch'})).toBeDisabled()
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(0)
})
test('XLSX cumulative expansion is bounded across individually permitted entries',async({page})=>{
  const padding=' '.repeat(16*1024*1024)
  await upload(page,archive([
    {name:'padding-one',value:padding},
    {name:'padding-two',value:padding},
    {name:'padding-three',value:'x'},
  ]))
  await expect(page.getByText('XLSX expanded content exceeds the supported size limit. Use CSV instead.',{exact:true})).toBeVisible()
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(0)
})
test('a rejected XLSX can be replaced and previewed without retaining rejected data',async({page})=>{
  await upload(page,rejected[0][1])
  await expect(page.getByText(rejected[0][2],{exact:true})).toBeVisible()
  await page.getByLabel('CSV or XLSX file').setInputFiles({name:'recovered.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook()})
  expect(await previewRows(page)).toEqual([{name:'Alpha',__source_row:'2'}])
  expect(await page.evaluate(()=>window.adoption.created)).toBe(0)
})
test('CSV provenance follows physical lines through blanks and multiline quoted fields',async({page})=>{
  await page.goto('/adoption.html')
  await page.getByLabel('CSV data',{exact:true}).fill('\r\nname,notes\r\n\r\nAlpha,"line one\r\nline two"\r\n\r\nBeta,done')
  expect(await previewRows(page)).toEqual([{name:'Alpha',notes:'line one\nline two',__source_row:'4'},{name:'Beta',notes:'done',__source_row:'7'}])
})
for(const csv of ['name\nAl"pha','name\n"Alpha"tail'])test(`CSV rejects malformed quoting ${JSON.stringify(csv)} before preview`,async({page})=>{
  await page.goto('/adoption.html');await page.getByLabel('CSV data',{exact:true}).fill(csv)
  await page.getByRole('button',{name:'Preview validation'}).click()
  await expect(page.getByText(/CSV contains (an unexpected quote|text after a closing quote)/)).toBeVisible()
  expect(await page.evaluate(()=>window.adoption.requests.length)).toBe(0)
})
