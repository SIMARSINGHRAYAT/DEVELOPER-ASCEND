import { useEffect, useState } from 'react';
import { ArrowRight, ExternalLink, Heart, Loader2, Trophy, UserPlus, X } from 'lucide-react';

interface ProfileCard {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  bio: string | null;
  profileUrl: string;
  followersCount: number;
}

interface IncreaseFollowersProps {
  token: string;
  user: { login: string; avatar_url: string };
}

export function IncreaseFollowers({ token }: IncreaseFollowersProps) {
  const [profiles, setProfiles] = useState<ProfileCard[]>([]);
  const [followsUsed, setFollowsUsed] = useState(0);
  const [followsRemaining, setFollowsRemaining] = useState(10);
  const [receivedLeaderboard, setReceivedLeaderboard] = useState<any[]>([]);
  const [activityLeaderboard, setActivityLeaderboard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = profiles[0];

  const MAX_FOLLOWS_DAILY = 10;

  const load = async () => {
    try {
      const response = await fetch('/api/followers', { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to load profiles');
      setProfiles(data.profiles || []);
      setFollowsUsed(data.followsUsed || 0);
      setFollowsRemaining(data.followsRemaining ?? MAX_FOLLOWS_DAILY);
      setReceivedLeaderboard(data.receivedLeaderboard || []);
      setActivityLeaderboard(data.activityLeaderboard || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const interact = async (action: 'follow' | 'skip') => {
    if (!current || (action === 'follow' && followsRemaining <= 0)) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/followers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, profileId: current.id })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not process this profile.');
      setProfiles(items => items.slice(1));
      if (action === 'follow') {
        setFollowsUsed(data.followsUsed);
        setFollowsRemaining(data.followsRemaining);
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
        <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Increase Followers</h2>
        <p className="text-base text-gray-400 mt-2">
          Discover and follow authentic developers in the Developer Ascend community.
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-300 text-sm text-center font-medium backdrop-blur-xl">
          {error}
        </div>
      )}

      {/* Discovery Feed Card */}
      <section className="glass-card p-6 sm:p-10 max-w-3xl mx-auto bg-black/40 backdrop-blur-xl border border-white/10">
        <div className="flex flex-wrap justify-between items-center gap-4 border-b border-white/10 pb-5 mb-8">
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-widest">Community Profile Discovery</h3>
            <p className="text-xs text-gray-400 mt-1">One developer profile at a time</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Daily Limit (24h IST)</p>
            <p className="text-xl font-black text-blue-400 mt-0.5">{followsUsed} / {MAX_FOLLOWS_DAILY}</p>
            <p className="text-[10px] text-gray-500">Remaining: {followsRemaining}</p>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
          </div>
        ) : !current ? (
          <div className="py-16 text-center">
            <UserPlus className="w-14 h-14 text-gray-600 mx-auto mb-4 opacity-50" />
            <p className="text-base font-bold text-gray-300">No new profiles are currently available for discovery.</p>
            <p className="text-xs text-gray-500 mt-2">Check back later as more developers sign in.</p>
          </div>
        ) : (
          <div className="border border-blue-400/20 bg-black/50 p-8 text-center backdrop-blur-md">
            <img
              src={current.avatarUrl || ''}
              alt={current.username}
              className="w-24 h-24 mx-auto border-2 border-blue-400/40 rounded-2xl shadow-xl"
            />
            <p className="text-2xl font-black text-white mt-5">{current.name || current.username}</p>
            <p className="text-sm text-blue-400 mt-1 font-mono">@{current.username}</p>
            {current.bio && (
              <p className="text-xs text-gray-300 leading-relaxed mt-4 max-w-lg mx-auto">
                {current.bio}
              </p>
            )}
            <p className="text-xs text-gray-400 mt-4 font-mono">Followers: <strong className="text-white">{current.followersCount}</strong></p>
            <a
              href={current.profileUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-xs text-blue-400 mt-4 hover:underline"
            >
              View GitHub Profile <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <div className="grid grid-cols-2 gap-4 mt-8">
              <button
                onClick={() => interact('skip')}
                disabled={busy}
                className="py-4 border border-white/15 bg-white/5 hover:bg-white/10 text-gray-300 font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
              >
                <X className="w-4 h-4" /> Skip
              </button>
              <button
                onClick={() => interact('follow')}
                disabled={busy || followsRemaining <= 0}
                className="py-4 premium-gradient-green text-gray-950 font-black text-xs uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2 transition-all shadow-lg"
              >
                <Heart className="w-4 h-4 fill-current" /> Follow ({followsRemaining} left) <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {followsRemaining <= 0 && (
              <p className="text-xs text-red-400 mt-4 font-bold">
                Daily follow limit of {MAX_FOLLOWS_DAILY} reached. Resets in 24 hours (IST).
              </p>
            )}
          </div>
        )}
      </section>

      {/* Leaderboards (Top 10 each) */}
      <div className="grid lg:grid-cols-2 gap-8">
        <section className="glass-card p-6 bg-black/40 backdrop-blur-xl border border-white/10">
          <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
            <Trophy className="w-5 h-5 text-yellow-400" /> Top 10 Followers Received
          </h3>
          <div className="space-y-2">
            {receivedLeaderboard.length === 0 ? (
              <p className="text-xs text-gray-500 py-3 text-center">No entries yet.</p>
            ) : (
              receivedLeaderboard.slice(0, 10).map((entry, index) => (
                <div key={entry.username + index} className="p-3 bg-black/50 border border-white/10 flex justify-between items-center text-xs">
                  <span className="text-white font-bold flex items-center gap-2">
                    <span className={index === 0 ? 'text-yellow-400' : 'text-gray-500'}>#{index + 1}</span>
                    @{entry.username}
                  </span>
                  <span className="text-blue-400 font-mono font-bold">+{entry.followersReceived} follows</span>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-card p-6 bg-black/40 backdrop-blur-xl border border-white/10">
          <h3 className="text-base font-black text-white uppercase tracking-widest flex items-center gap-3 border-b border-white/10 pb-4 mb-4">
            <Trophy className="w-5 h-5 text-yellow-400" /> Top 10 Most Active Followers
          </h3>
          <div className="space-y-2">
            {activityLeaderboard.length === 0 ? (
              <p className="text-xs text-gray-500 py-3 text-center">No entries yet.</p>
            ) : (
              activityLeaderboard.slice(0, 10).map((entry, index) => (
                <div key={entry.username + index} className="p-3 bg-black/50 border border-white/10 flex justify-between items-center text-xs">
                  <span className="text-white font-bold flex items-center gap-2">
                    <span className={index === 0 ? 'text-yellow-400' : 'text-gray-500'}>#{index + 1}</span>
                    @{entry.username}
                  </span>
                  <span className="text-green-400 font-mono font-bold">{entry.profilesFollowed} followed</span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
