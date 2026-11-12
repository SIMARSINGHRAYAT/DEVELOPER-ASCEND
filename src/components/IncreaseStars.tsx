import { useEffect, useMemo, useState } from 'react';
import type { GitHubRepo } from '../types';
import { ArrowRight, ExternalLink, Loader2, Pencil, Plus, Star, Trash2, Trophy, X, ShieldAlert } from 'lucide-react';

interface Submission {
  id: string;
  githubRepoId: string;
  repositoryName: string;
  repositoryOwner: string;
  repositoryUrl: string;
  repositoryAvatar?: string | null;
  githubStars: number;
  description?: string | null;
  discoveryStars: number;
}

interface IncreaseStarsProps {
  token: string;
  user: { login: string; avatar_url: string };
  repos: GitHubRepo[];
}

const wordCount = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;

export function IncreaseStars({ token, user, repos }: IncreaseStarsProps) {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [feed, setFeed] = useState<Submission[]>([]);
  const [starsUsed, setStarsUsed] = useState(0);
  const [starsRemaining, setStarsRemaining] = useState(10);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Add Repository Flow States
  const [addingRepo, setAddingRepo] = useState<GitHubRepo | null>(null);
  const [newDescription, setNewDescription] = useState('');
  const [editing, setEditing] = useState<Submission | null>(null);
  const [editDescription, setEditDescription] = useState('');

  const MAX_ACTIVE = 2;
  const MAX_STARS_DAILY = 10;

  const availableRepos = useMemo(() => 
    repos.filter(repo => !repo.private && !submissions.some(item => item.githubRepoId === String(repo.id))),
    [repos, submissions]
  );

  const current = feed[0];

  const load = async () => {
    try {
      const response = await fetch('/api/stars', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load community feed');
      setSubmissions(data.submissions || []);
      setFeed(data.feed || []);
      setStarsUsed(data.starsUsed || 0);
      setStarsRemaining(data.starsRemaining ?? MAX_STARS_DAILY);
      setLeaderboard(data.leaderboard || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load community feed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const handleSelectForAdd = (repoId: string) => {
    setError('');
    if (!repoId) return;
    if (submissions.length >= MAX_ACTIVE) {
      setError(`You have reached the maximum limit of ${MAX_ACTIVE} active repositories. Please delete one first.`);
      return;
    }
    const found = repos.find(r => String(r.id) === repoId);
    if (found) {
      setAddingRepo(found);
      setNewDescription(found.description || '');
    }
  };

  const confirmAddRepo = async () => {
    if (!addingRepo) return;
    if (wordCount(newDescription) > 50) {
      setError('Description must be 50 words or fewer.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'submit',
          repositories: [{
            ...addingRepo,
            discoveryDescription: newDescription.trim() || addingRepo.description || 'Public repository'
          }]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not submit repository.');
      setAddingRepo(null);
      setNewDescription('');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveDescription = async () => {
    if (!editing || wordCount(editDescription) > 50) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'update', submissionId: editing.id, description: editDescription })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update description.');
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteSubmission = async (submissionId: string) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'delete', submissionId })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not delete submission.');
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const interact = async (interaction: 'STAR' | 'SKIP') => {
    if (!current || (interaction === 'STAR' && starsRemaining <= 0)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/stars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: 'interact', submissionId: current.id, interaction })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not process this repository.');
      setFeed(items => items.slice(1));
      if (interaction === 'STAR') {
        setStarsUsed(data.starsUsed);
        setStarsRemaining(data.starsRemaining);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto min-w-0 space-y-8">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-black text-white uppercase tracking-tight">Increase Stars</h2>
        <p className="text-base sm:text-lg text-gray-300 mt-2">
          Star community projects to increase your own priority in the discovery feed.
        </p>
      </div>

      {error && (
        <div className="p-4 glass-card border border-red-500/30 text-red-300 text-sm text-center font-bold">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 items-start">
        {/* Left Card: My Active Repositories (Max 2) */}
        <section className="glass-card p-6 sm:p-8 border border-white/25">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-5">
            <div>
              <h3 className="text-lg font-black text-white uppercase tracking-wider">My Repositories</h3>
              <p className="text-xs text-gray-400 mt-1">Maximum 2 active submissions</p>
            </div>
            <span className={`text-xs font-black uppercase tracking-wider px-3 py-1.5 border ${submissions.length >= MAX_ACTIVE ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-green-500/20 border-green-500/40 text-green-400'}`}>
              {submissions.length} / {MAX_ACTIVE}
            </span>
          </div>

          <div className="space-y-4">
            {submissions.length === 0 && (
              <div className="p-6 text-center border border-dashed border-white/20 text-gray-400 text-sm">
                No active repositories submitted yet. Add one below to appear on the discovery feed.
              </div>
            )}
            {submissions.map(item => (
              <div key={item.id} className="p-4 glass-card border border-white/20 flex items-start gap-3">
                <Star className="w-6 h-6 text-yellow-400 mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <a href={item.repositoryUrl} target="_blank" rel="noreferrer" className="text-base sm:text-lg font-bold text-white hover:text-green-400 break-words flex items-center gap-1.5">
                    {item.repositoryOwner} / {item.repositoryName}
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                  </a>
                  <p className="text-sm text-gray-300 mt-2 break-words leading-relaxed">
                    {item.description || 'No description provided.'}
                  </p>
                  <p className="text-xs text-gray-400 mt-2 font-mono">
                    Discovery Stars: <span className="text-green-400 font-bold">{item.discoveryStars}</span> · GitHub Stars: {item.githubStars}
                  </p>
                </div>
                <button
                  onClick={() => { setEditing(item); setEditDescription(item.description || ''); }}
                  aria-label={`Edit ${item.repositoryName}`}
                  title="Edit description"
                  className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteSubmission(item.id)}
                  disabled={busy}
                  aria-label={`Delete ${item.repositoryName}`}
                  title="Delete submission"
                  className="p-2 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Add Repository Section */}
          <div className="mt-6 pt-5 border-t border-white/10 space-y-3">
            <label className="text-xs font-black text-gray-300 uppercase tracking-widest block">
              Add Repository (Max {MAX_ACTIVE})
            </label>
            {submissions.length >= MAX_ACTIVE ? (
              <div className="p-4 glass-card border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 shrink-0 text-amber-400" />
                <span>Limit reached (2/2). Delete an existing repository to add a different one.</span>
              </div>
            ) : (
              <select
                value=""
                onChange={e => handleSelectForAdd(e.target.value)}
                disabled={busy}
                className="w-full glass-card border border-white/25 px-4 py-3 text-sm text-white focus:border-green-400 outline-none transition-all cursor-pointer"
              >
                <option value="">+ Select Repository to Add...</option>
                {availableRepos.map(repo => (
                  <option key={repo.id} value={repo.id}>
                    {repo.full_name} ({repo.stargazers_count} ★)
                  </option>
                ))}
              </select>
            )}
          </div>
        </section>

        {/* Right Card: Community Discovery Feed */}
        <section className="glass-card p-6 sm:p-8 border border-white/25">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider">Community Feed</h3>
              <p className="text-xs sm:text-sm text-gray-300 mt-1">Active contributors are prioritized first</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-black text-gray-300 uppercase tracking-widest">Daily Limit (24h IST)</p>
              <p className="text-2xl font-black text-green-400 mt-0.5">{starsUsed} / {MAX_STARS_DAILY}</p>
              <p className="text-xs text-gray-400">Remaining: {starsRemaining}</p>
            </div>
          </div>

          {loading ? (
            <div className="py-20 flex justify-center">
              <Loader2 className="w-10 h-10 text-green-400 animate-spin" />
            </div>
          ) : !current ? (
            <div className="py-16 text-center">
              <Star className="w-14 h-14 text-gray-600 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-bold text-gray-300">No repositories currently queued for discovery.</p>
              <p className="text-sm text-gray-400 mt-2">Check back shortly as developers add new projects.</p>
            </div>
          ) : (
            <div className="glass-card p-6 sm:p-8 border border-green-500/30">
              <div className="flex items-start gap-4">
                <img
                  src={current.repositoryAvatar || user.avatar_url}
                  alt=""
                  className="w-16 h-16 border border-white/20 shrink-0 rounded-lg"
                />
                <div className="min-w-0 flex-1">
                  <a
                    href={current.repositoryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xl sm:text-2xl font-black text-white hover:text-green-400 break-words flex items-center gap-2"
                  >
                    {current.repositoryOwner} / {current.repositoryName}
                    <ExternalLink className="w-5 h-5 text-gray-400" />
                  </a>
                  <p className="text-sm sm:text-base text-gray-300 mt-3 leading-relaxed">
                    {current.description || 'No description provided.'}
                  </p>
                  <div className="flex items-center gap-4 text-xs sm:text-sm text-gray-400 mt-4">
                    <span>GitHub Stars: <strong className="text-white">{current.githubStars}</strong></span>
                    <span>Discovery Stars: <strong className="text-green-400">{current.discoveryStars}</strong></span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-8">
                <button
                  onClick={() => interact('SKIP')}
                  disabled={busy}
                  className="py-4 glass-card border border-white/20 hover:bg-white/10 text-gray-200 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" /> Skip
                </button>
                <button
                  onClick={() => interact('STAR')}
                  disabled={busy || starsRemaining <= 0}
                  className="py-4 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 transition-all shadow-lg cursor-pointer"
                >
                  <Star className="w-4 h-4 fill-current" /> Star ({starsRemaining} left) <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {starsRemaining <= 0 && (
                <p className="text-sm text-red-400 mt-4 text-center font-bold">
                  Daily limit of {MAX_STARS_DAILY} stars reached. Resets in 24 hours (IST).
                </p>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Repository Star Leaderboard: Top 10 */}
      <section className="glass-card p-6 sm:p-8 border border-white/25">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <h3 className="text-xl font-black text-white uppercase tracking-wider flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-400" /> Top 10 Contributors
          </h3>
          <span className="text-xs text-gray-400">Ranked by discovery stars & activity</span>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-500 col-span-full py-4 text-center">No leaderboard entries yet.</p>
          ) : (
            leaderboard.slice(0, 10).map((entry, index) => (
              <div key={entry.username} className="p-4 glass-card border border-white/15">
                <div className="flex items-center justify-between text-xs font-mono mb-2">
                  <span className={`font-black ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-amber-500' : 'text-gray-400'}`}>
                    #{index + 1}
                  </span>
                  <span className="text-xs text-green-400 font-bold">{entry.discoveryStarsReceived} ★</span>
                </div>
                <p className="text-sm sm:text-base text-white font-bold truncate">@{entry.username}</p>
                <p className="text-xs text-gray-400 mt-1">Starred: {entry.repositoriesStarred}</p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Add Repository Modal */}
      {addingRepo && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 sm:p-8 w-full max-w-lg border border-green-500/40">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Star className="w-5 h-5 text-yellow-400" /> Submit for Discovery
              </h3>
              <button onClick={() => setAddingRepo(null)} aria-label="Close" className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest">Selected Repository</p>
              <p className="text-base sm:text-lg font-bold text-white mt-1">{addingRepo.full_name}</p>
            </div>
            <div className="mb-4">
              <label className="text-xs font-black text-gray-300 uppercase tracking-widest block mb-2">
                Discovery Description (Max 50 words) *
              </label>
              <textarea
                value={newDescription}
                onChange={e => setNewDescription(e.target.value)}
                rows={4}
                placeholder="Describe what makes your project unique for other developers..."
                className="w-full glass-card border border-white/20 p-3 text-sm sm:text-base text-white focus:border-green-400 outline-none resize-none"
              />
              <div className="flex justify-between items-center mt-2 text-xs">
                <span className={wordCount(newDescription) > 50 ? 'text-red-400 font-bold' : 'text-gray-400'}>
                  {wordCount(newDescription)} / 50 words
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setAddingRepo(null)}
                className="py-3 glass-card border border-white/20 text-gray-300 font-black text-xs uppercase tracking-widest hover:text-white transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmAddRepo}
                disabled={busy || wordCount(newDescription) > 50}
                className="py-3 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm & Submit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Description Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="glass-card p-6 sm:p-8 w-full max-w-lg border border-white/30">
            <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
              <h3 className="text-lg font-black text-white uppercase tracking-wider">Edit Description</h3>
              <button onClick={() => setEditing(null)} aria-label="Close" className="text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-base font-bold text-white mb-4">{editing.repositoryOwner} / {editing.repositoryName}</p>
            <textarea
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
              rows={4}
              className="w-full glass-card border border-white/20 p-3 text-sm sm:text-base text-white focus:border-green-400 outline-none resize-none"
            />
            <p className={`text-xs mt-2 ${wordCount(editDescription) > 50 ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
              {wordCount(editDescription)} / 50 words
            </p>
            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => setEditing(null)}
                className="py-3 glass-card border border-white/20 text-gray-300 font-black text-xs uppercase tracking-widest hover:text-white transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={saveDescription}
                disabled={busy || wordCount(editDescription) > 50}
                className="py-3 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest disabled:opacity-40 cursor-pointer"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
