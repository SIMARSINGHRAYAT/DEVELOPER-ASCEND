import prisma from '../db.js';
import type { ApiRequest, ApiResponse } from '../types.js';

interface UserStatusResponse {
  isNew: boolean;
  repositoryStarred: boolean;
  maintainerFollowed: boolean;
  requirementsComplete: boolean;
  maintainerUsername: string;
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

async function checkRequirement(url: string, token: string, requirement: string): Promise<boolean> {
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 204) return true;
  if (response.status === 404) return false;

  throw new Error(`Unable to verify ${requirement}: GitHub API responded with ${response.status}.`);
}

async function checkGitHubStatus(token: string, maintainer: string) {
  const [starredRepositories, followed] = await Promise.all([
    Promise.all(SUPPORT_REPOSITORIES.map(repository => {
      const [owner, name] = repository.split('/');
      return checkRequirement(
        `https://api.github.com/user/starred/${owner}/${name}`,
        token,
        `star for ${repository}`
      );
    })),
    checkRequirement(`https://api.github.com/user/following/${maintainer}`, token, 'maintainer follow'),
  ]);

  return {
    starred: starredRepositories.every(Boolean),
    followed,
  };
}

export default async function handler(
  req: ApiRequest,
  res: ApiResponse<UserStatusResponse | { error: string }>
) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const [scheme, token] = authHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return res.status(401).json({ error: 'Invalid authorization header format' });
  }

  try {
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!userRes.ok) {
      return res.status(userRes.status === 401 ? 401 : 502).json({
        error: `Unable to verify GitHub token. GitHub API responded with ${userRes.status}.`,
      });
    }

    const githubUser = await userRes.json();
    const githubId = githubUser.id;
    const githubUsername = githubUser.login;
    const maintainer = process.env.SUPPORT_MAINTAINER || 'SIMARSINGHRAYAT';

    let status: { starred: boolean; followed: boolean };
    try {
      status = await checkGitHubStatus(token, maintainer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'GitHub verification failed.';
      console.error('GitHub requirement verification error:', message);
      return res.status(502).json({ error: message });
    }

    let user = await prisma.user.findUnique({ where: { githubId } });
    const isNew = !user;
    const requirementsComplete = status.starred && status.followed;

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
          repositoryStarred: status.starred,
          maintainerFollowed: status.followed,
          lastRequirementCheck: new Date(),
        },
      });
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          githubUsername,
          githubName: githubUser.name || null,
          githubAvatar: githubUser.avatar_url || null,
          githubBio: githubUser.bio || null,
          githubFollowersCount: githubUser.followers || 0,
          githubFollowingCount: githubUser.following || 0,
          repositoryStarred: status.starred,
          maintainerFollowed: status.followed,
          lastRequirementCheck: new Date(),
        },
      });
    }

    return res.status(200).json({
      isNew,
      repositoryStarred: status.starred,
      maintainerFollowed: status.followed,
      requirementsComplete,
      maintainerUsername: maintainer,
      user: {
        id: user.id,
        githubUsername: user.githubUsername,
        githubName: user.githubName,
        githubAvatar: user.githubAvatar,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('User status error:', errorMessage, error);
    return res.status(500).json({ error: 'Failed to check user status.' });
  }
}
