import React, { useEffect, useState } from 'react';
import { starRepo, followUser } from '../utils/github';
import { SUPPORT_REPOSITORIES, MAINTAINER_PROFILE } from '../config';
import { checkUserStatus } from '../utils/api';
import { Star, UserPlus, CheckCircle2, Loader2, ChevronRight, ShieldCheck } from 'lucide-react';
import { cn } from '../utils/cn';

interface SupportProjectProps {
  token: string;
  onComplete: () => void;
}

export function SupportProject({ token, onComplete }: SupportProjectProps) {
  const [isStarred, setIsStarred] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [loadingStar, setLoadingStar] = useState(false);
  const [starProgress, setStarProgress] = useState<{ current: number; total: number } | null>(null);
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let pollInterval: any;

    async function checkStatus() {
      if (!mounted) return;
      try {
        const status = await checkUserStatus(token);
        if (mounted) {
          setIsStarred(status.repositoryStarred);
          setIsFollowed(status.maintainerFollowed);
          if (status.requirementsComplete) {
            localStorage.setItem('dev_ascend_requirements_done', 'true');
            onComplete();
          }
          setChecking(false);
        }
      } catch (err: any) {
        if (mounted) {
          setError('Failed to verify GitHub status: ' + (err.message || 'Network error'));
          setChecking(false);
        }
      }
    }
    
    // Initial check
    checkStatus();

    // Poll every 5 seconds
    pollInterval = setInterval(checkStatus, 5000);

    return () => { 
      mounted = false; 
      clearInterval(pollInterval);
    };
  }, [token, onComplete]);

  const handleStarAll = async () => {
    if (isStarred || loadingStar) return;
    setLoadingStar(true);
    setError('');
    setStarProgress({ current: 0, total: SUPPORT_REPOSITORIES.length });
    try {
      for (let i = 0; i < SUPPORT_REPOSITORIES.length; i++) {
        const [owner, name] = SUPPORT_REPOSITORIES[i].split('/');
        await starRepo(token, owner, name).catch(() => undefined);
        setStarProgress({ current: i + 1, total: SUPPORT_REPOSITORIES.length });
      }
      setIsStarred(true);
      void checkUserStatus(token).catch(() => undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to star some repositories');
    } finally {
      setLoadingStar(false);
    }
  };

  const handleFollow = async () => {
    if (isFollowed || loadingFollow) return;
    setLoadingFollow(true);
    setError('');
    try {
      await followUser(token, MAINTAINER_PROFILE);
      setIsFollowed(true);
      void checkUserStatus(token).catch(() => undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to follow maintainer');
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('dev_ascend_requirements_done', 'true');
    onComplete();
  };

  return (
    <div className="max-w-3xl mx-auto text-center min-w-0">
      <div className="glass-card p-8 sm:p-12 relative overflow-hidden group border border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto mb-6 text-green-400">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h2 className="text-3xl font-black text-white mb-3 uppercase tracking-tighter">Support the Community</h2>
        <p className="text-sm text-gray-400 mb-8 max-w-xl mx-auto leading-relaxed">
          Show your support to unlock all Developer Ascend tools. Star our 6 featured repositories and follow the maintainer to proceed.
        </p>

        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>}

        <div className="space-y-4 mb-10">
          {/* Star 6 Repositories Button */}
          <button
            onClick={handleStarAll}
            disabled={checking || isStarred || loadingStar}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-between shadow-xl",
              isStarred ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-black/40 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <Star className="w-5 h-5 text-yellow-400" />
              <span>
                {isStarred ? "All 6 Repositories Starred" : starProgress ? `Starring Repositories (${starProgress.current}/${starProgress.total})...` : "Star All 6 Repositories"}
              </span>
            </div>
            {checking || loadingStar ? <Loader2 className="w-5 h-5 animate-spin text-green-400" /> : isStarred && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </button>

          {/* Follow Maintainer Button */}
          <button
            onClick={handleFollow}
            disabled={checking || isFollowed || loadingFollow}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-between shadow-xl",
              isFollowed ? "bg-green-500/20 text-green-400 border border-green-500/30 cursor-default" : "bg-black/40 border border-white/10 text-white hover:bg-white/10 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <UserPlus className="w-5 h-5 text-blue-400" />
              <span>{isFollowed ? `@${MAINTAINER_PROFILE} Followed` : `Follow Maintainer (@${MAINTAINER_PROFILE})`}</span>
            </div>
            {checking || loadingFollow ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" /> : isFollowed && <CheckCircle2 className="w-5 h-5 text-green-400" />}
          </button>
        </div>

        <button
          onClick={handleFinish}
          disabled={!isStarred || !isFollowed}
          className={cn(
            "w-full py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 transition-all",
            isStarred && isFollowed ? "premium-gradient-green text-gray-950 font-black btn-hover-effect" : "bg-white/5 text-gray-600 cursor-not-allowed opacity-50"
          )}
        >
          Enter Dashboard <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
