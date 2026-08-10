import { prisma } from '../src/database/prisma';
import { TournamentService } from '../src/services/tournamentService';
import { MatchService } from '../src/services/matchService';
import { ResultSubmissionService } from '../src/services/resultSubmissionService';
import { validateMatchLinks, determineScoreAndValidate } from '../src/utils/validators';

async function runTests() {
  console.log('🧪 Starting EFL CS2 Discord Bot System Verification Tests...\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, failureDetails?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (failureDetails) console.error(`     Reason: ${failureDetails}`);
      failedTests++;
    }
  }

  // --- 1. Link & Score Validation Tests ---
  console.log('🔹 Test Suite 1: Link & Score Validation Logic');

  const allowedDomains = ['cybershoke.net', 'faceit.com'];

  // Valid BO1 link
  const validBo1 = validateMatchLinks('BO1', ['https://cybershoke.net/match/12345'], allowedDomains);
  assert(validBo1.isValid, 'BO1 valid link check');

  // Invalid domain check
  const invalidDomain = validateMatchLinks('BO1', ['https://unauthorized-domain.com/match/123'], allowedDomains);
  assert(!invalidDomain.isValid, 'Reject unauthorized domain check');

  // Invalid URL structure check
  const invalidUrl = validateMatchLinks('BO1', ['not_a_valid_url'], allowedDomains);
  assert(!invalidUrl.isValid, 'Reject invalid URL format check');

  // BO3 link count mismatch check
  const bo3TwoLinks = validateMatchLinks('BO3', ['https://faceit.com/m1', 'https://faceit.com/m2'], allowedDomains);
  assert(bo3TwoLinks.isValid, 'BO3 2 links validation check');

  const bo3ScoreTwoZero = determineScoreAndValidate('BO3', 2, 'team1_id', 'team1_id', 'team2_id');
  assert(
    bo3ScoreTwoZero.isValid && bo3ScoreTwoZero.scoreTeam1 === 2 && bo3ScoreTwoZero.scoreTeam2 === 0,
    'BO3 2 links -> 2:0 score determination'
  );

  const bo3ScoreTwoOne = determineScoreAndValidate('BO3', 3, 'team1_id', 'team1_id', 'team2_id');
  assert(
    bo3ScoreTwoOne.isValid && bo3ScoreTwoOne.scoreTeam1 === 2 && bo3ScoreTwoOne.scoreTeam2 === 1,
    'BO3 3 links -> 2:1 score determination'
  );

  // --- 2. Database & Workflows Integration Tests ---
  console.log('\n🔹 Test Suite 2: DB & Submission Workflow Integration');

  // Initialize Default Tournament & Teams
  const tournament = await TournamentService.getOrCreateDefaultTournament();
  const stage = tournament.stages[0];
  const group = stage.groups[0];

  const teamA = await TournamentService.getOrCreateTeam('NPC Esports', 'NPC');
  const teamB = await TournamentService.getOrCreateTeam('Xtreme Gaming', 'XTR');

  // Create match
  const match = await MatchService.createMatch({
    tournamentId: tournament.id,
    stageId: stage.id,
    groupId: group.id,
    team1Id: teamA.id,
    team2Id: teamB.id,
    format: 'BO3',
  });

  assert(match.id !== undefined, 'Match creation in DB');

  // Create Submission (Scenario 1)
  const submission = await ResultSubmissionService.createSubmission({
    matchId: match.id,
    submittedBy: 'player_discord_123',
    sourceChannelId: 'channel_match_npc_vs_xtr',
    winnerTeamId: teamA.id,
    scoreTeam1: 2,
    scoreTeam2: 1,
    mapLinks: ['https://cybershoke.net/m1', 'https://cybershoke.net/m2', 'https://cybershoke.net/m3'],
  });

  assert(submission.status === 'PENDING', 'Result submission created with PENDING status');
  assert(submission.mapLinks.length === 3, 'Result submission map links saved correctly');

  // Test prevent duplicate active submission
  let duplicatePrevented = false;
  try {
    await ResultSubmissionService.createSubmission({
      matchId: match.id,
      submittedBy: 'player_discord_456',
      sourceChannelId: 'channel_match_npc_vs_xtr',
      winnerTeamId: teamB.id,
      scoreTeam1: 1,
      scoreTeam2: 2,
      mapLinks: ['https://faceit.com/m1', 'https://faceit.com/m2', 'https://faceit.com/m3'],
    });
  } catch {
    duplicatePrevented = true;
  }
  assert(duplicatePrevented, 'Prevent creation of duplicate active submission for same match');

  // --- 3. Race Condition / Atomic Approve Test ---
  console.log('\n🔹 Test Suite 3: Atomic Operations & Race Condition Protection');

  const admin1Id = 'admin_789';
  const admin2Id = 'admin_999';

  // Execute two concurrent approvals on the same submission
  const [res1, res2] = await Promise.all([
    ResultSubmissionService.approveSubmission(submission.id, admin1Id),
    ResultSubmissionService.rejectSubmission(submission.id, admin2Id, 'Late rejection'),
  ]);

  const oneSucceeded = (res1.success && !res2.success) || (!res1.success && res2.success);
  assert(oneSucceeded, 'Atomic execution: Exactly one admin action succeeded during race condition');

  if (res1.success) {
    assert(res2.reason === 'ALREADY_PROCESSED', 'Second conflicting action returned ALREADY_PROCESSED');
  } else {
    assert(res1.reason === 'ALREADY_PROCESSED', 'First conflicting action returned ALREADY_PROCESSED');
  }

  // Verify updated match state & team standings in DB
  const updatedMatch = await MatchService.getMatchById(match.id);
  assert(updatedMatch?.status === 'FINISHED', 'Match status updated to FINISHED after approval');
  assert(updatedMatch?.winnerTeamId === teamA.id, 'Match winner Team ID recorded correctly');

  const updatedTeamA = await prisma.team.findUnique({ where: { id: teamA.id } });
  assert(updatedTeamA?.wins === 1 && updatedTeamA?.points === 3, 'Winning team standings updated (+1 win, +3 pts)');

  // --- 4. Rejection Workflow Test ---
  console.log('\n🔹 Test Suite 4: Rejection & Resubmission Workflow');

  // Create match 2
  const match2 = await MatchService.createMatch({
    tournamentId: tournament.id,
    stageId: stage.id,
    groupId: group.id,
    team1Id: teamA.id,
    team2Id: teamB.id,
    format: 'BO1',
  });

  // Player submits result for match 2
  const submission2 = await ResultSubmissionService.createSubmission({
    matchId: match2.id,
    submittedBy: 'player_discord_123',
    sourceChannelId: 'channel_match2',
    winnerTeamId: teamB.id,
    scoreTeam1: 0,
    scoreTeam2: 1,
    mapLinks: ['https://cybershoke.net/match/bo1_wrong'],
  });

  // Admin rejects submission 2 with reason
  const rejectionResult = await ResultSubmissionService.rejectSubmission(
    submission2.id,
    admin1Id,
    'Ссылка на матч №1 не содержит требуемую статистику.'
  );

  assert(rejectionResult.success, 'Rejection action executed successfully');
  assert(
    rejectionResult.submission?.status === 'REJECTED' &&
    rejectionResult.submission?.rejectionReason === 'Ссылка на матч №1 не содержит требуемую статистику.',
    'Rejection status and reason saved in DB'
  );

  const match2AfterRejection = await MatchService.getMatchById(match2.id);
  assert(match2AfterRejection?.status === 'SCHEDULED', 'Match status restored to SCHEDULED for resubmission');

  // Resubmission after rejection
  const resubmission = await ResultSubmissionService.createSubmission({
    matchId: match2.id,
    submittedBy: 'player_discord_123',
    sourceChannelId: 'channel_match2',
    winnerTeamId: teamB.id,
    scoreTeam1: 0,
    scoreTeam2: 1,
    mapLinks: ['https://cybershoke.net/match/bo1_correct'],
  });

  assert(resubmission.status === 'PENDING', 'Resubmission accepted after rejection');

  console.log(`\n📊 Verification Summary: ${passedTests} passed, ${failedTests} failed.`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests()
  .then(() => {
    console.log('\n✨ ALL SYSTEM TESTS PASSED SUCCESSFULLY! ✨');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Fatal test runner error:', err);
    process.exit(1);
  });
