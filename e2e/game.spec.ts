import { expect, test, type Page } from '@playwright/test';

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
  await details.getByRole('button',{ name:'Start knowledge check' }).click();
  await details.getByRole('button',{ name:'Synthetic meaning 1',exact:true }).click();
  await expect(details.getByText('Correct. Knowledge check saved.')).toBeVisible();
  await page.goto('/quran/al-fatihah');
  await recall.getByRole('button',{ name:'Reveal meaning' }).click(); await recall.getByRole('button',{ name:'Again',exact:true }).click();
  await expect(recall.getByText('Recall saved. Your next reviews are scheduled.')).toBeVisible();
  await page.goto('/quests');
  await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-complete')).toHaveCount(3);
  await page.reload(); await expect(page.getByRole('region',{ name:'Today’s quests' }).locator('.quest-complete')).toHaveCount(3);
  await page.goto('/kingdom');
  const garden=page.locator('.structure-card').filter({ has:page.getByRole('heading',{ name:'Memory Garden',exact:true }) });
  await garden.getByRole('button',{ name:'Unlock your milestone' }).click(); await expect(garden.getByRole('button',{ name:'Built',exact:true })).toBeDisabled();
  const library=page.locator('.structure-card').filter({ has:page.getByRole('heading',{ name:'Library of Wisdom',exact:true }) });
  await expect(library.getByRole('button',{ name:'Keep growing' })).toBeDisabled();
  await page.getByRole('button',{ name:'Add pathway lanterns' }).click();
  await expect(page.getByRole('button',{ name:'In your kingdom' })).toBeDisabled();
  await page.reload(); await expect(page.getByRole('button',{ name:'In your kingdom' })).toBeDisabled();
  if(process.env.KALIMA_WORLD_CAPTURE === '1') await page.screenshot({ path:`test-results/kalima-kingdom-${info.project.name}.png`,fullPage:true });
  const scene=page.locator('.world-scene');
  await page.emulateMedia({ reducedMotion:'no-preference' });
  await scene.scrollIntoViewIfNeeded(); await expect(scene).toHaveAttribute('data-active','true');
  await expect(page.locator('.world-butterfly')).toHaveCSS('animation-name','world-drift');
  await page.locator('footer').scrollIntoViewIfNeeded(); await expect(scene).toHaveAttribute('data-active','false');
  await scene.scrollIntoViewIfNeeded(); await expect(scene).toHaveAttribute('data-active','true');
  await page.emulateMedia({ reducedMotion:'reduce' });
  await expect(page.locator('.world-butterfly')).toHaveCSS('animation-name','none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.goto('/progress'); await expect(page.getByRole('heading',{ name:'Reward history' })).toBeVisible();
  await expect(page.locator('.reward-history')).toContainText('Kingdom decoration');
  await page.goto('/account'); await page.getByRole('button',{ name:'Sign out',exact:true }).click();
  await page.goto('/garden'); await expect(page.getByRole('link',{ name:'Continue with Google',exact:true })).toBeVisible();
  await signIn(page,`world-other-${info.project.name}@example.test`);
  await page.goto('/'); await expect(page.getByRole('region',{ name:'Your growing kingdom' })).toContainText('0 Knowledge XP');
  await page.goto('/garden'); await expect(page.getByRole('heading',{ name:'A little space for your first word.' })).toBeVisible();
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
