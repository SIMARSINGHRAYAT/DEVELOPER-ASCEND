import { useState, useRef, useEffect } from 'react';
import type {
  GitHubRepo, GitHubCollaborator, QuickdrawBadgeTemplate, YOLOBadgeTemplate, PRTemplate, PairTemplate, CoAuthor,
  CreatedItem, AppMode, MergeMethod,
} from './types';
import {
  fetchAllRepos, fetchRepoCollaborators, fetchPrimaryGitHubEmail, testRepoPermission, getGitHubOAuthUrl, fetchGitHubUser,
  getDefaultBranchSHA, getDefaultBranchSHAWithRetry,
  createBranch, createFileOnBranch, createPullRequest,
  createMultiFileCommitWithCoAuthors,
  waitForMergeable, mergePullRequest, verifyMergedPullRequest, verifyCoAuthorTrailer, deleteBranch,
  createIssue, closeIssue, requestPRReview, createRepository, getFileContent
} from './utils/github';
import { checkUserStatus } from './utils/api';
import { cn } from './utils/cn';
import quickdrawBadge from './assets/badges/starstruck-default--light-a594e2a027e0.png';
import yoloBadge from './assets/badges/yolo-default-be0bbff04951.png';
import pullSharkBadge from './assets/badges/pull-shark-default-498c279a747d.png';
import pairExtraordinaireBadge from './assets/badges/pair-extraordinaire-default-579438a20e01.png';
import {
  Github, Key, ChevronDown, Play,
  CheckCircle2, XCircle, Loader2, AlertTriangle, Lock, Globe,
  Star, AlertCircle, RotateCcw, Sparkles, X,
  ChevronRight, Pause, ShieldCheck, ShieldAlert,
  GitPullRequest, GitMerge, GitBranch, Eye, EyeOff, Users, Award,
  Rocket, LogIn, ExternalLink, ArrowLeft, Clock,
} from 'lucide-react';
import { SupportProject } from './components/SupportProject';
import { FeatureSelection } from './components/FeatureSelection';
import { IncreaseStars } from './components/IncreaseStars';
import { IncreaseFollowers } from './components/IncreaseFollowers';

// ─── Constants ───────────────────────────────────────────────────────
const MAX_ITEMS = 300;
const FLOATING_GITHUB_LOGOS = [
  { left: '4%', size: 'clamp(32px, 5.5vw, 80px)', delay: '-0.5s', duration: '4s' },
  { left: '18%', size: 'clamp(42px, 6.5vw, 96px)', delay: '-2s', duration: '5.5s' },
  { left: '32%', size: 'clamp(28px, 4.5vw, 68px)', delay: '-3.5s', duration: '4.5s' },
  { left: '48%', size: 'clamp(48px, 7.5vw, 110px)', delay: '-1s', duration: '6.5s' },
  { left: '64%', size: 'clamp(32px, 5.5vw, 80px)', delay: '-2.5s', duration: '5s' },
  { left: '80%', size: 'clamp(40px, 6vw, 88px)', delay: '-3s', duration: '6s' },
  { left: '93%', size: 'clamp(26px, 4.5vw, 64px)', delay: '-1.5s', duration: '4.5s' },
];

const badgeAssets = {
  quickdraw_badge: quickdrawBadge,
  yolo_badge: yoloBadge,
  pull_shark: pullSharkBadge,
  pair_extraordinaire: pairExtraordinaireBadge,
} as const;

const modeLabels: Record<AppMode, string> = {
  quickdraw_badge: 'QuickDraw',
  yolo_badge: 'YOLO',
  pull_shark: 'Pull Shark',
  pair_extraordinaire: 'Pair Extraordinaire',
};

const modeDescriptions: Record<AppMode, string> = {
  quickdraw_badge: 'Close an issue within seconds to trigger the QuickDraw achievement.',
  yolo_badge: 'Merge a pull request directly without code review to trigger the YOLO achievement.',
  pull_shark: 'Merge authentic pull requests across repositories to advance Pull Shark.',
  pair_extraordinaire: 'Merge co-authored pull requests with recognized collaborators for Pair Extraordinaire.',
};

// ─── Utility ─────────────────────────────────────────────────────────
let idCounter = 0;
const uid = () => `item_${Date.now()}_${++idCounter}`;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

// ─── Validation ──────────────────────────────────────────────────────
function validatePairConfig(coAuthors: CoAuthor[], templates: PairTemplate[]): string | null {
  const validCoAuthors = coAuthors.filter(ca => ca.name.trim() && ca.email.trim());
  if (validCoAuthors.length === 0) return 'Add at least one co-author with both name and email.';
  if (templates.length === 0) return 'No pair PRs to create. Generate them first.';
  const branchNames = new Set<string>();
  for (const pt of templates) {
    if (branchNames.has(pt.branchName)) return `Duplicate branch name: "${pt.branchName}".`;
    branchNames.add(pt.branchName);
  }
  return null;
}

