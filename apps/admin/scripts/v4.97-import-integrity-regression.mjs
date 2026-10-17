import assert from 'node:assert/strict'
import {parseMigrationCsv} from '../lib/migration-csv.ts'

assert.deepEqual(parseMigrationCsv('\r\nname,notes\r\n\r\nAlpha,"one\r\ntwo"\r\n\r\nBeta,done'),[
  {name:'Alpha',notes:'one\r\ntwo',__source_row:'4'},
  {name:'Beta',notes:'done',__source_row:'7'},
])
assert.deepEqual(parseMigrationCsv('name,notes\n"Alpha, Beta","A ""quoted"" note"'),[
  {name:'Alpha, Beta',notes:'A "quoted" note',__source_row:'2'},
])
assert.deepEqual(parseMigrationCsv('name,notes\nAlpha,'),[{name:'Alpha',notes:'',__source_row:'2'}])
assert.deepEqual(parseMigrationCsv('name\r\rAlpha\r\rBeta'),[{name:'Alpha',__source_row:'3'},{name:'Beta',__source_row:'5'}])
for(const value of ['name\nAl"pha','name\n"Alpha"tail','name\n"Alpha'])assert.throws(()=>parseMigrationCsv(value),/quote/)
assert.throws(()=>parseMigrationCsv('name\n\nAlpha,Beta'),/row 3 contains more values/)
assert.throws(()=>parseMigrationCsv('name,Name\nAlpha,Beta'),/duplicate column/)
assert.throws(()=>parseMigrationCsv('name,__SOURCE_ROW\nAlpha,99'),/generated automatically/)
console.log('V4.97 CSV integrity and physical source provenance: PASS (10 cases)')
