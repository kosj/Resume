// Local-only D1 adapter for development/tests; the deployed Worker uses env.DB.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
export function database(path=':memory:'){
 const db=new DatabaseSync(path);db.exec(readFileSync(new URL('./migrations/0001_initial.sql',import.meta.url),'utf8'));
 return{raw:db,prepare(sql){return{bind(...args){return{sql,args};}};},async batch(statements){db.exec('BEGIN');try{const out=statements.map(({sql,args})=>{const q=db.prepare(sql);if(/^\s*SELECT\b/i.test(sql))return{success:true,results:q.all(...args)};const r=q.run(...args);return{success:true,results:[],meta:{changes:r.changes}};});db.exec('COMMIT');return out;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
