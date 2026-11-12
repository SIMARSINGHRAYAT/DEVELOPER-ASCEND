import prisma from './db.js';
import { Prisma } from '@prisma/client';
import type { ApiRequest, ApiResponse } from './types.js';

const MAX_STARS_PER_DAY = 10;
const MAX_ACTIVE_REPOS = 2;

function today() {
  // 24-hour reset boundary calculated using Indian Standard Time (IST, UTC+5:30)
  const nowUtc = Date.now();
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(nowUtc + istOffsetMs);
  return new Date(Date.UTC(istDate.getUTCFullYear(), istDate.getUTCMonth(), istDate.getUTCDate()));
}

async function getUser(token: string) {
  const response = await fetch('https://api.github.com/user', { headers: { Authorization: `token ${token}` } });
  if (!response.ok) return null;
  const githubUser = await response.json();
  return prisma.user.findUnique({ where: { githubId: githubUser.id } });
}

async function payload(currentUserId: string) {
  const date = today();
  const usage = await prisma.dailyDiscoveryUsage.findUnique({ where: { userId_date: { userId: currentUserId, date } } });
  const submissions = await prisma.discoveryRepositorySubmission.findMany({ where: { userId: currentUserId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' } });
  const interactions = await prisma.discoveryRepositoryInteraction.findMany({ where: { actorId: currentUserId } });
  const candidates = await prisma.discoveryRepositorySubmission.findMany({
    where: { status: 'ACTIVE', userId: { not: currentUserId }, id: { notIn: interactions.map(item => item.submissionId) } },
    orderBy: { createdAt: 'desc' }, take: 100,
  });

  // Calculate submitters' star activity: developers who star more repositories get their submissions prioritized first!
  const allStarredInteractions = await prisma.discoveryRepositoryInteraction.groupBy({
    by: ['actorId'],
    where: { action: 'STAR' },
    _count: { submissionId: true },
  });
  const submitterStarMap = new Map(allStarredInteractions.map(item => [item.actorId, item._count.submissionId]));

  const feed = candidates.sort((left, right) => {
    const leftSubmitterStars = submitterStarMap.get(left.userId) || 0;
    const rightSubmitterStars = submitterStarMap.get(right.userId) || 0;
    if (rightSubmitterStars !== leftSubmitterStars) {
      return rightSubmitterStars - leftSubmitterStars; // Highest starrers' repos surfaced first
    }
    return right.discoveryStars - left.discoveryStars;
  }).slice(0, 25);

  if (feed.length) await prisma.$transaction(feed.map(item => prisma.discoveryRepositorySubmission.update({ where: { id: item.id }, data: { exposureCount: { increment: 1 } } })));
  
  // Repository Star Leaderboard: strictly top 10
  const leaderboard = await prisma.discoveryRepositorySubmission.groupBy({
    by: ['userId'],
    where: { status: 'ACTIVE' },
    _sum: { discoveryStars: true },
    _count: { id: true },
    orderBy: { _sum: { discoveryStars: 'desc' } },
    take: 10,
  });

  const starredRepositories = await prisma.discoveryRepositoryInteraction.groupBy({
    by: ['actorId'],
    where: { action: 'STAR' },
    _count: { submissionId: true },
  });
  const starredRepositoryMap = new Map(starredRepositories.map(item => [item.actorId, item._count.submissionId]));
  const users = await prisma.user.findMany({ where: { id: { in: leaderboard.map(item => item.userId) } } });
  const userMap = new Map(users.map(user => [user.id, user]));

  return {
    submissions,
    feed,
    starsUsed: usage?.starsUsed || 0,
    starsRemaining: Math.max(0, MAX_STARS_PER_DAY - (usage?.starsUsed || 0)),
    maxStarsPerDay: MAX_STARS_PER_DAY,
    maxActiveRepos: MAX_ACTIVE_REPOS,
    leaderboard: leaderboard.map(item => ({
      username: userMap.get(item.userId)?.githubUsername || 'Unknown',
      discoveryStarsReceived: item._sum.discoveryStars || 0,
      repositoriesStarred: starredRepositoryMap.get(item.userId) || 0,
    })),
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Missing authorization header' });
  try {
    const currentUser = await getUser(token);
    if (!currentUser) return res.status(401).json({ error: 'Invalid GitHub token' });
    if (req.method === 'GET') return res.status(200).json(await payload(currentUser.id));
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const { action } = req.body || {};

    if (action === 'submit') {
      const repositories = Array.isArray(req.body.repositories) ? req.body.repositories : [req.body.repo];
      if (!repositories.length || repositories.some((repo: any) => !repo?.id || !repo?.name || !repo?.owner?.login || !repo?.html_url)) {
        return res.status(400).json({ error: 'Invalid repository submission' });
      }
      if (repositories.some((repo: any) => String(repo.discoveryDescription || repo.description || '').trim().split(/\s+/).filter(Boolean).length > 50)) {
        return res.status(400).json({ error: 'Each repository description must be 50 words or fewer.' });
      }

      // Enforce maximum 2 active repositories per user
      const existingActive = await prisma.discoveryRepositorySubmission.findMany({
        where: { userId: currentUser.id, status: 'ACTIVE' },
        select: { githubRepoId: true },
      });
      const existingRepoIds = new Set(existingActive.map(r => r.githubRepoId));
      const newReposCount = repositories.filter((r: any) => !existingRepoIds.has(String(r.id))).length;

      if (existingActive.length + newReposCount > MAX_ACTIVE_REPOS) {
        return res.status(400).json({
          error: `You can only have up to ${MAX_ACTIVE_REPOS} active repositories at a time. Delete an existing submission first.`,
        });
      }

      const created = await prisma.$transaction(repositories.map((repo: any) => prisma.discoveryRepositorySubmission.upsert({
        where: { userId_githubRepoId: { userId: currentUser.id, githubRepoId: String(repo.id) } },
        update: {
          repositoryName: repo.name,
          repositoryOwner: repo.owner.login,
          repositoryUrl: repo.html_url,
          repositoryAvatar: repo.owner.avatar_url || null,
          githubStars: repo.stargazers_count || 0,
          description: typeof repo.discoveryDescription === 'string' ? repo.discoveryDescription : repo.description || null,
          status: 'ACTIVE',
        },
        create: {
          userId: currentUser.id,
          githubRepoId: String(repo.id),
          repositoryName: repo.name,
          repositoryOwner: repo.owner.login,
          repositoryUrl: repo.html_url,
          repositoryAvatar: repo.owner.avatar_url || null,
          githubStars: repo.stargazers_count || 0,
          description: typeof repo.discoveryDescription === 'string' ? repo.discoveryDescription : repo.description || null,
        },
      })));
      return res.status(201).json({ submissions: created });
    }

    if (action === 'update') {
      const description = String(req.body.description || '').trim();
      if (description.split(/\s+/).filter(Boolean).length > 50) return res.status(400).json({ error: 'Description must be 50 words or fewer.' });
      const result = await prisma.discoveryRepositorySubmission.updateMany({ where: { id: req.body.submissionId, userId: currentUser.id }, data: { description } });
      return result.count ? res.status(200).json({ success: true }) : res.status(404).json({ error: 'Submission not found' });
    }

    if (action === 'delete') {
      await prisma.discoveryRepositorySubmission.deleteMany({ where: { id: req.body.submissionId, userId: currentUser.id } });
      return res.status(200).json({ success: true });
    }

    if (action === 'interact') {
      const submissionId = String(req.body.submissionId || '');
      const interactionAction = req.body.interaction === 'STAR' ? 'STAR' : 'SKIP';
      const submission = await prisma.discoveryRepositorySubmission.findUnique({ where: { id: submissionId } });
      if (!submission || submission.status !== 'ACTIVE') return res.status(404).json({ error: 'Repository is not available for discovery.' });
      if (submission.userId === currentUser.id) return res.status(400).json({ error: 'You cannot interact with your own repository.' });
      const result = await prisma.$transaction(async transaction => {
        try { await transaction.discoveryRepositoryInteraction.create({ data: { actorId: currentUser.id, submissionId, action: interactionAction } }); }
        catch (error: any) { if (error?.code === 'P2002') throw new Error('You have already interacted with this repository.'); throw error; }
        const usage = await transaction.dailyDiscoveryUsage.findUnique({ where: { userId_date: { userId: currentUser.id, date: today() } } });
        if (interactionAction === 'STAR') {
          if ((usage?.starsUsed || 0) >= MAX_STARS_PER_DAY) throw new Error(`You have reached today's limit of ${MAX_STARS_PER_DAY} repository stars.`);
          await transaction.discoveryRepositorySubmission.update({ where: { id: submissionId }, data: { discoveryStars: { increment: 1 } } });
          await transaction.dailyDiscoveryUsage.upsert({ where: { userId_date: { userId: currentUser.id, date: today() } }, update: { starsUsed: { increment: 1 } }, create: { userId: currentUser.id, date: today(), starsUsed: 1 } });
          return { starsUsed: (usage?.starsUsed || 0) + 1 };
        }
        return { starsUsed: usage?.starsUsed || 0 };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return res.status(200).json({ success: true, ...result, starsRemaining: MAX_STARS_PER_DAY - result.starsUsed });
    }
    return res.status(400).json({ error: 'Invalid action' });
  } catch (error: any) {
    return res.status(error?.message?.includes('already') || error?.message?.includes('limit') ? 409 : 500).json({ error: error?.message || 'Failed to process repository discovery request' });
  }
}
