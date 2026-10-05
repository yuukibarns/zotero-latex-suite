import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const pause = ms => new Promise(r => setTimeout(r, ms));
const profile = await mkdtemp(path.join(tmpdir(), 'tikzcd-native-'));
const helper = path.join(profile, 'extensions', 'tikzcd-test@example.invalid');
const result = path.join(profile, 'result.json');
const withLatex = true;
const screenshot = path.resolve('build/native-note.png');
let app;
try {
  await mkdir(helper, { recursive: true });
  await writeFile(path.join(profile, 'user.js'), 'user_pref("extensions.autoDisableScopes",0);\nuser_pref("extensions.startupScanScopes",15);\nuser_pref("extensions.update.enabled",false);\nuser_pref("extensions.zotero.firstRun2",false);');
  await writeFile(path.join(helper, 'manifest.json'), JSON.stringify({manifest_version:2,name:'Tikzcd test',version:'1.0',applications:{zotero:{id:'tikzcd-test@example.invalid',strict_min_version:'10.0',strict_max_version:'10.*',update_url:'https://example.invalid/updates.json'}}}));
  await writeFile(path.join(helper, 'bootstrap.js'), 'const CONFIG=' + JSON.stringify({result,screenshot,withLatex,sidebar:process.argv.includes('--sidebar')}) + ';\n' + await readFile('tests/suite-native-helper.js','utf8'));
  const {version} = JSON.parse(await readFile('manifest.json','utf8'));
  await copyFile(`../../outputs/latex-suite-${version}.xpi`, path.join(profile,'extensions','latex-suite@ievlevpn.github.io.xpi'));
  app = spawn('/usr/lib/zotero/zotero-bin', ['-app','/usr/lib/zotero/app/application.ini','--headless','--no-remote','--profile',profile,'-datadir','profile'], {stdio:'ignore',detached:true,env:{...process.env,MOZ_LEGACY_PROFILES:'1',MOZ_ALLOW_DOWNGRADE:'1'}});
  for (let i=0; i<120; i++) {
    let data; try { data=JSON.parse(await readFile(result,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; }
    if (data?.done) { console.log(JSON.stringify(data,null,2)); if(data.error) throw new Error(data.error); break; }
    if(i===119) throw new Error('Native test timed out');
    await pause(500);
  }
} finally {
  if(app && app.exitCode===null) {
    try { process.kill(-app.pid,'SIGTERM'); } catch {}
    await Promise.race([new Promise(r=>app.once('exit',r)),pause(2000)]);
    try { process.kill(-app.pid,'SIGKILL'); } catch {}
  }
  await rm(profile,{recursive:true,force:true});
}
