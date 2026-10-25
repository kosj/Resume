// Loopback-only development API. No production secrets or external services needed.
import http from 'node:http';
import worker from './worker.mjs';
import {database} from './local-db.mjs';
if(!process.env.ADMIN_TOKEN||process.env.ADMIN_TOKEN.length<32){console.error('Set ADMIN_TOKEN to a development key of at least 32 characters.');process.exit(1);}
const env={DB:database(process.env.ANALYTICS_DB||':memory:'),SITE_ORIGIN:process.env.SITE_ORIGIN||'http://127.0.0.1:8009',BASE_PATH:'/',ADMIN_TOKEN:process.env.ADMIN_TOKEN,SESSION_SALT:process.env.SESSION_SALT||'local-development-session-salt-not-for-production'};
const server=http.createServer(async(req,res)=>{try{const request=new Request('http://127.0.0.1:8787'+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});const result=await worker.fetch(request,env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}catch{res.writeHead(500).end();}});
server.listen(8787,'127.0.0.1',()=>console.log('Local analytics API: http://127.0.0.1:8787 (loopback, in-memory unless ANALYTICS_DB is set)'));
