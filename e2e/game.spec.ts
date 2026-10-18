import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Opt-in visual evidence uses this hermetic host's SYNTHETIC accounts/content.
// Never run captures against hosted Google accounts or the live Quran provider.
async function captureScreen(page:Page,project:string,name:string) {
  const phase=process.env.KALIMA_WORLD_CAPTURE_PHASE;
  if(!phase || !['before','after'].includes(phase)) return;
  const directory=resolve('.local/world-visuals',phase,project);
  await mkdir(directory,{ recursive:true });
  await page.evaluate(async()=>{
    await document.fonts.ready;
    document.querySelector('[data-qa-watermark]')?.remove();
    const label=document.createElement('div');label.dataset.qaWatermark='true';label.textContent='SYNTHETIC QA · not live Quran or learner data';
    label.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:9999;text-align:center;background:#132f29;color:#fff;font:10px sans-serif;padding:5px;pointer-events:none';
    (document.querySelector('dialog[open]')??document.body).append(label);
  });
  const modal=page.locator('dialog[open]');
  if(await modal.count()){
    if(name==='garden-word')await modal.evaluate(node=>node.scrollTo(0,0));
    if(name==='knowledge-check')await modal.locator('.knowledge-check').scrollIntoViewIfNeeded();
  }
  await page.screenshot({path:resolve(directory,`${name}.png`),fullPage:!(await modal.count()),animations:'disabled'});
}
async function captureWorld(page: Page, project: string) {
  if(!process.env.KALIMA_WORLD_CAPTURE_PHASE)return;
  await page.setViewportSize(project==='mobile'?{width:393,height:851}:{width:1440,height:1000});
  for(const [name,path,ready] of [
    ['home','/','Your growing kingdom'],['quests','/quests','Today’s quests'],
    ['garden','/garden','Vocabulary plants'],['kingdom','/kingdom','A few finishing touches'],
    ['progress','/progress','Reward history'],['reviews','/reviews','Daily review inbox'],
    ['account','/account','Account'],['reading','/quran/al-fatihah','Al-Fatihah'],
  ]) {
    await page.goto(path);
    if(name==='kingdom' || name==='progress') await expect(page.getByRole('heading',{name:ready,exact:true})).toBeVisible();
    else if(name==='reading') await expect(page.locator('.quran-word-button').first()).toBeVisible();
    else await expect(page.getByRole('region',{name:ready,exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await captureScreen(page,project,name);
  }
}

// SYNTHETIC identities/content only, real disposable PostgreSQL and normal JWT verification.
async function signIn(page: Page, email: string) {
  await page.goto('/account'); await page.getByText('Use an email code instead',{ exact:true }).click();
  await page.getByLabel('Email address').fill(email); await page.getByRole('button',{ name:'Send sign-in code',exact:true }).click();
  await page.getByLabel('Sign-in code',{ exact:true }).fill('123456'); await page.getByRole('button',{ name:'Verify code',exact:true }).click();
  await expect(page.getByRole('heading',{ name:'You’re signed in' })).toBeVisible();
}

test('quests, garden, server checks, kingdom and rewards form a persistent user-isolated journey',async ({ page,isMobile },info)=>{
  await signIn(page,`world-${info.project.name}@example.test`);
  await page.goto('/');
  await expect(page.getByRole('region',{ name:'Your growing kingdom' })).toContainText('0 Knowledge XP');
  await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-card')).toHaveCount(3);
  await page.goto('/garden'); await expect(page.getByRole('heading',{ name:'A little space for your first word.' })).toBeVisible();
  await page.goto('/quran/al-fatihah'); await page.getByRole('button',{ name:'Start saved recall' }).click();
  const recall=page.getByRole('region',{ name:'Saved meaning recall' });
  await recall.getByRole('button',{ name:'Reveal meaning' }).click();
  // Commit normally, then simulate lost acknowledgement. The same attempt must be retried.
  let loseOnce=true; const submissions:string[]=[];
  await page.route('**/api/learning/attempts',async route=>{
    submissions.push(route.request().postDataJSON().clientAttemptId);
    const result=await route.fetch();
    if(loseOnce){ loseOnce=false; await route.abort('failed'); } else await route.fulfill({ response:result });
  });
  await recall.getByRole('button',{ name:'Easy',exact:true }).click();
  await expect(recall.getByRole('button',{ name:'Retry saving' })).toBeVisible();
  await expect(recall.locator('.growth-ack')).toHaveCount(0);
  await recall.getByRole('button',{ name:'Retry saving' }).click();
  await expect(recall.getByText('Recall saved.',{ exact:true })).toBeVisible();
  expect(submissions).toHaveLength(2); expect(submissions[0]).toBe(submissions[1]);
  await page.unroute('**/api/learning/attempts');
  await expect(recall.getByText(/A little growth: \+\d+ Knowledge XP/)).toBeVisible();
  await page.goto('/garden');
  const plot=page.getByRole('button').filter({ hasText:'Quran 1:1 · Word 1' });
  await expect(plot).toContainText('Sprout'); await plot.focus(); await plot.press('Enter');
  await expect(plot).toHaveAttribute('aria-pressed','true');
  const details=page.getByRole('complementary',{ name:'Garden word details' });
  if(isMobile) await details.scrollIntoViewIfNeeded();
  await expect(details.locator('[lang="ar"]').first()).toHaveAttribute('dir','rtl');
  await expect(details.getByText('Synthetic meaning 1',{ exact:true })).toBeVisible();
  await expect(details.locator('audio')).toHaveAttribute('preload','none');
  await expect(page.getByRole('button',{name:'Close word details',exact:true})).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const sheetBox=await page.getByRole('dialog',{name:'Your growing word'}).boundingBox();
  expect(sheetBox!.x).toBeGreaterThanOrEqual(0);expect(sheetBox!.x+sheetBox!.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  await captureScreen(page,info.project.name,'garden-word');
  for(let i=0;i<5;i++){await page.keyboard.press('Tab');expect(await page.evaluate(()=>document.querySelector('dialog')?.contains(document.activeElement))).toBe(true);}
  await details.getByRole('button',{ name:'Start knowledge check' }).click();
  await captureScreen(page,info.project.name,'knowledge-check');
  await details.getByRole('button',{ name:'Synthetic meaning 1',exact:true }).click();
  await expect(details.getByText('Correct. Knowledge check saved.')).toBeVisible();
  await page.goto('/quran/al-fatihah');
  await recall.getByRole('button',{ name:'Reveal meaning' }).click(); await recall.getByRole('button',{ name:'Again',exact:true }).click();
  await expect(recall.getByText('Recall saved. Your next reviews are scheduled.')).toBeVisible();
  await page.goto('/quests');
  await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-complete')).toHaveCount(3);
  await page.reload(); await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-complete')).toHaveCount(3);
  await page.goto('/kingdom');
  const garden=page.getByRole('button',{name:'Memory Garden — Ready to unlock',exact:true});
  await garden.focus();await garden.press('Enter');
  const sheet=page.getByRole('dialog',{name:'Memory Garden',exact:true});
  await expect(sheet).toBeVisible();
  await page.route('**/api/learning/game/kingdom/garden/unlock',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'SYNTHETIC_UNAVAILABLE',message:'SYNTHETIC unlock not committed'}})}));
  await sheet.getByRole('button',{ name:'Unlock your milestone' }).click();
  await expect(sheet.getByRole('alert')).toContainText('SYNTHETIC unlock not committed');
  await expect(page.locator('.just-constructed')).toHaveCount(0);
  await expect(sheet.getByRole('button',{name:'Built',exact:true})).toHaveCount(0);
  await page.unroute('**/api/learning/game/kingdom/garden/unlock');
  await sheet.getByRole('button',{ name:'Unlock your milestone' }).click();
  await expect(sheet.getByRole('button',{ name:'Built',exact:true })).toBeDisabled();
  await captureScreen(page,info.project.name,'kingdom-built');
  await sheet.getByRole('button',{name:'Close details',exact:true}).click();
  const library=page.getByRole('button',{name:'Library of Wisdom — Locked',exact:true});
  await library.click();
  await expect(page.getByRole('dialog',{name:'Library of Wisdom'}).getByRole('button',{name:'Keep growing',exact:true})).toBeDisabled();
  await captureScreen(page,info.project.name,'kingdom-locked');
  await page.keyboard.press('Escape');await expect(library).toBeFocused();
  const hotspotSizes=await page.locator('.building-hotspot').evaluateAll(buttons=>buttons.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));
  expect(hotspotSizes).toHaveLength(5);hotspotSizes.forEach(s=>{expect(s.w).toBeGreaterThanOrEqual(44);expect(s.h).toBeGreaterThanOrEqual(44);});
  await page.getByRole('button',{ name:'Add pathway lanterns' }).click();
  await expect(page.getByRole('button',{ name:'In your kingdom' })).toBeDisabled();
  await page.reload(); await expect(page.getByRole('button',{ name:'In your kingdom' })).toBeDisabled();
  if(process.env.KALIMA_WORLD_CAPTURE === '1') await page.screenshot({ path:`test-results/kalima-kingdom-${info.project.name}.png`,fullPage:true });
  const scene=page.locator('.world-scene');
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await scene.scrollIntoViewIfNeeded(); await expect(scene).toHaveAttribute('data-active','true');
  await expect(page.locator('.world-butterfly')).toHaveCSS('animation-name','world-drift');
  // The redesigned page is much shorter: a tall desktop viewport can still
  // intersect the scene at the document end. Test genuine offscreen geometry.
  const originalViewport=page.viewportSize()!;
  await page.setViewportSize({...originalViewport,height:400});
  await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}));
  await expect.poll(()=>scene.evaluate(node=>node.getBoundingClientRect().bottom<=0)).toBe(true);
  await expect(scene).toHaveAttribute('data-active','false');
  await page.setViewportSize(originalViewport);
  await scene.scrollIntoViewIfNeeded(); await expect(scene).toHaveAttribute('data-active','true');
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect(page.locator('.world-butterfly')).toHaveCSS('animation-name','none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.goto('/progress'); await expect(page.getByRole('heading',{ name:'Reward history' })).toBeVisible();
  await expect(page.locator('.reward-history')).toContainText('Kingdom decoration');
  await captureWorld(page,info.project.name);
  await page.goto('/account'); await page.getByRole('button',{ name:'Sign out',exact:true }).click();
  await expect(page.getByRole('button',{name:'Continue with Google',exact:true})).toBeVisible();
  await captureScreen(page,info.project.name,'sign-in');
  await page.goto('/garden'); await expect(page.getByRole('link',{ name:'Continue with Google',exact:true })).toBeVisible();
  await signIn(page,`world-other-${info.project.name}@example.test`);
  await page.goto('/'); await expect(page.getByRole('region',{ name:'Your growing kingdom' })).toContainText('0 Knowledge XP');
  await page.goto('/garden'); await expect(page.getByRole('heading',{ name:'A little space for your first word.' })).toBeVisible();
  await captureScreen(page,info.project.name,'garden-empty');
  if(process.env.KALIMA_WORLD_CAPTURE_PHASE){await page.goto('/kingdom');await expect(page.locator('.building-hotspot')).toHaveCount(5);await captureScreen(page,info.project.name,'kingdom-empty');await page.goto('/');await expect(page.getByRole('region',{name:'Your growing kingdom'})).toBeVisible();await captureScreen(page,info.project.name,'home-empty');}
  await page.goto('/progress'); await expect(page.locator('.reward-history')).toContainText('Your first earned reward will appear here.');
});

