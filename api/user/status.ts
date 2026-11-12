import prisma from '../db.js';
import type { ApiRequest, ApiResponse } from '../types.js';

interface UserStatusResponse {
  isNew: boolean;
  repositoryStarred: boolean;
  maintainerFollowed: boolean;
  requirementsComplete: boolean;
  user?: {
    id: string;
    githubUsername: string;
    githubName: string | null;
    githubAvatar: string | null;
  };
}

const SUPPORT_REPOSITORIES = [
  'SIMARSINGHRAYAT/DEVELOPER-ASCEND',
  'SIMARSINGHRAYAT/GitHubUniverse.com',
  'SIMARSINGHRAYAT/ML-Arena_Challenge-2026-Team_KILZZCODE',
  'SIMARSINGHRAYAT/GitHubUpgrade.com',
  'SIMARSINGHRAYAT/LINUX-DISTROS-APP-CENTER',
  'SIMARSINGHRAYAT/LINUX-SHORTCUT-CENTER',
];

async function checkGitHubStatus(token: string, maintainer: string) {
  try {
    // Check main repo
    const [mainOwner, mainRepo] = SUPPORT_REPOSITORIES[0].split('/');
    const starRes = await fetch(`https://api.github.com/user/starred/${mainOwner}/${mainRepo}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    const starred = starRes.status === 204;

    // Check if user follows maintainer
    const followRes = await fetch(`https://api.github.com/user/following/${maintainer}`, {
      headers: { 'Authorization': `token ${token}` }
    });
    const followed = followRes.status === 204;

    return { starred, followed };
  } catch (error) {
    console.error('GitHub API error:', error);
    return { starred: false, followed: false };
  }
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse<UserStatusResponse | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Invalid token format' });
  }

  try {
    // Fetch current GitHub user
    const userRes = await fetch('https://api.github.com/user', {
      headers: { 'Authorization': `token ${token}` }
    });

    if (!userRes.ok) {
      const errorText = await userRes.text().catch(() => '');
      return res.status(401).json({ error: `Invalid GitHub token. GitHub API responded with ${userRes.status}. ${errorText}` });
    }

    const githubUser = await userRes.json();
    const githubId = githubUser.id;
    const githubUsername = githubUser.login;

    const maintainer = process.env.SUPPORT_MAINTAINER || 'SIMARSINGHRAYAT';

    const { starred, followed } = await checkGitHubStatus(token, maintainer);

    // Check if user exists in database
    let user = await prisma.user.findUnique({
      where: { githubId }
    });

    const isNew = !user;

    // Persist verified completion: if user previously completed it, keep them completed!
    const effectiveStarred = starred || Boolean(user?.repositoryStarred);
    const effectiveFollowed = followed || Boolean(user?.maintainerFollowed);
    const requirementsComplete = effectiveStarred && effectiveFollowed;

    // Create or update user
    if (!user) {
      user = await prisma.user.create({
        data: {
          githubId,
          githubUsername,
          githubName: githubUser.name || null,
          githubAvatar: githubUser.avatar_url || null,
          githubBio: githubUser.bio || null,
          githubFollowersCount: githubUser.followers || 0,
          githubFollowingCount: githubUser.following || 0,
          repositoryStarred: effectiveStarred,
          maintainerFollowed: effectiveFollowed,
          lastRequirementCheck: new Date()
        }
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubName: githubUser.name || null,
          githubAvatar: githubUser.avatar_url || null,
          githubBio: githubUser.bio || null,
          githubFollowersCount: githubUser.followers || 0,
          githubFollowingCount: githubUser.following || 0,
          repositoryStarred: effectiveStarred,
          maintainerFollowed: effectiveFollowed,
          lastRequirementCheck: new Date()
        }
      });
    }

    return res.status(200).json({
      isNew,
      repositoryStarred: effectiveStarred,
      maintainerFollowed: effectiveFollowed,
      requirementsComplete,
      user: {
        id: user.id,
        githubUsername: user.githubUsername,
        githubName: user.githubName,
        githubAvatar: user.githubAvatar
      }
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('User status error:', errorMessage, error);
    return res.status(500).json({ error: `Failed to check user status: ${errorMessage}` });
  }
}
