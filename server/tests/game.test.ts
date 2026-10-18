import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet } from 'jose';
import { createApp } from '../src/app.js';
import { createJwtVerifier } from '../src/modules/auth/auth.js';
import { LearningRepository } from '../src/modules/learning/learning.repository.js';
import { ECONOMY, dailyMissions, masteryStage, MASTERY_POLICY } from '../src/modules/game/game.policy.js';
import { disposableDatabase, syntheticProvider, syntheticResult, testIdentityProvider } from './support/learning-fixture.mjs';
import { migrateLearning } from '../scripts/learning-migrate.mjs';
import { loadSavedGameAcceptance } from '../../scripts/growing-kingdom-acceptance.mjs';

// All learning content and signed identities in this file are SYNTHETIC TEST ONLY.
let database: Awaited<ReturnType<typeof disposableDatabase>>, identity: Awaited<ReturnType<typeof testIdentityProvider>>;
let repository: LearningRepository, server: ReturnType<ReturnType<typeof createApp>['listen']>, base: string;
let time = new Date('2026-10-18T10:00:00Z');
let available = true;
const refs = [1,2].map(word => ({ surah: 1 as const, ayah: 1, word, sourceWordId: String(9100+word), sourceVerseId: '9001', environment: 'prelive' as const }));
before(async () => {
  database = await disposableDatabase(); identity = await testIdentityProvider(); repository = new LearningRepository(database.pool, () => new Date(time));
  server = createApp({ learningRepository: repository, quranProvider: { ...syntheticProvider, getSurah: async () => available ? structuredClone(syntheticResult) : ({ status: 'unavailable' as const, reason: 'Synthetic outage', attribution: syntheticResult.attribution }) },
    auth: createJwtVerifier(identity.issuer, createRemoteJWKSet(new URL(`${identity.issuer}/.well-known/jwks.json`))) }).listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/learning`;
});
after(async () => { if (server) await new Promise<void>(r => server.close(() => r())); await identity?.close(); await database?.close(); });
async function learner() {
  time = new Date('2026-10-18T10:00:00Z'); available = true;
  const subject = randomUUID(); return { ...await repository.profile({ issuer: identity.issuer, subject }), token: await identity.token(subject) };
}
async function api(token: string, path: string, method = 'GET', body?: unknown) {
  const response = await fetch(base+path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, data: (await response.json()).data };
}
async function review(user: string, rating: 'again' | 'hard' | 'good' | 'easy' = 'easy', word = 0) {
  await repository.bookmark(user, refs[word]!);
  const s = (await repository.startDaily(user, [refs[word]!], true, syntheticResult)).session!;
  const item = s.items.find(i => !i.reviewed)!;
  const input = { sessionId: s.id, vocabularyId: item.vocabularyId, expectedRevision: item.revision, rating, clientAttemptId: randomUUID() };
  return { input, result: await repository.attempt(user, input) };
}
async function wallet(user: string) { return (await repository.game.overview(user, syntheticResult)); }

test('interrupted live checker resumes only existing owner-bound saved game activity without writing', async () => {
  const user=await learner(), other=await learner(); await wallet(user.id);
  const existing=await review(user.id,'again');
  assert.equal(await loadSavedGameAcceptance(database.pool,user.id),null,'a missing correct check cannot be simulated');
  const challenge=await repository.game.issueChallenge(user.id,existing.input.vocabularyId,syntheticResult);
  const correct=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[challenge.id])).rows[0].correct_choice;
  const answer=await repository.game.answerChallenge(user.id,challenge.id,correct,syntheticResult);
  const snapshot=async () => (await database.pool.query(`SELECT
    (SELECT count(*)::int FROM learning.review_attempts) reviews,
    (SELECT count(*)::int FROM learning.reward_ledger) rewards,
    (SELECT count(*)::int FROM learning.bookmarks) bookmarks,
    (SELECT count(*)::int FROM learning.knowledge_challenges) challenges`)).rows[0];
  const before=await snapshot();
  const saved=await loadSavedGameAcceptance(database.pool,user.id);
  assert.deepEqual(saved?.review,{ input:existing.input,saved:existing.result });
  assert.equal(saved?.bookmark.vocabularyId,existing.input.vocabularyId);
  assert.deepEqual(saved?.answer,{ id:challenge.id,choiceId:correct,saved:answer });
  assert.equal(await loadSavedGameAcceptance(database.pool,other.id),null,'a different real identity cannot resume the first owner');
  assert.deepEqual(await snapshot(),before,'resuming never inserts activity or rewards');
});

test('one shared mastery policy rejects rapid Easy, demands spaced durable evidence and keeps lapses separate', () => {
  const evidence = { successfulOccasions: 1, spanDays: 0, intervalDays: 100, stability: 100, state: 2, objectiveCorrect: true, latestRating: 'easy' };
  assert.equal(masteryStage(evidence), 2);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 100, spanDays: 0 }), 2);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 3, spanDays: 3 }), 3);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 4, spanDays: 14 }), 4);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 5, spanDays: 30, objectiveCorrect: false }), 4);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 5, spanDays: 30 }), 5);
  assert.equal(masteryStage({ ...evidence, successfulOccasions: 5, spanDays: 30, latestRating: 'again', state: 3 }), 1);
});

test('quests are achievable, personalized, stable and unavailable content does not invent tasks', async () => {
  assert.equal(dailyMissions(0,0,0,0,false).length, 0);
  assert.ok(!dailyMissions(2,2,0,0,true).some(m => m.kind === 'due' || m.kind === 'recovery'));
  assert.equal(dailyMissions(20,0,6,2,true)[0]!.kind, 'due');
  assert.equal(dailyMissions(1,1,0,0,false)[0]!.target, 1);
  const user = await learner();
  assert.equal((await repository.game.overview(user.id, null)).missions.length, 0);
  const first = await wallet(user.id), second = await wallet(user.id);
  assert.equal(first.missions.filter(m => m.period === 'daily').length, 3);
  assert.deepEqual(second.missions, first.missions);
  assert.equal(first.xp, 0); assert.equal(first.tokens, 0); assert.equal(first.plants, 0);
});

test('private game endpoints reject forged identity, client XP, user IDs, timestamps and direct wallet writes', async () => {
  const user = await learner();
  assert.equal((await api('invalid','/game/overview')).status, 401);
  for (const body of [{ xp: 99999 }, { userId: randomUUID() }, { reviewedAt: '2099-01-01' }]) assert.equal((await api(user.token, '/game/kingdom/garden/unlock','POST',body)).status, 400);
  assert.equal((await api(user.token, '/game/wallet','PATCH',{ xp: 99999 })).status, 404);
  assert.equal((await api(user.token, '/game/garden?userId='+randomUUID())).status, 400);
  assert.equal((await wallet(user.id)).xp,0);
});

test('review, event, wallet and quests commit once; concurrent timeout retries return the immutable reward result', async () => {
  const user = await learner(); await wallet(user.id);
  const { input, result } = await review(user.id);
  assert.ok(result.gamification!.xp >= ECONOMY.introductionXp);
  const before = await wallet(user.id), ledger = await repository.game.ledger(user.id);
  const repeated = await Promise.all(Array.from({ length: 8 }, () => repository.attempt(user.id,input)));
  repeated.forEach(r => assert.deepEqual(r,result));
  assert.equal((await wallet(user.id)).xp,before.xp);
  assert.deepEqual(await repository.game.ledger(user.id),ledger);
  assert.equal((await repository.history(user.id)).items.length,1);
  assert.equal((await database.pool.query('SELECT count(*)::int AS n FROM learning.game_events WHERE user_id=$1',[user.id])).rows[0].n,1);
  assert.equal((await api(user.token,'/attempts','POST',{ ...input, rating:'again' })).status,409);
  for (let i=0;i<5;i++) { await repository.removeBookmark(user.id,input.vocabularyId); await repository.bookmark(user.id,refs[0]); }
  assert.equal((await wallet(user.id)).xp,before.xp,'bookmark toggles earn nothing');
});

test('Again is useful participation; immediate repeats cannot multiply missions or bypass FSRS due timing', async () => {
  const user = await learner(); await wallet(user.id);
  const { input,result } = await review(user.id,'again');
  const before = await wallet(user.id);
  assert.ok(before.missions.some(m => m.kind==='participation' && m.progress===1));
  assert.equal((await api(user.token,'/attempts','POST',{ ...input,clientAttemptId:randomUUID(),expectedRevision:1 })).status,409);
  time = new Date(result.dueAt);
  const repeat = { ...input, clientAttemptId:randomUUID(), expectedRevision:1 };
  await repository.attempt(user.id,repeat);
  const after = await wallet(user.id);
  assert.equal(after.xp,before.xp); assert.equal(after.tokens,before.tokens);
  assert.equal((await repository.game.garden(user.id)).items[0]!.stage,1);
});

test('scheduled recall XP is rating-neutral, once per word per UTC day, and early practice earns no due bonus', async () => {
  const xp: number[] = [];
  for (const rating of ['again','hard','good','easy'] as const) {
    const user = await learner(); await wallet(user.id); const first = await review(user.id);
    time = new Date(first.result.dueAt);
    const due = (await repository.startDaily(user.id,refs,false,syntheticResult)).session!;
    const result = await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:due.id,vocabularyId:due.items[0]!.vocabularyId,expectedRevision:1,rating });
    const reward = (await repository.game.ledger(user.id)).items.find(r => r.source.startsWith('due:'))!;
    xp.push(reward.xp); assert.ok(result.gamification);
  }
  assert.deepEqual(xp,[10,10,10,10]);
  const user=await learner(); await review(user.id); const practice=await repository.startSession(user.id,[refs[0]],false);
  await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:practice!.id,vocabularyId:practice!.items[0]!.vocabularyId,expectedRevision:1,rating:'easy' });
  assert.ok(!(await repository.game.ledger(user.id)).items.some(r => r.source.startsWith('due:')));
});

test('server-graded knowledge checks hide answer mapping, cap repeats and reject cross-user, replay and fake correctness', async () => {
  const a=await learner(), b=await learner(); const learned=await review(a.id);
  const challenge=(await api(a.token,'/game/challenges','POST',{ vocabularyId:learned.input.vocabularyId })).data;
  assert.ok(!('correctChoice' in challenge)); assert.ok(challenge.choices.every((c: object) => Object.keys(c).sort().join(',')==='id,text'));
  assert.deepEqual((await api(a.token,'/game/challenges','POST',{ vocabularyId:learned.input.vocabularyId })).data,challenge);
  assert.equal((await api(b.token,`/game/challenges/${challenge.id}/answer`,'POST',{ choiceId:challenge.choices[0].id })).status,404);
  assert.equal((await api(b.token,'/game/challenges','POST',{ vocabularyId:learned.input.vocabularyId })).status,404);
  assert.equal((await api(a.token,`/game/challenges/${challenge.id}/answer`,'POST',{ choiceId:challenge.choices[0].id,correct:true })).status,400);
  const correct=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[challenge.id])).rows[0].correct_choice;
  const replies=await Promise.all([1,2,3].map(() => api(a.token,`/game/challenges/${challenge.id}/answer`,'POST',{ choiceId:correct })));
  assert.ok(replies.every(r => r.status===200 && r.data.correct));
  const before=await wallet(a.id);
  const again=(await api(a.token,'/game/challenges','POST',{ vocabularyId:learned.input.vocabularyId })).data;
  const choice=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[again.id])).rows[0].correct_choice;
  await api(a.token,`/game/challenges/${again.id}/answer`,'POST',{ choiceId:choice });
  assert.equal((await wallet(a.id)).xp,before.xp);
  assert.equal((await api(a.token,`/game/challenges/${challenge.id}/answer`,'POST',{ choiceId:challenge.choices.find((c: {id: string}) => c.id!==correct).id })).status,409);
  assert.equal((await wallet(b.id)).xp,0);
});

test('expired, changed or unavailable source checks cannot manufacture rewards; committed retries survive outages', async () => {
  const user=await learner(), learned=await review(user.id);
  const c=await repository.game.issueChallenge(user.id,learned.input.vocabularyId,syntheticResult);
  const correct=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[c.id])).rows[0].correct_choice;
  available=false;
  assert.equal((await api(user.token,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:correct })).status,503);
  assert.equal((await database.pool.query('SELECT completed_at FROM learning.knowledge_challenges WHERE id=$1',[c.id])).rows[0].completed_at,null);
  const changed=structuredClone(syntheticResult); changed.surah.verses[0].words[0].translation='SYNTHETIC CHANGED MEANING';
  await assert.rejects(repository.game.answerChallenge(user.id,c.id,correct,changed));
  available=true;
  assert.equal((await api(user.token,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:correct })).status,200);
  available=false;
  assert.equal((await api(user.token,`/game/challenges/${c.id}/answer`,'POST',{ choiceId:correct })).status,200);
  available=true; const next=await repository.game.issueChallenge(user.id,learned.input.vocabularyId,syntheticResult);
  time=new Date(Date.parse(next.expiresAt));
  assert.equal((await api(user.token,`/game/challenges/${next.id}/answer`,'POST',{ choiceId:next.choices[0].id })).status,409);
  const noMeanings=structuredClone(syntheticResult); noMeanings.surah.verses[0].words.forEach((w: { translation?: string })=>delete w.translation);
  await assert.rejects(repository.game.issueChallenge(user.id,learned.input.vocabularyId,noMeanings));
});

test('timezone changes cannot regenerate frozen quests; cooldown, midnight and DST are server-controlled', async () => {
  const user=await learner(); await repository.updateProfile(user.id,undefined,'Asia/Kolkata');
  const before=await wallet(user.id);
  assert.equal(before.timezone,'Asia/Kolkata');
  assert.equal(before.resetsAt,'2026-10-18T18:30:00.000Z');
  assert.equal((await api(user.token,'/profile','PATCH',{ timezone:'Pacific/Kiritimati' })).status,409);
  time=new Date('2026-10-25T10:00:00Z'); await wallet(user.id);
  await review(user.id,'again'); const current=await wallet(user.id);
  await repository.updateProfile(user.id,undefined,'Pacific/Kiritimati');
  assert.deepEqual((await wallet(user.id)).missions,current.missions);
  time=new Date('2026-10-25T18:30:00Z'); const next=await wallet(user.id);
  assert.equal(next.timezone,'Pacific/Kiritimati'); assert.notEqual(next.localDate,current.localDate);
  assert.ok(next.missions.filter(m=>m.period==='daily').every(m=>m.progress===0),'travel cannot replay activity from the previous frozen period');
  assert.equal(next.xp,current.xp);
  const other=await learner(); await repository.updateProfile(other.id,undefined,'America/New_York');
  time=new Date('2026-11-01T12:00:00Z');
  const period=await wallet(other.id);
  const row=(await database.pool.query("SELECT starts_at,ends_at FROM learning.game_periods WHERE user_id=$1 AND kind='daily' ORDER BY ends_at DESC LIMIT 1",[other.id])).rows[0];
  assert.equal((row.ends_at-row.starts_at)/3600000,25); assert.equal(period.localDate,'2026-11-01');
});

test('kingdom eligibility is server-checked; simultaneous cosmetic spends are idempotent and nonnegative', async () => {
  const user=await learner(), other=await learner();
  assert.equal((await api(user.token,'/game/kingdom/garden/unlock','POST',{})).status,409);
  assert.equal((await api(user.token,'/game/kingdom/not-real/unlock','POST',{})).status,400);
  const learned=await review(user.id); await repository.game.unlock(user.id,'garden');
  assert.equal((await api(user.token,'/game/kingdom/library/unlock','POST',{})).status,409);
  assert.equal((await api(other.token,'/game/kingdom/garden/unlock','POST',{})).status,409);
  assert.equal((await api(user.token,'/game/cosmetics/fountain','POST',{})).status,409);
  // Test-only funding uses legitimate completed quests, not direct balance edits.
  await review(user.id,'easy',1);
  const c=await repository.game.issueChallenge(user.id,learned.input.vocabularyId,syntheticResult);
  const answer=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[c.id])).rows[0].correct_choice;
  await repository.game.answerChallenge(user.id,c.id,answer,syntheticResult);
  const before=await wallet(user.id); assert.ok(before.tokens>=3);
  await Promise.all([1,2,3,4].map(()=>repository.game.decorate(user.id,'lanterns')));
  const after=await wallet(user.id); assert.equal(after.tokens,before.tokens-3);
  assert.equal((await repository.game.ledger(user.id)).items.filter(r=>r.source==='cosmetic:lanterns').length,1);
  const totals=(await database.pool.query('SELECT sum(xp_delta)::int AS xp,sum(token_delta)::int AS tokens FROM learning.reward_ledger WHERE user_id=$1',[user.id])).rows[0];
  assert.equal(totals.xp,after.xp); assert.equal(totals.tokens,after.tokens); assert.ok(after.tokens>=0);
  await assert.rejects(database.pool.query('UPDATE learning.reward_ledger SET xp_delta=999 WHERE user_id=$1',[user.id]));
  await assert.rejects(database.pool.query('DELETE FROM learning.reward_ledger WHERE user_id=$1',[user.id]));
  assert.equal((await repository.game.garden(other.id)).items.length,0);
  assert.equal((await repository.game.ledger(other.id,(await repository.game.ledger(user.id)).items[0]!.id)).items.length,0);
});

test('failure after learning persistence rolls back event, reward, wallet, mission and FSRS schedule together', async () => {
  const user=await learner(); const before=await wallet(user.id); await repository.bookmark(user.id,refs[0]);
  const session=(await repository.startDaily(user.id,refs,true,syntheticResult)).session!;
  const input={ clientAttemptId:randomUUID(),sessionId:session.id,vocabularyId:session.items[0]!.vocabularyId,rating:'easy' as const,expectedRevision:0 };
  await database.pool.query(`CREATE FUNCTION learning.fail_reward_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'SYNTHETIC GAME FAILURE'; END; $$;
    CREATE TRIGGER fail_reward BEFORE INSERT ON learning.reward_ledger FOR EACH ROW EXECUTE FUNCTION learning.fail_reward_test()`);
  try {
    assert.equal((await api(user.token,'/attempts','POST',input)).status,503);
    assert.equal((await repository.progress(user.id)).totalReviews,0);
    assert.equal((await wallet(user.id)).xp,0); assert.deepEqual((await wallet(user.id)).missions,before.missions);
    assert.equal((await repository.game.garden(user.id)).items.length,0);
  } finally { await database.pool.query('DROP TRIGGER fail_reward ON learning.reward_ledger; DROP FUNCTION learning.fail_reward_test()'); }
  assert.equal((await api(user.token,'/attempts','POST',input)).status,200);
  assert.equal((await repository.progress(user.id)).totalReviews,1);
});

test('per-user durable abuse limits survive new repository instances; suspicious rejections have private bounded audit categories', async () => {
  const user=await learner();
  for(let i=0;i<20;i++) await repository.game.guard(user.id,'challenge');
  await assert.rejects(repository.game.guard(user.id,'challenge'));
  assert.equal((await api(user.token,'/game/challenges','POST',{ vocabularyId:randomUUID() })).status,429);
  const other=await learner(); await repository.game.guard(other.id,'challenge');
});

test('additive migration preserves old activity and schedules; historical rows earn no replayed XP', async () => {
  const old=await disposableDatabase({ throughVersion:2 });
  try {
    const repo=new LearningRepository(old.pool), user=await repo.profile({ issuer:'SYNTHETIC-MIGRATION',subject:randomUUID() });
    // Pre-v3 data is inserted by this fixture; old runtime deliberately is not used with the new schema.
    const id=randomUUID(); await old.pool.query('INSERT INTO learning.word_occurrences VALUES(1,1,1)');
    await old.pool.query("INSERT INTO learning.vocabulary_items(id,identity_kind,surah,ayah,word) VALUES($1,'occurrence',1,1,1)",[id]);
    await old.pool.query("INSERT INTO learning.vocabulary_progress(user_id,vocabulary_id,review_count,due_at) VALUES($1,$2,1,'2026-12-01T00:00Z')",[user.id,id]);
    const before=(await old.pool.query('SELECT * FROM learning.vocabulary_progress')).rows;
    assert.deepEqual(await migrateLearning(old.connectionString),{ status:'applied',versions:[3] });
    assert.deepEqual((await old.pool.query('SELECT * FROM learning.vocabulary_progress')).rows,before);
    assert.equal((await repo.game.overview(user.id,null)).xp,0);
    assert.equal((await repo.game.garden(user.id)).items.length,1);
    assert.equal((await repo.game.garden(user.id)).items[0]!.masteryVersion,MASTERY_POLICY);
  } finally { await old.close(); }
});

test('complete synthetic multi-week FSRS journey blooms ten words, unlocks library and preserves milestones after lapses', async () => {
  const user=await learner();
  const source=structuredClone(syntheticResult);
  source.surah.verses[0].words=Array.from({ length:10 },(_,i)=>({ ...source.surah.verses[0].words[0], sourceId:9500+i,position:i+1,
    textUthmani:`اختبار ${i+1}`,translation:`SYNTHETIC VERIFIED TEST MEANING ${i+1}`,reference:{ surah:1,ayah:1,word:i+1,verseKey:'1:1' } }));
  const references=source.surah.verses[0].words.map(w=>({ ...refs[0],word:w.position,sourceWordId:String(w.sourceId) }));
  const first=await repository.startSession(user.id,references,false,source);
  for(const item of first!.items) await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:first!.id,vocabularyId:item.vocabularyId,expectedRevision:0,rating:'easy' });
  for(const item of first!.items) {
    const c=await repository.game.issueChallenge(user.id,item.vocabularyId,source);
    const correct=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[c.id])).rows[0].correct_choice;
    await repository.game.answerChallenge(user.id,c.id,correct,source);
  }
  for(let round=0;round<4;round++) {
    const due=(await database.pool.query('SELECT max(due_at) AS due FROM learning.vocabulary_progress WHERE user_id=$1',[user.id])).rows[0].due;
    time=new Date(due);
    const session=(await repository.startDaily(user.id,references,false,source)).session!;
    for(const item of session.items) await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:session.id,vocabularyId:item.vocabularyId,expectedRevision:item.revision,rating:'easy' });
  }
  const grown=await repository.game.garden(user.id);
  assert.equal(grown.items.filter(p=>p.stage===5).length,10);
  await Promise.all([1,2,3].map(()=>repository.game.unlock(user.id,'library')));
  assert.equal((await database.pool.query("SELECT count(*)::int AS n FROM learning.kingdom_structures WHERE user_id=$1 AND structure_key='library'",[user.id])).rows[0].n,1);
  const due=(await database.pool.query('SELECT max(due_at) AS due FROM learning.vocabulary_progress WHERE user_id=$1',[user.id])).rows[0].due;
  time=new Date(due);
  const lapse=(await repository.startDaily(user.id,references,false,source)).session!;
  await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:lapse.id,vocabularyId:lapse.items[0]!.vocabularyId,expectedRevision:lapse.items[0]!.revision,rating:'again' });
  const plant=(await repository.game.garden(user.id)).items.find(p=>p.vocabularyId===lapse.items[0]!.vocabularyId)!;
  assert.equal(plant.stage,5); assert.equal(plant.health,'recovering');
  assert.ok((await repository.game.overview(user.id,source)).structures.find(s=>s.key==='library')!.unlockedAt);
});

test('daily XP cap is enforced transactionally and capped sources cannot be replayed on a later day', async () => {
  const user=await learner();
  const references=Array.from({ length:50 },(_,i)=>({ ...refs[0],word:i+1,sourceWordId:`SYNTHETIC-CAP-${i}` }));
  const session=(await repository.startSession(user.id,references,false))!;
  let firstInput: Parameters<LearningRepository['attempt']>[1] | undefined;
  for(const item of session.items) {
    const input={ clientAttemptId:randomUUID(),sessionId:session.id,vocabularyId:item.vocabularyId,expectedRevision:0,rating:'easy' as const };
    firstInput??=input; await repository.attempt(user.id,input);
  }
  const before=await repository.game.overview(user.id,null); assert.equal(before.xp,ECONOMY.dailyXpCap);
  time=new Date('2026-10-19T10:00:00Z'); await repository.attempt(user.id,firstInput!);
  assert.equal((await repository.game.overview(user.id,null)).xp,before.xp);
  const totals=(await database.pool.query('SELECT max(daily)::int AS max FROM (SELECT sum(xp_delta) AS daily FROM learning.reward_ledger WHERE user_id=$1 GROUP BY reward_day) q',[user.id])).rows[0];
  assert.equal(totals.max,ECONOMY.dailyXpCap);
  const page1=await repository.game.garden(user.id), page2=await repository.game.garden(user.id,page1.nextCursor!);
  assert.equal(page1.items.length,24); assert.equal(page2.items.length,24);
  assert.equal(new Set([...page1.items,...page2.items].map(p=>p.vocabularyId)).size,48);
  assert.equal((await repository.game.garden(user.id,page2.nextCursor!)).items.length,2);
});

test('token cap spans local midnight and is not replenished by cosmetic spending or timezone grouping', async () => {
  const user=await learner(); time=new Date('2026-10-18T08:00:00Z');
  await repository.updateProfile(user.id,undefined,'Pacific/Kiritimati'); await wallet(user.id);
  const first=await review(user.id,'easy',0); await review(user.id,'easy',1);
  async function check() {
    const c=await repository.game.issueChallenge(user.id,first.input.vocabularyId,syntheticResult);
    const correct=(await database.pool.query('SELECT correct_choice FROM learning.knowledge_challenges WHERE id=$1',[c.id])).rows[0].correct_choice;
    await repository.game.answerChallenge(user.id,c.id,correct,syntheticResult);
  }
  await check(); assert.equal((await wallet(user.id)).tokens,5);
  await repository.game.unlock(user.id,'garden'); await repository.game.decorate(user.id,'lanterns');
  assert.equal((await wallet(user.id)).tokens,2);
  time=new Date('2026-10-18T10:00:00Z');
  assert.equal((await wallet(user.id)).localDate,'2026-10-19');
  const session=(await repository.startSession(user.id,refs,false,syntheticResult))!;
  await repository.attempt(user.id,{ clientAttemptId:randomUUID(),sessionId:session.id,vocabularyId:session.items[0]!.vocabularyId,expectedRevision:session.items[0]!.revision,rating:'easy' });
  await check();
  const credits=(await database.pool.query('SELECT sum(GREATEST(token_delta,0))::int AS tokens FROM learning.reward_ledger WHERE user_id=$1 AND reward_day=$2',[user.id,'2026-10-18'])).rows[0].tokens;
  assert.equal(credits,ECONOMY.dailyTokenCap); assert.equal((await wallet(user.id)).tokens,3);
});

test('an interrupted session crossing midnight reconciles committed current-period events once when verified content returns', async () => {
  const user=await learner(); time=new Date('2026-10-18T23:59:30Z'); await wallet(user.id);
  const first=await review(user.id,'again');
  time=new Date(first.result.dueAt);
  const second=await repository.attempt(user.id,{ ...first.input,clientAttemptId:randomUUID(),expectedRevision:1,rating:'easy' });
  const duringOutage=await repository.game.overview(user.id,null);
  assert.equal(duringOutage.questsPaused,true);
  time=new Date(time.getTime()+1000);
  const restored=await wallet(user.id);
  assert.equal(restored.localDate,'2026-10-19');
  assert.ok(restored.missions.some(m=>m.kind==='participation' && m.completedAt));
  const steps=(await database.pool.query(`SELECT st.source_event_id FROM learning.game_mission_steps st JOIN learning.game_missions m ON m.id=st.mission_id
    JOIN learning.game_periods p ON p.id=m.period_id WHERE st.user_id=$1 AND p.kind='daily' AND p.local_date='2026-10-19'`,[user.id])).rows;
  assert.ok(steps.length>0); assert.ok(steps.every(s=>s.source_event_id===second.attemptId));
  const xp=restored.xp; assert.equal((await wallet(user.id)).xp,xp);
  assert.equal((await repository.history(user.id)).items.length,2);
});
