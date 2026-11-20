// Cloudflare Worker: serves the single-page app and a shared D1-backed API.
import html from './index.html';
const CATS={artists:5,songs:30,genres:5};
const RANK={artists:[150,125,100,75,50],genres:[45,37.5,30,22.5,15],songs:Array.from({length:30},(_,i)=>(30-i)*350/465)};
const multiplier=d=>d===0?1:d===1?.8:d===2?.65:d===3?.5:d===4?.4:d<=6?.3:d<=9?.2:d<=14?.1:.05;
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\u2010-\u2015]/g,'-').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const round=n=>Math.round((n+Number.EPSILON)*10)/10;
function cleanLists(raw){let out={};for(const [cat,len] of Object.entries(CATS)){if(!Array.isArray(raw?.[cat])||raw[cat].length>len)throw Error(`Invalid ${cat} list`);out[cat]=Array.from({length:len},(_,i)=>String(raw[cat][i]||'').trim().slice(0,160));let nonempty=out[cat].filter(Boolean).map(norm);if(new Set(nonempty).size!==nonempty.length)throw Error(`Duplicate ${cat} entries`);}return out;}
// Match titles with or without artist credits, while avoiding ambiguous fuzzy matches.
const title=s=>norm(String(s||'').split(/\s+[—–-]\s+|\s+by\s+/i)[0]);
function editDistance(a,b){const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let diag=prev[0];prev[0]=i;for(let j=1;j<=b.length;j++){const old=prev[j];prev[j]=Math.min(prev[j]+1,prev[j-1]+1,diag+(a[i-1]===b[j-1]?0:1));diag=old;}}return prev[b.length];}
function matchQuality(a,b,cat){const x=cat==='songs'?title(a):norm(a),y=cat==='songs'?title(b):norm(b);if(!x||!y)return 0;if(x===y)return 1;const longer=Math.max(x.length,y.length),dist=editDistance(x,y);if(longer>=6&&dist<=Math.min(2,Math.floor(longer*.18)))return .8;return 0;}
function score(pred,actual){let total=0,category={},details={};for(const cat of Object.keys(CATS)){let pts=0;const candidates=[];for(let i=0;i<pred[cat].length;i++)if(pred[cat][i])for(let j=0;j<actual[cat].length;j++)if(actual[cat][j]){const quality=matchQuality(pred[cat][i],actual[cat][j],cat);if(quality)candidates.push({i,j,quality,points:round(RANK[cat][j]*multiplier(Math.abs(i-j)))});}
// Only award automatically when the match is unambiguous on both sides.
const byPred=new Map(),byActual=new Map();for(const c of candidates){if(!byPred.has(c.i))byPred.set(c.i,[]);byPred.get(c.i).push(c);if(!byActual.has(c.j))byActual.set(c.j,[]);byActual.get(c.j).push(c);}
const used=new Set();details[cat]=pred[cat].map((name,i)=>{const choices=(byPred.get(i)||[]).sort((a,b)=>b.quality-a.quality||b.points-a.points);let chosen=choices.find(c=>!used.has(c.j)&&byActual.get(c.j).filter(x=>x.quality>=c.quality).length===1&&choices.filter(x=>x.quality>=c.quality).length===1);let ambiguous=choices.length>0&&!chosen;if(chosen){used.add(chosen.j);pts+=chosen.points;}return {prediction:name,predictedRank:i+1,actualRank:chosen?chosen.j+1:null,points:chosen?chosen.points:0,needsReview:ambiguous};});category[cat]=round(pts);total+=pts;}return {total:round(total),category,details};}

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
export default {async fetch(request,env){const url=new URL(request.url);if(url.pathname==='/'||url.pathname==='/index.html')return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});if(!url.pathname.startsWith('/api/'))return new Response('Not found',{status:404});try{
if(!env.DB)throw Error('D1 database not configured');
const game=await env.DB.prepare('SELECT phase FROM game WHERE id=1').first();if(!game)throw Error('Run schema.sql first');
const method=request.method,route=url.pathname;
if(route==='/api/state'&&method==='GET'){
const rows=(await env.DB.prepare('SELECT id,name,predictions,actual FROM players ORDER BY name COLLATE NOCASE').all()).results;
const players=rows.map(p=>{let predictions=JSON.parse(p.predictions),actual=JSON.parse(p.actual);let hasResults=Object.values(actual).some(a=>a.some(Boolean));return {id:p.id,name:p.name,predictions:game.phase==='predictions'?null:predictions,actual:game.phase==='predictions'||!hasResults?null:actual,hasResults,score:game.phase==='predictions'||!hasResults?null:score(predictions,actual),filled:Object.fromEntries(Object.keys(CATS).map(k=>[k,predictions[k].filter(Boolean).length]))};});return json({phase:game.phase,players});}
if(route==='/api/player'&&method==='POST'){
if(game.phase!=='predictions')return json({error:'New players cannot join after predictions lock'},403);
const body=await request.json(),name=String(body.name||'').trim().replace(/\s+/g,' ').slice(0,60);if(name.length<2)return json({error:'Enter a name with at least 2 characters'},400);
let row=await env.DB.prepare('SELECT id,name FROM players WHERE name=? COLLATE NOCASE').bind(name).first();if(!row){let id=crypto.randomUUID();await env.DB.prepare('INSERT OR IGNORE INTO players(id,name) VALUES(?,?)').bind(id,name).run();row=await env.DB.prepare('SELECT id,name FROM players WHERE name=? COLLATE NOCASE').bind(name).first();}return json(row);}
if(route==='/api/player-data'&&method==='GET'){
const id=url.searchParams.get('id');let row=await env.DB.prepare('SELECT id,name,predictions,actual FROM players WHERE id=?').bind(id).first();if(!row)return json({error:'Player not found'},404);return json({id:row.id,name:row.name,predictions:JSON.parse(row.predictions),actual:JSON.parse(row.actual)});}
if(route==='/api/save'&&method==='POST'){
const b=await request.json(),type=b.type;if(!['predictions','actual'].includes(type))return json({error:'Invalid save type'},400);
if(type==='predictions'&&game.phase!=='predictions'||type==='actual'&&game.phase!=='results')return json({error:'Editing is closed for this section'},403);
const lists=cleanLists(b.lists);let row=await env.DB.prepare('SELECT id FROM players WHERE id=?').bind(b.id).first();if(!row)return json({error:'Player not found'},404);
await env.DB.prepare(`UPDATE players SET ${type}=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(JSON.stringify(lists),b.id).run();return json({ok:true});}
if(route==='/api/admin'&&method==='POST'){
if(!env.ADMIN_PIN||String(env.ADMIN_PIN).length<6)return json({error:'Set an ADMIN_PIN secret of at least 6 characters'},500);
const b=await request.json();if(b.pin!==env.ADMIN_PIN)return json({error:'Incorrect organizer PIN'},403);
if(!['predictions','results'].includes(b.phase))return json({error:'Invalid phase'},400);
await env.DB.prepare('UPDATE game SET phase=? WHERE id=1').bind(b.phase).run();return json({ok:true,phase:b.phase});}
return json({error:'Unknown endpoint'},404);
}catch(e){return json({error:e.message||'Server error'},400);}}};
