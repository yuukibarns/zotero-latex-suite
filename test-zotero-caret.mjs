// Real Zotero, including its resource:// document and plugin injection.
// All notes and preferences live in the disposable profile/data directory.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(path.join(tmpdir(),'latex-suite-zotero-caret-'));
const result=path.join(profile,'result.json');
const helper=path.join(profile,'extensions','caret-test@example.invalid');
await mkdir(helper,{recursive:true});
await writeFile(path.join(profile,'user.js'),[
 ['extensions.autoDisableScopes',0],['extensions.startupScanScopes',15],
 ['extensions.update.enabled',false],['extensions.zotero.firstRun2',false],
 ['browser.shell.checkDefaultBrowser',false],
].map(([k,v])=>`user_pref(${JSON.stringify(k)},${JSON.stringify(v)});`).join('\n'));
await writeFile(path.join(helper,'manifest.json'),JSON.stringify({manifest_version:2,name:'Isolated caret test',version:'1.0',applications:{zotero:{id:'caret-test@example.invalid',strict_min_version:'6.999',strict_max_version:'10.0.*',update_url:'https://example.invalid/updates.json'}}}));
await writeFile(path.join(helper,'bootstrap.js'),'const CONFIG='+JSON.stringify({result,holdMs:Number(process.env.CARET_HOLD_MS)||0,reportedOnly:!!process.env.CARET_REPORTED_ONLY})+';\n'+await readFile('test-zotero-caret-bootstrap.js','utf8'));
const {version}=JSON.parse(await readFile('manifest.json','utf8'));
await copyFile(process.env.CARET_XPI||`../../outputs/latex-suite-completion-${version}.xpi`,path.join(profile,'extensions','latex-suite@ievlevpn.github.io.xpi'));
let app,stderr='';
try{
 app=spawn('/usr/lib/zotero/zotero-bin',['-app','/usr/lib/zotero/app/application.ini','--headless','--no-remote','--profile',profile,'-datadir','profile'],{stdio:['ignore','ignore','pipe'],detached:true,env:{...process.env,MOZ_LEGACY_PROFILES:'1',MOZ_ALLOW_DOWNGRADE:'1'}});
 app.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-5000);});
 let previous='';
 for(let i=0;i<180;i++){
  try{const text=await readFile(result,'utf8');if(text!==previous){console.log(text);previous=text;}const data=JSON.parse(text);if(data.done){if(data.error)throw new Error(data.error);break;}}catch(error){if(error.code!=='ENOENT')throw error;}
  if(app.exitCode!==null)throw new Error('Zotero exited: '+stderr);
  if(i===179)throw new Error('Test timed out: '+stderr);
  await pause(500);
 }
}finally{
 if(app&&app.exitCode===null){try{process.kill(-app.pid,'SIGTERM');}catch{}await Promise.race([new Promise(r=>app.once('exit',r)),pause(2000)]);try{process.kill(-app.pid,'SIGKILL');}catch{}}
 await rm(profile,{recursive:true,force:true});
}
