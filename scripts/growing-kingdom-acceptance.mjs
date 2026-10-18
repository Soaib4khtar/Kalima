import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';

const plain = value => JSON.parse(JSON.stringify(value));
const same = (a,b) => isDeepStrictEqual(plain(a),plain(b));

/** Explicit interrupted-run recovery: SELECT existing owner-bound activity only.
 * Never turns reconstructed metadata into a claimed new browser interaction.
 */
export async function loadSavedGameAcceptance(pool, userId) {
  const review=(await pool.query(`SELECT a.* FROM learning.review_attempts a
    JOIN learning.review_sessions s ON s.id=a.session_id AND s.user_id=a.user_id
    JOIN learning.game_events e ON e.review_id=a.id AND e.user_id=a.user_id
    JOIN learning.bookmarks b ON b.user_id=a.user_id AND b.vocabulary_id=a.vocabulary_id
    WHERE a.user_id=$1 AND s.kind='daily' AND e.kind='review'
    ORDER BY a.reviewed_at DESC,a.id DESC LIMIT 1`,[userId])).rows[0];
  const challenge=(await pool.query(`SELECT c.* FROM learning.knowledge_challenges c
    JOIN learning.game_events e ON e.id=c.id AND e.user_id=c.user_id
    WHERE c.user_id=$1 AND e.kind='challenge' AND c.completed_at IS NOT NULL
      AND c.result->>'correct'='true' AND c.submitted_choice=c.correct_choice
    ORDER BY c.completed_at DESC,c.id DESC LIMIT 1`,[userId])).rows[0];
  if(!review || !challenge) return null;
  return {
    bookmark:{ vocabularyId:review.vocabulary_id },
    review:{ input:{ clientAttemptId:review.client_attempt_id,sessionId:review.session_id,
      vocabularyId:review.vocabulary_id,rating:review.rating,expectedRevision:review.expected_revision },saved:review.result },
    answer:{ id:challenge.id,choiceId:challenge.submitted_choice,saved:challenge.result },
  };
}

/** Development acceptance ONLY. Real verifier, real clock, normal APIs only.
 * No generated ratings/answers, migrations, token files or content snapshots.
 */