test('private world gates, retryable errors and empty filters never block public Quran reading',async ({ page },info)=>{
  for(const route of ['/garden','kingdom','quests','progress']){
    await page.goto(route.startsWith('/')?route:`/${route}`); await expect(page.getByRole('heading',{ name:'A world worth returning to.' })).toBeVisible();
  }
  await page.getByRole('link',{ name:'Read without signing in' }).click(); await expect(page.locator('.quran-word-button')).toHaveCount(3);
  await signIn(page,`world-errors-${info.project.name}@example.test`);
  await page.route('**/api/learning/game/overview',route=>route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({success:false,error:{code:'SYNTHETIC_ERROR',message:'SYNTHETIC temporary world error'}}) }));
  await page.goto('/quests'); await expect(page.getByRole('alert')).toContainText('Your world couldn’t be loaded.');
  await page.unroute('**/api/learning/game/overview'); await page.getByRole('button',{ name:'Try again',exact:true }).click();
  await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-card')).toHaveCount(3);
  const questTargets=await page.locator('.quest-bottom a').evaluateAll(links=>links.map(link=>link.getBoundingClientRect().height));
  expect(questTargets.length).toBeGreaterThanOrEqual(3);
  questTargets.forEach(height=>expect(height).toBeGreaterThanOrEqual(44));
  await page.goto('/garden'); await page.getByRole('combobox',{ name:'Growth stage' }).selectOption('5');
  await expect(page.getByRole('heading',{ name:'No plants at this stage yet.' })).toBeVisible();
  await page.goto('/quran/al-fatihah'); await expect(page.locator('.quran-word-button')).toHaveCount(3);
});