// ─── MAIN APP ────────────────────────────────────────────────────────
export default function App() {
  // Auth state
  const [token, setToken] = useState('');
  const [oauthError, setOauthError] = useState('');
  const [user, setUser] = useState<{ login: string; avatar_url: string } | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Repo state
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<GitHubRepo | null>(null);
  const [repoSearch, setRepoSearch] = useState('');
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<'idle' | 'checking' | 'ok' | 'fail'>('idle');
  const [permissionError, setPermissionError] = useState('');
  const [collaborators, setCollaborators] = useState<GitHubCollaborator[]>([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [initReadme, setInitReadme] = useState(true);
  const [creatingRepo, setCreatingRepo] = useState(false);

  // Template state
  const [quickdrawBadgeTemplates, setQuickdrawBadgeTemplates] = useState<QuickdrawBadgeTemplate[]>([
    { id: uid(), title: `Quickdraw Badge Update`, body: `Automated issue closure at ${new Date().toISOString()}` }
  ]);
  const [yoloBadgeTemplates, setYOLOBadgeTemplates] = useState<YOLOBadgeTemplate[]>([]);
  const [prTemplates, setPRTemplates] = useState<PRTemplate[]>([]);
  const [pairTemplates, setPairTemplates] = useState<PairTemplate[]>([]);

  // Mode state
  const [appMode, setAppMode] = useState<AppMode>('quickdraw_badge');
  const [autoMerge, setAutoMerge] = useState(true);
  const [mergeMethod, setMergeMethod] = useState<MergeMethod>('merge');
  const [deleteBranchAfterMerge, setDeleteBranchAfterMerge] = useState(true);
  const [coAuthors, setCoAuthors] = useState<CoAuthor[]>([{ name: '', email: '' }]);
  const [pullSharkReviewer, setPullSharkReviewer] = useState('');

  // Progress state
  const [createdItems, setCreatedItems] = useState<CreatedItem[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [appStep, setAppStep] = useState<'welcome' | 'support' | 'features' | 'badges' | 'stars' | 'followers'>('welcome');
  const [showAuth, setShowAuth] = useState(false);
  const [delayMs, setDelayMs] = useState(400);

  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const waitWhilePaused = async () => {
    while (pauseRef.current && !cancelRef.current) await delay(200);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setRepoDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── Actions ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const oauthToken = fragment.get('oauth_token');
    const callbackError = params.get('oauth_error') || fragment.get('oauth_error');
    if (!oauthToken && !callbackError) return;
    window.history.replaceState({}, '', window.location.pathname);
    setShowAuth(true);
    if (callbackError) { setOauthError(callbackError); return; }
    setLoading(true);
    const token = oauthToken!;
    Promise.all([fetchGitHubUser(token), fetchPrimaryGitHubEmail(token)]).then(([githubUser, email]) => {
      setUser(githubUser); setUserEmail(email); setToken(token);
      fetchAllRepos(token).then(setRepos).catch(console.error);

      const localRequirementsDone = localStorage.getItem('dev_ascend_requirements_done') === 'true';
      if (localRequirementsDone) {
        setAppStep('features');
      }

      checkUserStatus(token)
        .then(status => {
          if (status.requirementsComplete || localRequirementsDone) {
            localStorage.setItem('dev_ascend_requirements_done', 'true');
            setAppStep('features');
          } else {
            setAppStep('support');
          }
        })
        .catch((err: Error) => {
          if (localRequirementsDone) {
            setAppStep('features');
          } else {
            console.error('Failed to check user status:', err);
            setAppStep('support');
          }
        });
    }).catch((err: Error) => setOauthError(err.message)).finally(() => setLoading(false));
  }, []);

  const handleConnect = () => {
    setOauthError('');
    try { window.location.assign(getGitHubOAuthUrl()); }
    catch (err) { setOauthError(err instanceof Error ? err.message : 'Unable to start GitHub OAuth.'); }
  };

  const handleSelectRepo = async (repo: GitHubRepo) => {
    setSelectedRepo(repo); setRepoDropdownOpen(false); setRepoSearch('');
    setPermissionStatus('checking'); setPermissionError(''); setCollaborators([]); setCollaboratorsLoading(true);
    try {
      const result = await testRepoPermission(token, repo.owner.login, repo.name);
      setPermissionStatus(result.canCreate ? 'ok' : 'fail');
      if (!result.canCreate) setPermissionError(result.error || 'Cannot write to this repo.');
      setCollaborators(await fetchRepoCollaborators(token, repo.owner.login, repo.name));
    } catch (err: any) {
      setPermissionStatus('fail'); setError(err.message);
    } finally { setCollaboratorsLoading(false); }
  };

  const handleCreateRepo = async () => {
    if (!newRepoName.trim()) return;
    setCreatingRepo(true);
    setError('');
    try {
      const newRepo = await createRepository(token, newRepoName.trim(), initReadme);
      setRepos(prev => [newRepo, ...prev]);
      await handleSelectRepo(newRepo);
      setNewRepoName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreatingRepo(false);
    }
  };

  const handleSwitchMode = (mode: AppMode) => {
    setAppMode(mode);
    setError('');
    if (mode === 'quickdraw_badge') {
      setQuickdrawBadgeTemplates([{ id: uid(), title: `Quickdraw Badge Update`, body: `Automated issue closure at ${new Date().toISOString()}` }]);
    } else if (mode === 'pull_shark') {
      generatePRs();
    }
  };

  const generateQuickdrawBadge = () => {
    setQuickdrawBadgeTemplates([{ id: uid(), title: `Quickdraw Badge Update`, body: `Automated issue closure at ${new Date().toISOString()}` }]);
  };

  const generateYOLOBadge = () => {
    if (!isValidEmail(coAuthors[0].email)) { setError('Enter the collaborator email associated with their GitHub account.'); return; }
    setYOLOBadgeTemplates([{
      id: uid(), title: `YOLO Badge Update`, branchName: `yolo-${Date.now()}`,
      filePath: `badges/yolo.md`, fileContent: `# YOLO Badge\nGenerated at ${new Date().toISOString()}`,
      coAuthors: [coAuthors[0]]
    }]);
  };

  const generatePRs = () => {
    setPRTemplates([{
      id: uid(), 
      title: `Pull Shark Achievement`,
      branchName: `pull-shark-${Date.now()}`,
      body: `Contribution to Pull Shark achievement.`, 
      filePath: `README.md`,
      fileContent: ''
    }]);
  };

  const addCoAuthor = () => setCoAuthors(prev => [...prev, { name: '', email: '' }]);
  const removeCoAuthor = (idx: number) => setCoAuthors(prev => prev.filter((_, i) => i !== idx));
  const updateCoAuthor = (idx: number, field: keyof CoAuthor, value: string) => setCoAuthors(prev => prev.map((ca, i) => i === idx ? { ...ca, [field]: value } : ca));
  const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const generatePairTemplates = () => {
    const valid = coAuthors.filter(ca => ca.name && ca.email);
    if (valid.length === 0 || valid.some(ca => !isValidEmail(ca.email))) { 
      setError('Every collaborator needs a valid email associated with their GitHub account.'); 
      return; 
    }
    setError('');
    setPairTemplates([{
      id: uid(), title: `Pair Session #1`, branchName: `pair-1-${Date.now()}`,
      body: `Co-authored session with ${valid.length} collaborator(s).\n\nIMPORTANT: For Pair Extraordinaire badge, the co-author email must be registered in their GitHub account settings.`, 
      coAuthors: valid,
      files: [{ path: `pair/session-${Date.now()}.md`, content: `# Pair Programming Session\n\nParticipants: ${valid.map(ca => ca.name).join(', ')}\nCreated: ${new Date().toISOString()}\n\nPair session for Pair Extraordinaire achievement.` }]
    }]);
  };

  const commitAuthor = user && userEmail ? { name: user.login, email: userEmail } : undefined;

  // ── Workflows ──
  const startQuickdrawBadgeWorkflow = async () => {
    if (!selectedRepo || quickdrawBadgeTemplates.length === 0) return;
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true); setError('');
    const items: CreatedItem[] = quickdrawBadgeTemplates.map(t => ({ id: t.id, title: t.title, type: 'quickdraw_badge', status: 'pending' }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name;
    try {
      const t = quickdrawBadgeTemplates[0];
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'creating', substatus: 'Opening Issue...' } : ci));
      const issue = await createIssue(token, owner, repo, t.title, t.body, []);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merging', substatus: 'Closing Issue...', url: issue.html_url, number: issue.number } : ci));
      await delay(2000);
      await closeIssue(token, owner, repo, issue.number);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merged', merged: true, substatus: undefined } : ci));
    } catch (err: any) {
      setCreatedItems(prev => prev.map(ci => ({ ...ci, status: 'error', error: err.message })));
    }
    setIsCreating(false); setStep(4);
  };

  const startYOLOBadgeWorkflow = async () => {
    if (!selectedRepo || yoloBadgeTemplates.length === 0) return;
    if (selectedRepo.private) { setError('YOLO Achievement requires a PUBLIC repository.'); return; }
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true); setError('');
    const items: CreatedItem[] = yoloBadgeTemplates.map(t => ({ id: t.id, title: t.title, type: 'yolo_badge', status: 'pending' }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const baseBranch = selectedRepo.default_branch;
    try {
      const baseSHA = await getDefaultBranchSHA(token, owner, repo, baseBranch);
      const t = yoloBadgeTemplates[0];
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
      await createBranch(token, owner, repo, t.branchName, baseSHA);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Committing with Co-author...' } : ci));
      await createMultiFileCommitWithCoAuthors(token, owner, repo, t.branchName, [{ path: t.filePath, content: t.fileContent }], t.title, t.coAuthors, commitAuthor);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Opening Pull Request...' } : ci));
      const pr = await createPullRequest(token, owner, repo, t.title, 'YOLO flow — instant merge.', t.branchName, baseBranch);
      const reviewer = t.coAuthors[0].name.trim();
      if (reviewer) {
        setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: `Requesting review from @${reviewer}...` } : ci));
        await requestPRReview(token, owner, repo, pr.number, [reviewer]);
        await delay(2000);
      }
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merging', substatus: 'Checking mergeability...', url: pr.html_url, number: pr.number } : ci));
      const mergeState = await waitForMergeable(token, owner, repo, pr.number, 45, 1000);
      if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) throw new Error(`PR #${pr.number} cannot be merged: ${mergeState.mergeable_state}.`);
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, substatus: 'Merging instantly...' } : ci));
      const mergeResult = await mergePullRequest(token, owner, repo, pr.number, 'merge', 3);
      if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${pr.number}.`);
      await verifyMergedPullRequest(token, owner, repo, pr.number);
      try { await deleteBranch(token, owner, repo, t.branchName); } catch {}
      setCreatedItems(prev => prev.map(ci => ci.id === t.id ? { ...ci, status: 'merged', merged: true, substatus: undefined } : ci));
    } catch (err: any) {
      setCreatedItems(prev => prev.map(ci => ({ ...ci, status: 'error', error: err.message })));
    }
    setIsCreating(false); setStep(4);
  };

  const startCreatingPRs = async () => {
    if (!selectedRepo) return;
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true); setError('');
    const items: CreatedItem[] = [];
    setCreatedItems(items);

    try {
      for (let repoNum = 1; repoNum <= 2; repoNum++) {
        const repoName = `pull-shark-repo-${repoNum}-${Date.now()}`;
        const itemId = `pull-shark-${repoNum}-${Date.now()}`;
        const item: CreatedItem = {
          id: itemId,
          title: `Pull Shark - Repository ${repoNum}`,
          type: 'pull_shark',
          status: 'pending',
          branchName: `feature-${repoNum}`
        };
        setCreatedItems(prev => [...prev, item]);

        try {
          setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, status: 'creating', substatus: 'Creating repository...' } : ci));
          const newRepo = await createRepository(token, repoName, true);
          const owner = newRepo.owner.login;
          let baseSHA = await getDefaultBranchSHA(token, owner, newRepo.name, newRepo.default_branch);
          const base = newRepo.default_branch;

          setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, substatus: 'Creating branch...' } : ci));
          await createBranch(token, owner, newRepo.name, `feature-${repoNum}`, baseSHA);

          setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, substatus: 'Modifying README...' } : ci));
          const currentContent = await getFileContent(token, owner, newRepo.name, 'README.md', base);
          const newContent = currentContent + `\n\n<!-- Pull Shark Achievement PR ${repoNum} -->\nUpdated at ${new Date().toISOString()}`;
          await createFileOnBranch(token, owner, newRepo.name, `feature-${repoNum}`, 'README.md', newContent, `Update README for Pull Shark ${repoNum}`, commitAuthor);

          setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, substatus: 'Creating PR...' } : ci));
          const pr = await createPullRequest(token, owner, newRepo.name, `Pull Shark Achievement PR ${repoNum}`, `Contribution to Pull Shark achievement. Repository #${repoNum}.`, `feature-${repoNum}`, base);

          const reviewer = pullSharkReviewer.trim();
          if (reviewer) {
            setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, substatus: `Requesting review...` } : ci));
            try { await requestPRReview(token, owner, newRepo.name, pr.number, [reviewer]); await delay(2000); } catch (e) {}
          }

          if (autoMerge) {
            setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, status: 'merging', substatus: 'Checking mergeability...' } : ci));
            const mergeState = await waitForMergeable(token, owner, newRepo.name, pr.number, 45, 1000);
            if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) {
              throw new Error(`PR #${pr.number} cannot be merged: ${mergeState.mergeable_state}.`);
            }
            setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, substatus: 'Merging...' } : ci));
            const mergeResult = await mergePullRequest(token, owner, newRepo.name, pr.number, mergeMethod, 3);
            if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${pr.number}.`);
            await verifyMergedPullRequest(token, owner, newRepo.name, pr.number);
            if (deleteBranchAfterMerge) {
              try { await deleteBranch(token, owner, newRepo.name, `feature-${repoNum}`); } catch {}
            }
            setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, status: 'merged', merged: true, substatus: undefined, url: pr.html_url, number: pr.number } : ci));
          } else {
            setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, status: 'success', url: pr.html_url, number: pr.number, substatus: 'PR opened' } : ci));
          }
        } catch (e: any) {
          setCreatedItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, status: 'error', error: e.message } : ci));
        }
        await delay(delayMs);
      }
    } catch (err: any) {
      setError(err.message);
    }
    setIsCreating(false); setStep(4);
  };

  const startCreatingPairs = async () => {
    if (!selectedRepo) return;
    const vError = validatePairConfig(coAuthors, pairTemplates); if (vError) { setError(vError); return; }
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(3); setIsCreating(true);
    const items: CreatedItem[] = pairTemplates.map(p => ({ id: p.id, title: p.title, type: 'pair_extraordinaire', status: 'pending', branchName: p.branchName }));
    setCreatedItems(items);
    const owner = selectedRepo.owner.login; const repo = selectedRepo.name; const base = selectedRepo.default_branch;
    try {
      let baseSHA = await getDefaultBranchSHA(token, owner, repo, base);
      for (let i = 0; i < pairTemplates.length; i++) {
        if (cancelRef.current) break;
        await waitWhilePaused();
        if (cancelRef.current) break;
        const pt = pairTemplates[i];
        try {
          setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'creating', substatus: 'Creating branch...' } : ci));
          await createBranch(token, owner, repo, pt.branchName, baseSHA);
          await createMultiFileCommitWithCoAuthors(token, owner, repo, pt.branchName, pt.files, pt.title, pt.coAuthors, commitAuthor);
          setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, substatus: 'Opening Pull Request...' } : ci));
          const result = await createPullRequest(token, owner, repo, pt.title, pt.body, pt.branchName, base);

          const reviewer = pt.coAuthors[0].name.trim();
          if (reviewer) {
            setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, substatus: `Requesting review from @${reviewer}...` } : ci));
            await requestPRReview(token, owner, repo, result.number, [reviewer]);
            await delay(2000);
          }

          setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merging', substatus: 'Merging...', url: result.html_url, number: result.number } : ci));
          const mergeState = await waitForMergeable(token, owner, repo, result.number, 45, 1000);
          if (!mergeState.mergeable && !mergeState.mergeable_state.includes('still calculating')) throw new Error(`PR #${result.number} cannot be merged: ${mergeState.mergeable_state}.`);
          const mergeResult = await mergePullRequest(token, owner, repo, result.number, 'merge', 3);
          if (!mergeResult.merged) throw new Error(`GitHub did not merge PR #${result.number}.`);
          await verifyMergedPullRequest(token, owner, repo, result.number);
          await verifyCoAuthorTrailer(token, owner, repo, result.number, pt.coAuthors);
          if (deleteBranchAfterMerge) try { await deleteBranch(token, owner, repo, pt.branchName); } catch {}
          setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'merged', merged: true, substatus: undefined, url: result.html_url, number: result.number } : ci));
          try { await delay(500); baseSHA = await getDefaultBranchSHAWithRetry(token, owner, repo, base, baseSHA, 3, 1000); } catch {}
        } catch (e: any) {
          setCreatedItems(prev => prev.map((ci, idx) => idx === i ? { ...ci, status: 'error', error: e.message } : ci));
        }
        await delay(delayMs);
      }
    } catch (err: any) { setError(err.message); }
    setIsCreating(false); setStep(4);
  };

  const handleStart = () => {
    if (appMode === 'quickdraw_badge') startQuickdrawBadgeWorkflow();
    else if (appMode === 'yolo_badge') startYOLOBadgeWorkflow();
    else if (appMode === 'pull_shark') startCreatingPRs();
    else if (appMode === 'pair_extraordinaire') startCreatingPairs();
  };

  const reset = () => {
    cancelRef.current = false; pauseRef.current = false; setIsPaused(false);
    setStep(selectedRepo ? 2 : 0);
    setCreatedItems([]);
    setError('');
    handleSwitchMode(appMode);
  };

  const disconnect = () => {
    cancelRef.current = true; pauseRef.current = false; setIsPaused(false);
    setStep(0); setAppStep('welcome'); setShowAuth(false); setToken(''); setUser(null); setUserEmail(null); setRepos([]); setSelectedRepo(null); setCollaborators([]); setCreatedItems([]); setError(''); setOauthError('');
  };

  const successCount = createdItems.filter(i => i.status === 'success' || i.status === 'merged').length;
  const errorCount = createdItems.filter(i => i.status === 'error').length;
  const progressPct = createdItems.length > 0 ? ((successCount + errorCount) / createdItems.length) * 100 : 0;
  const completionTitle = errorCount > 0 ? 'ATTENTION NEEDED' : 'ACTIVITY RECORDED';
  const queueCount = appMode === 'quickdraw_badge' ? quickdrawBadgeTemplates.length : appMode === 'yolo_badge' ? yoloBadgeTemplates.length : appMode === 'pull_shark' ? prTemplates.length : pairTemplates.length;
  const filteredRepos = repos.filter(r => r.full_name.toLowerCase().includes(repoSearch.toLowerCase()));

  const togglePause = () => { pauseRef.current = !pauseRef.current; setIsPaused(!isPaused); };
  const cancelCreation = () => { cancelRef.current = true; pauseRef.current = false; setIsPaused(false); };

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-black text-gray-100 selection:bg-purple-500/30 font-sans app-shell">
      {/* Background Falling GitHub Logos - Visible through all mirror blocks */}
      <div className="floating-githubs" aria-hidden="true">
        {FLOATING_GITHUB_LOGOS.map((logo, index) => (
          <Github
            key={index}
            className="floating-github"
            style={{
              left: logo.left,
              width: logo.size,
              height: logo.size,
              animationDelay: logo.delay,
              animationDuration: logo.duration,
            }}
          />
        ))}
      </div>

      <main className={cn(
        'max-w-6xl mx-auto px-4 sm:px-6 relative z-10',
        appStep === 'welcome' ? 'h-screen flex items-center justify-center overflow-hidden' : 'py-8 sm:py-12'
      )}>
        {(error || oauthError) && (
          <div className="mb-8 glass-card border border-red-500/40 p-4 flex items-start gap-4 animate-in slide-in-from-top-4 duration-300">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-200 font-medium whitespace-pre-wrap">{error || oauthError}</div>
            <button onClick={() => { setError(''); setOauthError(''); }} className="text-red-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
          </div>
        )}

        {/* WELCOME SCREEN (Centered, Mirror Get Started Button) */}
        {appStep === 'welcome' && !showAuth && (
          <div className="max-w-4xl w-full mx-auto text-center flex flex-col items-center justify-center min-w-0">
            <h2 className="welcome-title font-black leading-tight text-green-400 uppercase text-center mx-auto">DEVELOPER ASCEND</h2>
            <p className="welcome-quote italic text-gray-200 font-medium leading-relaxed max-w-2xl mx-auto mt-8">“Programs must be written for people to read, and only incidentally for machines to execute.”</p>
            <button
              onClick={() => setShowAuth(true)}
              className="mt-10 px-14 py-6 rounded-2xl glass-card bg-black/15 hover:bg-white/10 text-white font-black text-sm uppercase tracking-[0.25em] border-2 border-green-400/80 hover:border-green-400 shadow-[0_0_30px_rgba(53,255,154,0.35),inset_0_1px_2px_rgba(255,255,255,0.4)] transition-all btn-hover-effect cursor-pointer"
            >
              Get Started
            </button>
          </div>
        )}

        {/* SIGN IN VIA GITHUB (Centered, Zero Scroll, Mirror Block) */}
        {appStep === 'welcome' && showAuth && (
          <div className="max-w-md w-full mx-auto animate-in zoom-in-95 duration-300">
            <div className="glass-card p-8 sm:p-10 relative overflow-hidden border border-white/25">
              <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-5 border border-white/20">
                  <Key className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-2xl font-black text-white tracking-widest uppercase">Welcome Aboard</h3>
              </div>
              <div className="space-y-6">
                <p className="text-base text-gray-300 leading-relaxed text-center">
                  Sign in securely with GitHub OAuth. Developer Ascend never asks you to paste or manage personal access tokens.
                </p>
                <button
                  onClick={handleConnect}
                  disabled={loading}
                  className="w-full py-5 rounded-2xl glass-card bg-black/20 hover:bg-white/10 text-white font-black text-xs uppercase tracking-widest border border-green-400/60 hover:border-green-400 transition-all flex items-center justify-center gap-3 shadow-[0_0_20px_rgba(53,255,154,0.2)] disabled:opacity-50 cursor-pointer"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin text-green-400" /> : <Github className="w-5 h-5 text-green-400" />}
                  {loading ? 'CONNECTING...' : 'SIGN IN VIA GITHUB'}
                  <ExternalLink className="w-4 h-4 text-green-400" />
                </button>
                <button
                  onClick={() => setShowAuth(false)}
                  className="w-full py-2 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-white transition-colors text-center cursor-pointer"
                >
                  Back to welcome
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SUPPORT PROJECT (Stars Repositories) */}
        {appStep === 'support' && token && (
          <SupportProject token={token} onComplete={() => setAppStep('features')} />
        )}

        {/* FEATURE SELECTION (Dashboard - Centered in Middle) */}
        {appStep === 'features' && (
          <div className="min-h-[78vh] flex flex-col justify-center items-center">
            <FeatureSelection onSelectFeature={(feature) => {
              if (feature === 'badges') {
                setAppStep('badges');
                setStep(1);
              } else if (feature === 'stars') {
                setAppStep('stars');
              } else if (feature === 'followers') {
                setAppStep('followers');
              }
            }} />
          </div>
        )}

        {/* INCREASE STARS */}
        {appStep === 'stars' && token && user && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setAppStep('features')}
              aria-label="Back to features"
              title="Back to features"
              className="mb-8 p-3 glass-card border border-white/25 text-gray-300 hover:text-white transition-all flex items-center gap-2 text-sm font-bold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
            <IncreaseStars token={token} user={user} repos={repos} />
          </div>
        )}

        {/* INCREASE FOLLOWERS */}
        {appStep === 'followers' && token && user && (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => setAppStep('features')}
              aria-label="Back to features"
              title="Back to features"
              className="mb-8 p-3 glass-card border border-white/25 text-gray-300 hover:text-white transition-all flex items-center gap-2 text-sm font-bold cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </button>
            <IncreaseFollowers token={token} user={user} />
          </div>
        )}

        {/* BADGES STEP 1: REPOSITORY MANAGEMENT (Mirror Card) */}
        {appStep === 'badges' && step === 1 && (
          <div className="max-w-3xl mx-auto staggered-list text-center">
            <div className="flex justify-between items-center gap-3 mb-6">
              <button
                onClick={() => setAppStep('features')}
                aria-label="Back to features"
                title="Back to features"
                className="p-3 glass-card border border-white/25 text-gray-300 hover:text-white transition-all flex items-center gap-2 text-sm font-bold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Back to Dashboard
              </button>
              <button onClick={disconnect} className="px-4 py-2 rounded-xl glass-card border border-white/20 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-red-400 transition-all cursor-pointer">Log out</button>
            </div>

            <div className="glass-card p-6 sm:p-10 lg:p-12 relative overflow-visible border border-white/25">
              <div className="flex items-center gap-5 mb-10 text-left">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/20 shrink-0">
                  <Globe className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white">SELECT REPOSITORY</h2>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">Choose an existing repository or create a new public one</p>
                </div>
              </div>

              {/* Browse Repositories Dropdown */}
              <div className="relative mb-8 text-left" ref={dropdownRef}>
                <label className="text-xs font-black uppercase tracking-widest text-gray-300 mb-2 block">
                  Select Existing Repository
                </label>
                <div
                  onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                  className="w-full glass-card border border-white/25 rounded-2xl px-6 py-5 text-base cursor-pointer flex items-center justify-between hover:border-white/40 transition-all font-bold"
                >
                  <span className={cn('min-w-0 break-all', selectedRepo ? 'text-white' : 'text-gray-400')}>
                    {selectedRepo ? selectedRepo.full_name : 'Browse available repositories...'}
                  </span>
                  <ChevronDown className={cn('w-5 h-5 text-gray-400 transition-transform', repoDropdownOpen && 'rotate-180')} />
                </div>

                {repoDropdownOpen && (
                  <div className="repo-menu absolute top-full left-0 right-0 mt-2 glass-card shadow-2xl z-50 overflow-hidden animate-in fade-in duration-200">
                    <div className="p-3 border-b border-white/10 bg-white/5">
                      <input
                        type="text"
                        autoFocus
                        value={repoSearch}
                        onChange={e => setRepoSearch(e.target.value)}
                        placeholder="Search your repositories..."
                        className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-3 text-base text-white focus:outline-none placeholder:text-gray-500"
                      />
                    </div>
                    <div className="repo-list max-h-[min(55vh,500px)] overflow-y-auto overscroll-contain">
                      {filteredRepos.length === 0 && (
                        <div className="px-6 py-8 text-center text-sm font-bold text-gray-500">No repositories found</div>
                      )}
                      {filteredRepos.map(r => (
                        <div
                          key={r.id}
                          onClick={() => handleSelectRepo(r)}
                          className="px-6 py-4 hover:bg-white/10 cursor-pointer flex items-center justify-between border-b border-white/5 last:border-0"
                        >
                          <div className="flex items-center gap-3">
                            <img src={r.owner.avatar_url} alt="" className="w-6 h-6 rounded-md" />
                            <span className="text-sm font-bold text-gray-200">{r.name}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {r.private && <Lock className="w-4 h-4 text-amber-500" />}
                            <span className="text-xs font-black text-gray-400 font-mono">{r.stargazers_count} ★</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Create New Repository Box (With README.md option) */}
              <div className="mb-8 p-6 glass-card border border-white/20 text-left">
                <p className="text-xs font-black uppercase tracking-widest text-gray-300 mb-3">
                  Or Create a New Public Repository
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 mb-3">
                  <input
                    type="text"
                    value={newRepoName}
                    onChange={e => setNewRepoName(e.target.value)}
                    placeholder="e.g. badges-playground"
                    className="w-full sm:flex-1 bg-black/40 border border-white/25 px-4 py-3 text-sm text-white focus:border-green-400 outline-none"
                  />
                  <button
                    onClick={handleCreateRepo}
                    disabled={creatingRepo || !newRepoName.trim()}
                    className="w-full sm:w-auto px-6 py-3 glass-card border border-white/25 text-xs font-black uppercase tracking-widest text-white hover:border-green-400/70 hover:bg-white/10 transition-all flex items-center justify-center min-w-[130px] disabled:opacity-40 cursor-pointer"
                  >
                    {creatingRepo ? <Loader2 className="w-4 h-4 animate-spin text-green-400" /> : 'CREATE REPO'}
                  </button>
                </div>
                {/* Ask whether to initialize with README */}
                <div className="flex items-center gap-2 mt-3">
                  <input
                    type="checkbox"
                    id="initReadmeCheckbox"
                    checked={initReadme}
                    onChange={e => setInitReadme(e.target.checked)}
                    className="w-4 h-4 accent-green-400 cursor-pointer"
                  />
                  <label htmlFor="initReadmeCheckbox" className="text-sm text-gray-300 cursor-pointer select-none">
                    Initialize repository with <code className="text-green-400 font-mono">README.md</code> (Recommended)
                  </label>
                </div>
              </div>

              {selectedRepo && (
                <div className="mb-8 grid grid-cols-2 gap-4 text-left animate-in fade-in duration-300">
                  <div className="p-4 glass-card border border-white/20">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Visibility</div>
                    <div className="text-sm font-bold text-gray-200 flex items-center gap-2">
                      {selectedRepo.private ? <ShieldAlert className="w-4 h-4 text-amber-500" /> : <Globe className="w-4 h-4 text-green-400" />}
                      {selectedRepo.private ? 'PRIVATE' : 'PUBLIC'}
                    </div>
                  </div>
                  <div className="p-4 glass-card border border-white/20">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Branch</div>
                    <div className="text-sm font-bold text-gray-200 flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-blue-400" /> {selectedRepo.default_branch}
                    </div>
                  </div>
                </div>
              )}

              {permissionError && (
                <div className="mb-8 border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                  {permissionError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAppStep('features')}
                  className="py-4 glass-card border border-white/25 text-gray-300 font-black text-xs uppercase tracking-widest hover:text-white transition-all cursor-pointer"
                >
                  BACK
                </button>
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedRepo || permissionStatus !== 'ok'}
                  className={cn(
                    'py-4 font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer',
                    !selectedRepo || permissionStatus !== 'ok'
                      ? 'bg-white/5 border border-white/5 text-gray-600 cursor-not-allowed'
                      : 'premium-gradient-green text-gray-950 shadow-xl'
                  )}
                >
                  CONTINUE TO BADGES <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BADGES STEP 2: WORKSPACE (Mirror Cards, High Readability) */}
        {appStep === 'badges' && step === 2 && selectedRepo && (
          <div className="max-w-5xl mx-auto space-y-8 text-center animate-in fade-in duration-300">
            {/* Header with Navigation */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                aria-label="Back to repository selection"
                title="Back to repository"
                className="p-3 glass-card border border-white/25 text-gray-300 hover:text-white transition-all flex items-center gap-2 text-sm font-bold cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" /> Change Repository
              </button>
              <span className="text-sm font-mono text-gray-300">
                Target: <strong className="text-white">{selectedRepo.full_name}</strong>
              </span>
              <button onClick={disconnect} className="px-4 py-2 rounded-xl glass-card border border-white/20 text-xs font-black uppercase tracking-widest text-gray-400 hover:text-red-400 transition-all cursor-pointer">Log out</button>
            </div>

            {/* Badge Mode Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { id: 'quickdraw_badge', label: 'QuickDraw', icon: Sparkles },
                { id: 'yolo_badge', label: 'YOLO Badge', icon: Rocket },
                { id: 'pull_shark', label: 'Pull Shark', icon: GitPullRequest },
                { id: 'pair_extraordinaire', label: 'Pair Extraordinaire', icon: Award }
              ].map(mode => (
                <button
                  key={mode.id}
                  onClick={() => handleSwitchMode(mode.id as any)}
                  className={cn(
                    "p-4 text-xs font-black uppercase tracking-wider transition-all border flex items-center justify-center gap-2 shadow-lg cursor-pointer",
                    appMode === mode.id
                      ? "bg-white text-gray-950 border-white shadow-xl scale-[1.02]"
                      : "glass-card border-white/20 text-gray-300 hover:text-white hover:border-white/40"
                  )}
                >
                  <mode.icon className="w-5 h-5" /> {mode.label}
                </button>
              ))}
            </div>

            {/* Main Badge Workspace Card */}
            <div className="grid lg:grid-cols-2 gap-8 items-start">
              {/* Left Column: Distinct Badge Graphic & Timing Notice */}
              <div className="glass-card p-8 sm:p-10 flex flex-col items-center justify-center text-center border border-white/25">
                <img
                  src={badgeAssets[appMode]}
                  alt={`${modeLabels[appMode]} badge`}
                  className="badge-reference"
                />
                <h3 className="text-3xl font-black text-white mb-3 uppercase tracking-tight">
                  {modeLabels[appMode]}
                </h3>
                <p className="text-sm sm:text-base text-gray-300 font-medium leading-relaxed max-w-sm mb-6">
                  {modeDescriptions[appMode]}
                </p>

                {/* Achievement Calculation Notice */}
                <div className="w-full p-4 glass-card border border-purple-500/40 text-purple-200 text-sm flex items-center gap-3 text-left">
                  <Clock className="w-6 h-6 shrink-0 text-purple-400" />
                  <div>
                    <strong className="block font-bold">Calculation Processing Notice:</strong>
                    <span>GitHub achievement calculations take approximately 2 to 5 minutes to reflect on your public profile.</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Numbered Step-by-Step Workflow */}
              <div className="glass-card p-8 sm:p-10 space-y-6 flex flex-col h-full items-start border border-white/25 text-left">
                {/* Step Indicators Header */}
                <div className="w-full flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-green-400">
                    <span className="w-7 h-7 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center text-xs">1</span>
                    Configure
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-gray-300">
                    <span className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs">2</span>
                    Queue: {queueCount}
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-500" />
                  <div className="flex items-center gap-2 text-sm font-black uppercase tracking-widest text-purple-400">
                    <span className="w-7 h-7 rounded-full bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-xs">3</span>
                    Execute
                  </div>
                </div>

                <div className="w-full flex-1 space-y-5">
                  {/* QUICKDRAW MODE */}
                  {appMode === 'quickdraw_badge' && (
                    <div className="space-y-5 w-full">
                      <div className="p-4 glass-card border border-purple-500/30 text-sm text-purple-200 leading-relaxed font-bold">
                        Step 1: Click "Initialize Node" to prepare an automated issue creation and swift closure trigger.
                      </div>
                      <button
                        onClick={generateQuickdrawBadge}
                        className="w-full py-4 premium-gradient-purple text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl cursor-pointer"
                      >
                        INITIALIZE NODE
                      </button>
                    </div>
                  )}

                  {/* YOLO BADGE MODE */}
                  {appMode === 'yolo_badge' && (
                    <div className="space-y-4 w-full">
                      <div className="p-4 glass-card border border-orange-500/30 text-sm text-orange-200 leading-relaxed font-bold">
                        Step 1: Select a collaborator and their verified Git email for the commit trailer.
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-xs font-black text-gray-300 uppercase tracking-widest block mb-1">Reviewer Collaborator</label>
                          <select
                            value={coAuthors[0].name}
                            onChange={e => updateCoAuthor(0, 'name', e.target.value)}
                            disabled={collaboratorsLoading || collaborators.length === 0}
                            className="w-full glass-card border border-white/20 px-4 py-3 text-sm text-white"
                          >
                            <option value="">{collaboratorsLoading ? 'Loading collaborators...' : collaborators.length ? 'Select collaborator' : 'No collaborators found'}</option>
                            {collaborators.map(c => <option key={c.id} value={c.login}>{c.login}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-black text-gray-300 uppercase tracking-widest block mb-1">Git Email Address</label>
                          <input
                            value={coAuthors[0].email}
                            onChange={e => updateCoAuthor(0, 'email', e.target.value)}
                            placeholder="collaborator-github-email@example.com"
                            className="w-full glass-card border border-white/20 px-4 py-3 text-sm text-white"
                          />
                        </div>
                      </div>
                      <button
                        onClick={generateYOLOBadge}
                        disabled={!coAuthors[0].name || !isValidEmail(coAuthors[0].email)}
                        className="w-full py-4 bg-gradient-to-r from-red-600 to-orange-600 text-white font-black text-xs uppercase tracking-[0.2em] shadow-xl disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        BUILD YOLO FLOW
                      </button>
                    </div>
                  )}

                  {/* PULL SHARK MODE */}
                  {appMode === 'pull_shark' && (
                    <div className="space-y-4 w-full">
                      <div className="p-4 glass-card border border-green-500/30 text-sm text-green-200 leading-relaxed font-bold">
                        Step 1: Prepares 2 dedicated repositories and authentic pull requests to fulfill Pull Shark requirements.
                      </div>
                      <div>
                        <label className="text-xs font-black text-gray-300 uppercase tracking-widest block mb-1">Optional Reviewer</label>
                        <select
                          value={pullSharkReviewer}
                          onChange={e => setPullSharkReviewer(e.target.value)}
                          disabled={collaboratorsLoading || collaborators.length === 0}
                          className="w-full glass-card border border-white/20 px-4 py-3 text-sm text-white"
                        >
                          <option value="">None (Self-managed pull request)</option>
                          {collaborators.map(c => <option key={c.id} value={c.login}>{c.login}</option>)}
                        </select>
                      </div>
                      <button
                        onClick={() => setAutoMerge(!autoMerge)}
                        className="w-full py-3 text-xs font-black uppercase tracking-widest glass-card border border-white/20 text-gray-300 cursor-pointer"
                      >
                        AUTO-MERGE: {autoMerge ? 'ENABLED' : 'MANUAL'}
                      </button>
                      <button
                        onClick={generatePRs}
                        className="w-full py-4 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest cursor-pointer"
                      >
                        GENERATE PULL REQUEST QUEUE
                      </button>
                    </div>
                  )}

                  {/* PAIR EXTRAORDINAIRE MODE */}
                  {appMode === 'pair_extraordinaire' && (
                    <div className="space-y-4 w-full">
                      <div className="p-4 glass-card border border-amber-500/30 text-sm text-amber-200 leading-relaxed font-bold">
                        Step 1: Add recognized collaborators with their verified GitHub email for co-authored git commits.
                      </div>
                      {coAuthors.map((ca, i) => (
                        <div key={i} className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={ca.name}
                            onChange={e => updateCoAuthor(i, 'name', e.target.value)}
                            disabled={collaboratorsLoading || collaborators.length === 0}
                            className="flex-1 glass-card border border-white/20 px-3 py-2 text-sm text-white"
                          >
                            <option value="">Select collaborator</option>
                            {collaborators.map(c => <option key={c.id} value={c.login}>{c.login}</option>)}
                          </select>
                          <input
                            value={ca.email}
                            onChange={e => updateCoAuthor(i, 'email', e.target.value)}
                            placeholder="collaborator-email@example.com"
                            className="flex-1 glass-card border border-white/20 px-3 py-2 text-sm text-white"
                          />
                          <button onClick={() => removeCoAuthor(i)} className="px-2 text-red-400 hover:text-white cursor-pointer">
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      ))}
                      <button onClick={addCoAuthor} className="w-full py-2 text-xs font-black uppercase text-gray-300 hover:text-white glass-card border border-dashed border-white/25 cursor-pointer">
                        + Add Collaborator
                      </button>
                      <button
                        onClick={generatePairTemplates}
                        disabled={coAuthors.length === 0 || coAuthors.some(ca => !ca.name || !isValidEmail(ca.email))}
                        className="w-full py-4 premium-gradient-purple text-white font-black text-xs uppercase tracking-[0.2em] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                      >
                        INITIALIZE PAIR SESSION
                      </button>
                    </div>
                  )}
                </div>

                {/* Step 3: Execution Bar */}
                <div className="w-full pt-6 mt-auto border-t border-white/10 flex items-center justify-between">
                  <div className="text-sm font-mono text-gray-300">
                    Queue: <strong className="text-white">{queueCount}</strong> items ready
                  </div>
                  <button
                    onClick={handleStart}
                    disabled={queueCount === 0}
                    className="px-10 py-4 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest shadow-2xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" /> EXECUTE WORKFLOW
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BADGES STEP 3 & 4: EXECUTION PROGRESS & COMPLETION */}
        {appStep === 'badges' && (step === 3 || step === 4) && (
          <div className="max-w-4xl mx-auto space-y-8 text-center animate-in fade-in duration-300">
            <div className="glass-card p-8 sm:p-12 relative overflow-hidden border border-white/25">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-5 text-left">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/20">
                    {step === 4 ? <CheckCircle2 className="w-9 h-9 text-green-400" /> : <Loader2 className="w-9 h-9 text-green-400 animate-spin" />}
                  </div>
                  <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {step === 4 ? completionTitle : 'EXECUTING WORKFLOW'}
                    </h2>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mt-1">
                      {step === 4 ? `${successCount} completed, ${errorCount} failed` : 'Automated achievement triggers in progress'}
                    </p>
                  </div>
                </div>
                {step === 3 && (
                  <div className="flex gap-2">
                    <button onClick={togglePause} className="p-3 glass-card border border-white/20 text-gray-300 hover:text-white cursor-pointer">
                      {isPaused ? <Play className="w-5 h-5 text-green-400" /> : <Pause className="w-5 h-5 text-amber-400" />}
                    </button>
                    <button onClick={cancelCreation} className="p-3 glass-card border border-white/20 text-red-400 hover:text-white cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div className="h-4 bg-black/60 border border-white/15 p-0.5 mb-8 overflow-hidden relative">
                <div
                  className="h-full premium-gradient-green transition-all duration-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              {/* Items List */}
              <div className="space-y-3 text-left">
                {createdItems.map((item, i) => (
                  <div key={item.id} className="p-4 glass-card border border-white/20 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-gray-400">#{i + 1}</span>
                      <span className="text-sm font-bold text-gray-200">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-xs font-black uppercase tracking-wider font-mono",
                        item.status === 'merged' ? 'text-green-400' : item.status === 'error' ? 'text-red-400' : 'text-gray-400'
                      )}>
                        {item.substatus || item.status}
                      </span>
                      {item.error && <span className="max-w-xs text-right text-xs text-red-300/80 truncate">{item.error}</span>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noreferrer" className="p-2 glass-card hover:text-white text-gray-400">
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {step === 4 && (
                <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={reset}
                    className="py-4 px-8 bg-white text-gray-950 font-black text-xs uppercase tracking-widest shadow-xl hover:bg-green-400 transition-all cursor-pointer"
                  >
                    START ANOTHER BATCH
                  </button>
                  <button
                    onClick={() => setAppStep('features')}
                    className="py-4 px-8 glass-card border border-white/25 text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all cursor-pointer"
                  >
                    BACK TO DASHBOARD
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer ONLY visible when outside welcome screen */}
      {appStep !== 'welcome' && (
        <footer className="py-12 text-center opacity-30">
          <p className="text-xs font-black uppercase tracking-[0.4em] text-gray-500">&copy; {new Date().getFullYear()} Developer Ascend</p>
        </footer>
      )}
    </div>
  );
}
