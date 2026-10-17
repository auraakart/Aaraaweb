/** Parse import data without silently discarding ambiguous columns. */
export function parseMigrationCsv(text:string):Record<string,string>[] {
  const rows:{values:string[];line:number}[]=[];let row:string[]=[];let field='';let quoted=false,closed=false,line=1,rowLine=1
  for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1]
    if(ch==='"'&&quoted&&next==='"'){field+='"';i++;continue}
    if(ch==='"'){
      if(quoted){quoted=false;closed=true}else{if(field.length||closed)throw new Error('CSV contains an unexpected quote.');quoted=true}
      continue
    }
    if(ch===','&&!quoted){row.push(field);field='';closed=false;continue}
    if(ch==='\n'||ch==='\r'){
      const ending=ch==='\r'&&next==='\n'?'\r\n':ch
      if(ending.length===2)i++
      line++
      if(quoted){field+=ending;continue}
      row.push(field);field='';closed=false;if(row.some(v=>v.trim()!==''))rows.push({values:row,line:rowLine});row=[];rowLine=line;continue
    }
    if(closed)throw new Error('CSV contains text after a closing quote.')
    field+=ch
  }
  row.push(field);if(row.some(v=>v.trim()!==''))rows.push({values:row,line:rowLine})
  if(quoted)throw new Error('CSV contains an unclosed quoted field.')
  if(rows.length<2)throw new Error('CSV must contain a header row and at least one data row.')
  if(rows.length>10001)throw new Error('CSV supports at most 10000 data rows.')
  const headers=rows[0].values.map(v=>v.trim())
  if(headers.some(v=>!v))throw new Error('CSV contains an empty column header.')
  const keys=headers.map(header=>header.toLowerCase())
  if(new Set(keys).size!==keys.length)throw new Error('CSV contains duplicate column headers.')
  if(keys.includes('__source_row'))throw new Error('CSV source row numbers are generated automatically; remove the __source_row column.')
  return rows.slice(1).map(({values,line})=>{
    if(values.length>headers.length)throw new Error(`CSV row ${line} contains more values than column headers.`)
    return {...Object.fromEntries(headers.map((header,i)=>[header,values[i]??''])),__source_row:String(line)}
  })
}
