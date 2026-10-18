import { chromium } from '@playwright/test';
import { readAuthEnvironment } from '../server/scripts/supabase-preflight.mjs';

// Frontend-only anonymous smoke against genuine prelive content. No Google
// session, database connection, screenshots, provider dumps, audio playback or writes.
class Failure extends Error {}
const check=(condition,message)=>{if(!condition)throw new Failure(message);};
const report={status:'blocked',environment:'prelive',auth:'anonymous-no-learning-writes',frontend:{}};
let api,vite,browser,pool,stage='configuration';
try {
  check(process.argv.includes('--confirm-prelive'),'Explicit --confirm-prelive is required.');
  const {backend}=await readAuthEnvironment();
  check((backend.QF_ENV??'prelive')==='prelive','Only Quran Foundation prelive is permitted.');
  check(backend.QF_CLIENT_ID&&backend.QF_CLIENT_SECRET&&backend.QF_TRANSLATION_ID,'Prelive credentials or translation resource are unavailable.');
  for(const [key,value] of Object.entries(backend))if(key.startsWith('QF_')&&value!==undefined)process.env[key]=value;
  process.env.LEARNING_DATABASE_URL='disabled-for-public-smoke';
  process.env.DB_HOST='127.0.0.1';process.env.DB_PORT='1';process.env.SUPABASE_URL='';
  process.env.CORS_ORIGINS='http://127.0.0.1:4177';
  const {createApp}=await import('../server/dist/app.js');
  ({pool}=await import('../server/dist/db.js'));
  pool.query=pool.connect=()=>{throw new Failure('Database access is forbidden in this public smoke.');};
  api=createApp().listen(0,'127.0.0.1');await new Promise((done,reject)=>{api.once('listening',done);api.once('error',reject);});
  process.env.VITE_API_URL=`http://127.0.0.1:${api.address().port}`;
  process.env.VITE_SUPABASE_URL='';process.env.VITE_SUPABASE_PUBLISHABLE_KEY='';
  const {createServer}=await import('vite');
  vite=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:4177,strictPort:true}});await vite.listen();
  browser=await chromium.launch({channel:'chrome'});
  for(const mobile of [false,true]){
    stage=mobile?'mobile-reader':'desktop-reader';
    const context=await browser.newContext({viewport:mobile?{width:393,height:851}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,serviceWorkers:'block'});
    const page=await context.newPage();let runtimeErrors=0;page.on('pageerror',()=>runtimeErrors++);
    const pending=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/quran/surahs/1');
    await page.goto('http://127.0.0.1:4177/quran/al-fatihah');const response=await pending,body=await response.json(),ready=body.data;
    check(response.status()===200&&ready?.status==='ready','Authentic prelive content is unavailable.');
    check(response.headers()['cache-control']==='no-store','The public content response lacks no-store.');
    check(ready.surah.verses.length===7&&ready.attribution.provider==='Quran Foundation','Seven genuine attributed ayahs are required.');
    await page.locator('.quran-ready-content').waitFor();
    for(const [i,verse] of ready.surah.verses.entries()){
      const ayah=page.locator('.quran-ayah').nth(i);
      check(await ayah.textContent()===verse.textUthmani&&await ayah.getAttribute('dir')==='rtl','Provider Arabic or RTL rendering differs.');
    }
    const words=ready.surah.verses.flatMap(v=>v.words),buttons=page.locator('.quran-word-button');
    check(await buttons.count()===words.length,'Selectable word count differs from the genuine response.');
    const index=words.findIndex(w=>w.translation?.trim());check(index>=0,'No genuine contextual meaning is available.');
    await buttons.nth(index).click();
    const panel=page.locator(mobile?'.quran-inline-word-panel':'.quran-detail-column');
    check(await panel.locator('.quran-word-heading h2').textContent()===words[index].textUthmani&&await panel.locator('.word-detail-block strong').textContent()===words[index].translation,'Selected word or contextual meaning differs from the actual response.');
    check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Public reader has horizontal overflow.');
    const html=await page.content();check([backend.QF_CLIENT_ID,backend.QF_CLIENT_SECRET].every(secret=>!html.includes(secret)),'A server-only credential reached page content.');
    check(runtimeErrors===0,'The rendered reader raised a runtime error.');
    report.frontend[mobile?'mobile':'desktop']={ayahs:7,words:words.length,contextualMeanings:words.filter(w=>w.translation?.trim()).length,exactArabicAndSelectedMeaning:true,noOverflow:true,runtimeErrors};
    await context.close();
  }
  report.status='passed';report.storage='no-provider-content-or-session-artifacts-saved';
}catch(error){report.status='failed';report.failedStage=stage;report.failure=error instanceof Failure?error.message:'Smoke failed; private provider/error details suppressed.';process.exitCode=1;}
finally{await browser?.close().catch(()=>{});await vite?.close().catch(()=>{});if(api)await new Promise(done=>api.close(done));await pool?.end().catch(()=>{});}
console.log(JSON.stringify(report,null,2));