test('illustrated garden stays bounded, paginates and pauses its ambient layer',async ({page},info)=>{
  await signIn(page,`world-botanical-${info.project.name}@example.test`);
  // Explicitly SYNTHETIC visual branch fixture. No live profile/progress edits.
  const ids=Array.from({length:26},()=>crypto.randomUUID()),serverNow=new Date().toISOString();
  await page.route('**/api/learning/game/garden?*',route=>{
    const params=new URL(route.request().url()).searchParams,stage=params.get('stage'),cursor=params.get('cursor');
    const all=ids.map((vocabularyId,i)=>({vocabularyId,surah:1,ayah:1,word:i%2+1,stage:i%5+1,dueAt:new Date(Date.parse(serverNow)+(i%3?86_400_000:-1000)).toISOString(),reviews:i+1,lastRating:'good',health:i%3?'resting':'fading',masteryVersion:'SYNTHETIC_VISUAL_ONLY'}));
    const items=(stage?all.filter(p=>p.stage===Number(stage)):all).slice(cursor?24:0,cursor?26:24);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,data:{items,nextCursor:!stage&&!cursor?ids[23]:null,serverNow}})});
  });
  await page.goto('/garden');await expect(page.locator('.garden-plots .garden-plot')).toHaveCount(24);
  for(let stage=1;stage<=5;stage++)expect(await page.locator(`.garden-plots .plant-stage-${stage}`).count()).toBeGreaterThan(0);
  const scene=page.locator('.garden-place');await scene.scrollIntoViewIfNeeded();await expect(scene).toHaveAttribute('data-active','true');
  await expect(scene.locator('.plant-leaves').first()).toHaveCSS('animation-play-state','running');
  // Simulated browser visibility event, not a claim about a physical phone tab.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect(scene).toHaveAttribute('data-active','false');await expect(scene.locator('.plant-leaves').first()).toHaveCSS('animation-play-state','paused');
  await page.evaluate(()=>{Reflect.deleteProperty(document,'hidden');document.dispatchEvent(new Event('visibilitychange'));});
  await expect(scene).toHaveAttribute('data-active','true');
  await page.emulateMedia({reducedMotion:'reduce'});await expect(scene.locator('.plant-leaves').first()).toHaveCSS('animation-name','none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await captureScreen(page,info.project.name,'garden-stages');
  await page.getByRole('button',{name:'Explore more plants',exact:true}).click();await expect(page.locator('.garden-plot')).toHaveCount(2);
  await page.getByRole('button',{name:'Previous plants',exact:true}).click();await expect(page.locator('.garden-plot')).toHaveCount(24);
  await page.getByRole('combobox',{name:'Growth stage'}).selectOption('5');await expect(page.locator('.garden-plots .plant-stage-5')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Explore more plants',exact:true})).toHaveCount(0);
  // All-built art branch ONLY; no milestone, reward or history is inserted.
  await page.route('**/api/learning/game/overview',async route=>{
    const response=await route.fetch(),body=await response.json();
    body.data.structures=body.data.structures.map((s:Record<string,unknown>)=>({...s,eligible:true,unlockedAt:serverNow}));
    body.data.cosmetics=body.data.cosmetics.map((c:Record<string,unknown>)=>({...c,owned:true}));
    return route.fulfill({response,json:body});
  });
  await page.goto('/kingdom');await expect(page.locator('.building-hotspot.built')).toHaveCount(5);
  await expect(page.locator('.scene-decorations')).toHaveCount(2);
  await captureScreen(page,info.project.name,'kingdom-established');
});