export async function runGameAcceptance({ monitor, pool, apiOrigin, report, check, setStage, resumePrimary = false }) {
  const confirmations = new Set(), lines = createInterface({ input: process.stdin });
  const allowed = new Set(['primary-recovered','accounts-recovered','finish-ui']);
  lines.on('line', line => { if (allowed.has(line.trim())) confirmations.add(line.trim()); });
  async function wait(predicate, failure) {
    const until = Date.now()+1_800_000;
    while (!predicate()) { check(Date.now()<until,failure); await new Promise(done=>setTimeout(done,250)); }
  }
  async function request(user,path,method='GET',body) {
    const response=await fetch(`${apiOrigin}/api/learning${path}`,{ method, headers:{ Authorization:`Bearer ${user.token}`,'Content-Type':'application/json' },
      ...(body===undefined?{}:{ body:JSON.stringify(body) }), signal:AbortSignal.timeout(45_000) });
    return { status:response.status, body:await response.json() };
  }
  async function data(user,path) { const r=await request(user,path); check(r.status===200,'A protected game read failed.'); return r.body.data; }
  async function pages(user,path) {
    const items=[]; let cursor;
    for(let i=0;i<50;i++) { const page=await data(user,path+(cursor?`?cursor=${cursor}`:'')); items.push(...page.items); cursor=page.nextCursor; if(!cursor)return items; }
    check(false,'Acceptance pagination bound exceeded; no partial isolation claim is permitted.');
  }
  const preservedTables={ review_attempts:'id',reward_ledger:'id',bookmarks:'user_id,vocabulary_id',kingdom_structures:'user_id,structure_key',kingdom_cosmetics:'user_id,cosmetic_key' };
  const initial={};
  for(const table of Object.keys(preservedTables)) initial[table]=(await pool.query(`SELECT to_jsonb(t) AS row FROM learning.${table} t ORDER BY to_jsonb(t)::text`)).rows.map(r=>r.row);
  async function preserve() {
    for(const [table,keys] of Object.entries(preservedTables)) {
      const current=(await pool.query(`SELECT to_jsonb(t) AS row FROM learning.${table} t`)).rows.map(r=>r.row);
      for(const before of initial[table]) check(current.some(after=>keys.split(',').every(key=>after[key]===before[key]) && same(before,after)),'Pre-existing learning, reward or ownership records changed.');
    }
  }
  let source;
  async function publicReading() {
    const response=await fetch(`${apiOrigin}/api/quran/surahs/1`,{ signal:AbortSignal.timeout(45_000) });
    const body=await response.json();
    check(response.status===200 && body.data?.status==='ready' && body.data.surah.verses.length===7,'Authentic public seven-ayah Al-Fatihah is unavailable.');
    source=body.data; // In memory only; never log or write canonical content.
    check((await fetch(`${apiOrigin}/api/learning/game/overview`)).status===401,'Anonymous game access was accepted.');
  }
  async function state(user) {
    const overview=await data(user,'/game/overview');
    const wallet=(await pool.query(`SELECT a.xp,a.tokens,COALESCE(sum(l.xp_delta),0)::int AS ledger_xp,
      COALESCE(sum(l.token_delta),0)::int AS ledger_tokens FROM learning.game_accounts a LEFT JOIN learning.reward_ledger l ON l.user_id=a.user_id
      WHERE a.user_id=$1 GROUP BY a.user_id`,[user.id])).rows[0];
    check(wallet && wallet.xp===wallet.ledger_xp && wallet.tokens===wallet.ledger_tokens && wallet.tokens>=0 && overview.xp===wallet.xp && overview.tokens===wallet.tokens,'Wallet and append-only ledger disagree.');
    const garden=await pages(user,'/game/garden');
    const ownPlants=(await pool.query('SELECT vocabulary_id,highest_stage FROM learning.game_plants WHERE user_id=$1 ORDER BY vocabulary_id',[user.id])).rows;
    check(same(garden.map(p=>[p.vocabularyId,p.stage]).sort(),ownPlants.map(p=>[p.vocabulary_id,p.highest_stage]).sort()),'Garden data does not match the authenticated owner.');
    const ledger=await pages(user,'/game/ledger');
    const ledgerIds=(await pool.query('SELECT id FROM learning.reward_ledger WHERE user_id=$1 ORDER BY created_at DESC,id DESC',[user.id])).rows.map(r=>r.id);
    check(same(ledger.map(r=>r.id),ledgerIds),'Reward history contains missing or foreign entries.');
    const ownMissions=(await pool.query('SELECT id FROM learning.game_missions WHERE user_id=$1',[user.id])).rows.map(r=>r.id);
    check(overview.missions.every(m=>ownMissions.includes(m.id)),'Foreign quests appeared in the overview.');
    check(overview.missions.filter(m=>m.period==='daily').length===3,'Three personalized daily quests were not available.');
    for(const m of overview.missions) {
      const steps=(await pool.query('SELECT count(*)::int AS n FROM learning.game_mission_steps WHERE user_id=$1 AND mission_id=$2',[user.id,m.id])).rows[0].n;
      check(m.progress===steps && steps<=m.target,'Mission progress disagrees with its distinct event attribution.');
      if(m.completedAt) check(ledger.some(r=>r.source===`quest:${m.id}`),'A completed mission has no automatic reward ledger identity.');
    }
    const ownedStructures=(await pool.query('SELECT structure_key FROM learning.kingdom_structures WHERE user_id=$1',[user.id])).rows.map(r=>r.structure_key);
    check(same(overview.structures.filter(s=>s.unlockedAt).map(s=>s.key).sort(),ownedStructures.sort()),'Foreign or unpersisted structures appeared.');
    const ownedCosmetics=(await pool.query('SELECT cosmetic_key FROM learning.kingdom_cosmetics WHERE user_id=$1',[user.id])).rows.map(r=>r.cosmetic_key);
    check(same(overview.cosmetics.filter(c=>c.owned).map(c=>c.key).sort(),ownedCosmetics.sort()),'Decoration state disagrees with ownership.');
    return { overview,garden,ledger };
  }
  const scheduler=await import('../server/dist/modules/learning/learning.scheduler.js');
  async function auditReview(user,observed) {
    const { input,saved }=observed;
    const event=(await pool.query('SELECT * FROM learning.review_attempts WHERE user_id=$1 AND id=$2',[user.id,saved.attemptId])).rows[0];
    check(event && event.rating===input.rating && same(event.result,saved),'The real learner-selected review did not persist correctly.');
    const expected=scheduler.scheduleCard(scheduler.restoreCard(event.memory_before),event.rating,event.reviewed_at);
    check(same(scheduler.serializeCard(expected.card),event.memory_after) && same(scheduler.serializeLog(expected.log),event.scheduler_log) && expected.card.due.toISOString()===saved.dueAt,'The stored genuine FSRS event or due instant is incorrect.');
    const game=(await pool.query('SELECT * FROM learning.game_events WHERE user_id=$1 AND id=$2',[user.id,saved.attemptId])).rows[0];
    check(game?.review_id===event.id && game.occurred_at.getTime()===event.reviewed_at.getTime(),'Committed learning and game attribution do not match.');
    const delta=(await pool.query(`SELECT COALESCE(sum(xp_delta),0)::int AS xp,COALESCE(sum(token_delta),0)::int AS tokens
      FROM learning.reward_ledger WHERE user_id=$1 AND source_event_id=$2 AND created_at=$3`,[user.id,event.id,event.reviewed_at])).rows[0];
    check(same(delta,saved.gamification),'The committed review reward delta disagrees with its transaction ledger.');
    const progress=(await data(user,'/progress')).totalReviews, before=await state(user);
    const duplicate=await Promise.all([request(user,'/attempts','POST',input),request(user,'/attempts','POST',input)]);
    check(duplicate.every(r=>r.status===200 && same(r.body.data,saved)),'A committed review retry was not immutable.');
    check((await request(user,'/attempts','POST',{ ...input,clientAttemptId:randomUUID() })).status===409,'A stale review submission was accepted.');
    check((await request(user,'/attempts','POST',{ ...input,xp:99999,tokens:99999 })).status===400,'Forged review currency was accepted.');
    check((await data(user,'/progress')).totalReviews===progress && same((await state(user)).ledger,before.ledger),'Retries or rejected writes changed review/reward history.');
    check((await data(user,'/history')).items.some(r=>r.id===saved.attemptId),'The genuine review is missing from learning history.');
    check(before.garden.some(p=>p.vocabularyId===input.vocabularyId),'The genuinely learned occurrence has no garden plant.');
    return { rating:input.rating,xp:delta.xp,tokens:delta.tokens };
  }
  async function rejectedMutations(user,foreignId) {
    const before=await state(user);
    for(const path of ['/game/kingdom/garden/unlock','/game/cosmetics/lanterns']) {
      check((await request(user,path,'POST',{ xp:99999,tokens:99999,userId:foreignId??randomUUID() })).status===400,'Forged game state or owner was accepted.');
    }
    check((await request(user,'/game/wallet','PATCH',{ xp:99999,tokens:99999 })).status===404,'A direct wallet mutation route exists.');
    check((await request(user,`/game/garden?userId=${foreignId??randomUUID()}`)).status===400,'A client-selected garden owner was accepted.');
    const locked=before.overview.structures.find(s=>!s.eligible && !s.unlockedAt);
    if(locked) check((await request(user,`/game/kingdom/${locked.key}/unlock`,'POST',{})).status===409,'An unearned structure was unlocked.');
    const after=await state(user);
    check(same(after.ledger,before.ledger) && same(after.overview.structures,before.overview.structures),'Rejected mutations changed rewards or kingdom state.');
  }
  async function auditChallenge(user,observed,fromSavedRecord=false) {
    const c=(await pool.query('SELECT * FROM learning.knowledge_challenges WHERE user_id=$1 AND id=$2',[user.id,observed.id])).rows[0];
    const issued=user.challengeIssues.find(item=>item.id===observed.id);
    check(c && (fromSavedRecord || issued?.sourceAttributed) && c.submitted_choice===observed.choiceId && c.result.correct===true && same(c.result,observed.saved),'A genuine correct source-attributed challenge was not observed.');
    const correct=c.choices.find(choice=>choice.id===c.correct_choice);
    const occurrence=(await pool.query('SELECT surah,ayah,word FROM learning.vocabulary_items WHERE id=$1',[c.vocabulary_id])).rows[0];
    check(correct && correct.surah===occurrence.surah && correct.ayah===occurrence.ayah && correct.word===occurrence.word,'The hidden source answer does not map to the learned occurrence.');
    const sourceWords=source.surah.verses.flatMap(v=>v.words.map(w=>({ ...w,ayah:v.number })));
    check(c.choices.every(choice=>sourceWords.some(w=>w.ayah===choice.ayah && w.position===choice.word && w.sourceId===choice.sourceId && w.translation?.trim())),'A challenge alternative lacks genuine available source content.');
    const fingerprint=createHash('sha256').update(JSON.stringify(c.choices.map(choice=>{
      const w=sourceWords.find(w=>choice.surah===1 && w.ayah===choice.ayah && w.position===choice.word && w.sourceId===choice.sourceId);
      return w ? [w.sourceId,w.textUthmani,w.translation,source.attribution] : null;
    }))).digest('hex');
    check(source.attribution.provider==='Quran Foundation' && fingerprint===c.content_hash,'The saved challenge source fingerprint does not match the current genuine provider response.');
    const before=await state(user);
    const replay=await Promise.all([1,2].map(()=>request(user,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:observed.choiceId })));
    check(replay.every(r=>r.status===200 && same(r.body.data,observed.saved)),'Exact challenge replay was not immutable.');
    const other=c.choices.find(choice=>choice.id!==observed.choiceId);
    check((await request(user,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:other.id })).status===409,'A consumed challenge accepted a different answer.');
    check((await request(user,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:observed.choiceId,correct:true,xp:99999 })).status===400,'Client correctness/currency was accepted.');
    check(same((await state(user)).ledger,before.ledger),'Challenge replay minted currency.');
    return c;
  }
  async function authenticBookmark(user,saved=user.bookmarks.at(-1)) {
    const found=(await data(user,'/bookmarks')).items.find(b=>b.vocabularyId===saved.vocabularyId);
    check(found?.sources?.some(s=>s.environment==='prelive'),'A genuine prelive bookmark source is missing.');
    const word=source.surah.verses.find(v=>v.number===found.ayah)?.words.find(w=>w.position===found.word);
    check(word && found.sources.some(s=>s.wordId===String(word.sourceId)),'Bookmark source coordinates/identifiers do not match live content.');
    const before=await state(user);
    for(let i=0;i<2;i++) check((await request(user,'/bookmarks','POST',{ surah:found.surah,ayah:found.ayah,word:found.word })).status===200,'An idempotent saved bookmark request failed.');
    check(same((await state(user)).ledger,before.ledger),'Re-saving a bookmark generated game rewards.');
  }
  let armed;
  monitor.setMutationObserver((user,path)=>{
    if(!armed || armed.user!==user.id || armed.path!==path || armed.started) return;
    armed.started=true;
    // Mirrors only the learner's already-authorized affordable click, alongside
    // the original request. Normal JWT, rate and transaction checks still apply.
    armed.retries=Promise.all([1,2].map(()=>request(user,path.replace('/api/learning',''),'POST',{}))).catch(()=>[]);
  });
  try {
    check((await pool.query('SELECT max(version)::int AS version FROM learning.schema_migrations')).rows[0].version===3,'Expected existing game schema version 3; no migrations were run.');
    await publicReading(); report.publicReading='genuine-seven-ayahs-anonymous';
    report.browserMode='regular-Chrome-private-user-controlled';
    report.refresh='not-repeated-prior-live-acceptance';
    setStage('game-primary-private-login');
    console.log('PRIMARY LOGIN READY: sign in privately in REGULAR Chrome at http://localhost:5173/account, then open Home. Do not purchase a decoration yet.');
    await wait(()=>monitor.users.size>0,'No genuine Google learner reached the normal backend.');
    const primary=[...monitor.users.values()][0];
    report.hostedLogin='genuine-Google-OAuth'; report.jwt='normal-Supabase-signature-and-claims-verified';
    await wait(()=>primary.gameViews.has('/api/learning/game/overview'),'The real primary homepage was not opened.');
    const primaryBaseline=await state(primary);
    console.log(JSON.stringify({ primaryBaseline:{ xp:primaryBaseline.overview.xp,tokens:primaryBaseline.overview.tokens,plants:primaryBaseline.garden.length,dailyQuests:3 } }));
    let primaryAnswer;
    if(resumePrimary) {
      setStage('game-primary-saved-activity-reconciliation');
      const saved=await loadSavedGameAcceptance(pool,primary.id);
      check(saved,'The signed-in primary has no saved real game review/bookmark and correct challenge to resume. No activity was generated.');
      await authenticBookmark(primary,saved.bookmark); report.primaryReview=await auditReview(primary,saved.review);
      primaryAnswer=saved.answer;
      await auditChallenge(primary,primaryAnswer,true);
      report.primaryActivity='read-only-reconciliation-of-existing-owner-bound-learning-after-checker-interruption';
      console.log('PRIMARY SAVED ACTIVITY VERIFIED: existing real bookmark, FSRS review, source-backed correct check and immutable reward/replay audits passed. No new rating or answer is needed.');
    } else {
      console.log('PRIMARY LEARNING: bookmark a genuine unreviewed Al-Fatihah word, open Reviews, and complete one honest due/new-word rating. Then open Garden, choose that word, and complete an honest knowledge check. Do not purchase a decoration yet.');
      setStage('game-primary-real-learning');
      await wait(()=>primary.bookmarks.length>0 && primary.reviews.length>0,'No genuine bookmark and learner-selected review were observed.');
      await authenticBookmark(primary); report.primaryReview=await auditReview(primary,primary.reviews[0]);
      await wait(()=>primary.challengeAnswers.some(a=>a.saved.correct),'A correct genuine primary knowledge check has not succeeded.');
      primaryAnswer=primary.challengeAnswers.find(a=>a.saved.correct);
      await auditChallenge(primary,primaryAnswer);
      report.primaryActivity='browser-observed-real-learning-during-this-run';
    }
    await rejectedMutations(primary);
    let primaryState=await state(primary);
    check(primaryState.overview.missions.some(m=>m.completedAt) && primaryState.ledger.some(r=>r.source.startsWith('quest:') && r.tokens>0),'No legitimately earned quest/Build Token reward is available.');
    const affordable=primaryState.overview.cosmetics.find(c=>!c.owned && c.cost<=primaryState.overview.tokens);
    if(affordable) {
      armed={ user:primary.id,path:`/api/learning/game/cosmetics/${affordable.key}`,started:false };
      console.log(`DECORATION READY: ${primaryState.overview.tokens} naturally earned Build Tokens available. In My Kingdom activate the earned Memory Garden if needed, then buy ${affordable.title} (${affordable.cost} tokens) ONCE. The checker safely retries that same authorized click concurrently.`);
      setStage('game-primary-affordable-cosmetic');
      await wait(()=>primary.cosmetics.some(c=>c.key===affordable.key),'The affordable optional decoration was not purchased.');
      const race=armed.started ? await armed.retries : [];
      check(race.length===2 && race.every(r=>r.status===200),'The original authorized purchase and concurrent retries did not all succeed idempotently.');
      const spends=(await pool.query('SELECT token_delta FROM learning.reward_ledger WHERE user_id=$1 AND source_key=$2',[primary.id,`cosmetic:${affordable.key}`])).rows;
      check(spends.length===1 && spends[0].token_delta===-affordable.cost,'Concurrent purchase charged tokens more than once.');
      report.decoration={ status:'genuine-affordable-click-plus-concurrent-first-purchase-retries',cost:affordable.cost };
      armed=undefined;
    } else report.decoration={ status:'no-affordable-unowned-decoration-no-tokens-invented' };
    primaryState=await state(primary);
    const primarySessions=primary.sessions.size;
    console.log(JSON.stringify({ primarySaved:{ xp:primaryState.overview.xp,tokens:primaryState.overview.tokens,plants:primaryState.garden.length,rewardEvents:primaryState.ledger.length } }));
    console.log('PRIMARY RECOVERY: inspect Home, Quests, Garden, Kingdom and Progress; reload and confirm balances/decorations/history. Sign out, privately sign back into the SAME primary Google account, and confirm recovery. Keep it signed in. Confirmation: primary-recovered.');
    setStage('game-primary-relogin-recovery');
    await wait(()=>confirmations.has('primary-recovered') && primary.sessions.size>primarySessions,'Fresh primary sign-in and UI recovery are not both verified.');
    const primaryRecovered=await state(primary);
    check(same(primaryRecovered.ledger,primaryState.ledger) && same(primaryRecovered.overview.cosmetics,primaryState.overview.cosmetics),'Primary rewards/decorations did not recover across fresh sign-in.');
    console.log('SECOND LOGIN READY: keep primary in REGULAR Chrome. Open INCOGNITO at http://localhost:5173/account and sign in privately with the DIFFERENT approved Google account. Open Home, then bookmark an authentic word, complete one honest review and a Garden knowledge check.');
    setStage('game-second-private-login-and-learning');
    await wait(()=>monitor.users.size>=2,'No second distinct Google account reached the backend.');
    const second=[...monitor.users.values()].find(u=>u.id!==primary.id);
    check(second.identity.subject!==primary.identity.subject,'Two different verified learner subjects are required.');
    await wait(()=>second.gameViews.has('/api/learning/game/overview') && second.bookmarks.length && second.reviews.length && second.challengeAnswers.some(a=>a.saved.correct),'Second real-account game activity is incomplete.');
    await authenticBookmark(second); report.secondReview=await auditReview(second,second.reviews[0]);
    const secondAnswer=second.challengeAnswers.find(a=>a.saved.correct);
    await auditChallenge(second,secondAnswer);
    for(const [user,foreign,answer] of [[primary,second,secondAnswer],[second,primary,primaryAnswer]]) {
      const before=await state(user); await rejectedMutations(user,foreign.id);
      check((await request(user,`/game/challenges/${answer.id}/answer`,'POST',{ choiceId:answer.choiceId })).status===404,'A foreign game challenge was accessible.');
      const foreignLedger=await pages(foreign,'/game/ledger');
      if(foreignLedger.length) check((await data(user,`/game/ledger?cursor=${foreignLedger[0].id}`)).items.length===0,'A foreign reward cursor leaked data.');
      const foreignMission=(await data(foreign,'/game/overview')).missions[0];
      check((await request(user,`/game/missions/${foreignMission.id}/claim`,'POST',{})).status===404,'An arbitrary/foreign reward claim was accepted.');
      check(same((await state(user)).ledger,before.ledger),'Foreign or rejected requests changed currency.');
    }
    report.userIsolation='both-directions-two-real-Google-subjects-with-genuine-game-activity';
    const finalPrimary=await state(primary),finalSecond=await state(second);
    const recoveryCounts=[primary.sessions.size,second.sessions.size];
    console.log(JSON.stringify({ accounts:{ primary:{xp:finalPrimary.overview.xp,tokens:finalPrimary.overview.tokens,plants:finalPrimary.garden.length},second:{xp:finalSecond.overview.xp,tokens:finalSecond.overview.tokens,plants:finalSecond.garden.length} } }));
    console.log('IDENTITY SWITCH: in REGULAR Chrome sign out of primary, sign into SECOND and confirm its own wallet/quests/garden/history (no primary cache). In INCOGNITO sign out of second, sign into PRIMARY and confirm its own recovery. Inspect the five world pages; no more ratings are needed. Confirmation: accounts-recovered.');
    setStage('game-two-context-identity-switch-recovery');
    await wait(()=>confirmations.has('accounts-recovered') && primary.sessions.size>recoveryCounts[0] && second.sessions.size>recoveryCounts[1],'Both real accounts have not completed fresh independent identity-switch recovery.');
    const recoveredPrimary=await state(primary),recoveredSecond=await state(second);
    check(same(recoveredPrimary.ledger,finalPrimary.ledger) && same(recoveredSecond.ledger,finalSecond.ledger),'Identity switching/reloads changed reward history.');
    report.restoration='fresh-real-OAuth-sessions-both-users-plus-private-UI-confirmation';
    report.crossDevice='independent-regular-incognito-contexts-not-a-physical-second-device';
    report.gamification={ primary:{xp:recoveredPrimary.overview.xp,tokens:recoveredPrimary.overview.tokens,plants:recoveredPrimary.garden.length,rewardEvents:recoveredPrimary.ledger.length},
      second:{xp:recoveredSecond.overview.xp,tokens:recoveredSecond.overview.tokens,plants:recoveredSecond.garden.length,rewardEvents:recoveredSecond.ledger.length} };
    report.learning='genuine-bookmarks-FSRS-review-history-and-garden-agree-with-PostgreSQL';
    report.antiCheat='live-forged-values-stale-reviews-committed-retries-challenge-replay-ownership-and-cosmetic-race';
    console.log('FINAL UI: sign out of BOTH contexts. Confirm public Quran reading still works and Garden/Reviews require sign-in. Confirmation: finish-ui.');
    setStage('game-final-signout-and-public-reading');
    await wait(()=>confirmations.has('finish-ui'),'Final private/public UI sign-out confirmation is missing.');
    await publicReading(); await preserve();
    report.signOut='both-contexts-user-confirmed-anonymous-private-API-rejected';
    report.preservation='all-preexisting-reviews-ledger-bookmarks-structures-cosmetics-retained';
    report.status='passed';
    report.limits='No real clocks/history altered. Own-card skips/bookmark removals and long-term mastery remain isolated synthetic tests. Mobile layout is separately automated; no real physical second-device claim.';
  } finally { armed=undefined; monitor.setMutationObserver(undefined); lines.close(); monitor.users.clear(); }
}
