/** Parse import data without silently discarding ambiguous columns. */
export function parseMigrationCsv(text:string):Record<string,string>[] {
  const rows:string[][]=[];let row:string[]=[];let field='';let quoted=false
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1]
    if(ch==='"'&&quoted&&next==='"'){field+='"';i++;continue}
    if(ch==='"'){quoted=!quoted;continue}
    if(ch===','&&!quoted){row.push(field);field='';continue}
    if(((ch.charCodeAt(0)===10)||(ch.charCodeAt(0)===13))&&!quoted){if(ch.charCodeAt(0)===13&&next?.charCodeAt(0)===10)i++;row.push(field);field='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[];continue}
    field+=ch
  }
  row.push(field);if(row.some(v=>v.trim()!==''))rows.push(row)
  if(quoted)throw new Error('CSV contains an unclosed quoted field.')
  if(rows.length<2)throw new Error('CSV must contain a header row and at least one data row.')
  if(rows.length>10001)throw new Error('CSV supports at most 10000 data rows.')
  const headers=rows[0].map(v=>v.trim())
  if(headers.some(v=>!v))throw new Error('CSV contains an empty column header.')
  const keys=headers.map(header=>header.toLowerCase())
  if(new Set(keys).size!==keys.length)throw new Error('CSV contains duplicate column headers.')
  if(keys.includes('__source_row'))throw new Error('CSV source row numbers are generated automatically; remove the __source_row column.')
  return rows.slice(1).map((values,index)=>{
    if(values.length>headers.length)throw new Error(`CSV row ${index+2} contains more values than column headers.`)
    return {...Object.fromEntries(headers.map((header,i)=>[header,values[i]??''])),__source_row:String(index+2)}
  })
}