test('light world preserves navigation, readable paper text and empty-state artwork',async ({page},info)=>{
  await signIn(page,`world-light-${info.project.name}@example.test`);await page.goto('/');
  await expect(page.getByRole('region',{name:'Today’s quests'}).locator('.quest-card')).toHaveCount(3);
  const selectors='.quest-card > p,.quest-top > span:first-child,.quest-numbers,.home-welcome > p:not(.eyebrow),.home-due-note,.home-player-strip > div:not(.level-emblem) > span';
  const paperContrast=()=>page.locator(selectors).evaluateAll(nodes=>{
    const rgba=(value:string)=>value.match(/[\d.]+/g)!.map(Number);
    const luminance=(rgb:number[])=>{const c=rgb.slice(0,3).map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
    return nodes.map(node=>{let parent:Element|null=node,bg=[0,0,0,0];while(parent){bg=rgba(getComputedStyle(parent).backgroundColor);if(bg.length===3||bg[3]===1)break;parent=parent.parentElement;}const [a,b]=[luminance(rgba(getComputedStyle(node).color)),luminance(bg)].sort((x,y)=>x-y);return (b+.05)/(a+.05);});
  });
  for(const ratio of await paperContrast())expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button',{name:'Switch to light mode'}).click();await expect(page.locator('html')).not.toHaveClass(/dark/);
  for(const ratio of await paperContrast())expect(ratio).toBeGreaterThanOrEqual(4.5);
  await captureScreen(page,info.project.name,'home-light');
  await page.goto('/kingdom');await expect(page.locator('.building-hotspot')).toHaveCount(5);await captureScreen(page,info.project.name,'kingdom-light');
  await page.goto('/garden');await expect(page.getByRole('heading',{name:'A little space for your first word.'})).toBeVisible();await captureScreen(page,info.project.name,'garden-light');
  await page.getByRole('button',{name:'Switch to dark mode'}).click();await expect(page.locator('html')).toHaveClass(/dark/);
});
