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
  const [loadingFollow, setLoadingFollow] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    let pollInterval: any;

    const verify = async () => {
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
    };

    verify();

    pollInterval = setInterval(() => {
      if (!isStarred || !isFollowed) {
        verify();
      }
    }, 5000);

    return () => {
      mounted = false;
      clearInterval(pollInterval);
    };
  }, [token, onComplete, isStarred, isFollowed]);

  const handleStarAll = async () => {
    if (isStarred || loadingStar) return;
    setLoadingStar(true);
    setError('');
    try {
      for (let i = 0; i < SUPPORT_REPOSITORIES.length; i++) {
        const [owner, name] = SUPPORT_REPOSITORIES[i].split('/');
        await starRepo(token, owner, name).catch(() => undefined);
      }
      setIsStarred(true);
      void checkUserStatus(token).catch(() => undefined);
    } catch (err: any) {
      setError(err.message || 'Failed to complete repository star');
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
      setError(err.message || 'Failed to follow profile');
    } finally {
      setLoadingFollow(false);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('dev_ascend_requirements_done', 'true');
    onComplete();
  };

  return (
    <div className="max-w-2xl mx-auto text-center min-w-0">
      <div className="glass-card p-8 sm:p-12 relative overflow-hidden group border border-white/25">
        <div className="w-20 h-20 rounded-2xl bg-green-500/10 border border-green-500/30 flex items-center justify-center mx-auto mb-6 text-green-400">
          <ShieldCheck className="w-10 h-10" />
        </div>
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-3 uppercase tracking-tight">Support the Community</h2>
        <p className="text-base sm:text-lg text-gray-300 mb-8 max-w-lg mx-auto leading-relaxed">
          Complete the verification steps below to access Developer Ascend.
        </p>

        {error && <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 text-red-300 text-sm font-bold">{error}</div>}

        <div className="space-y-4 mb-10 text-left">
          {/* Repository Star Button */}
          <button
            onClick={handleStarAll}
            disabled={checking || isStarred || loadingStar}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-between shadow-xl cursor-pointer",
              isStarred
                ? "bg-green-500/20 text-green-400 border border-green-500/40 cursor-default"
                : "glass-card border border-white/25 text-white hover:border-green-400/80 hover:bg-white/5 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <Star className="w-6 h-6 text-yellow-400" />
              <span className="text-sm sm:text-base font-bold">
                {loadingStar ? "Starring Repositories..." : "Repository Star"}
              </span>
            </div>
            {checking || loadingStar ? <Loader2 className="w-5 h-5 animate-spin text-green-400" /> : isStarred && <CheckCircle2 className="w-6 h-6 text-green-400" />}
          </button>

          {/* Follow Profile Button */}
          <button
            onClick={handleFollow}
            disabled={checking || isFollowed || loadingFollow}
            className={cn(
              "w-full py-5 px-6 rounded-2xl font-black text-sm uppercase tracking-widest transition-all flex items-center justify-between shadow-xl cursor-pointer",
              isFollowed
                ? "bg-green-500/20 text-green-400 border border-green-500/40 cursor-default"
                : "glass-card border border-white/25 text-white hover:border-blue-400/80 hover:bg-white/5 btn-hover-effect"
            )}
          >
            <div className="flex items-center gap-4">
              <UserPlus className="w-6 h-6 text-blue-400" />
              <span className="text-sm sm:text-base font-bold">
                {loadingFollow ? "Following Profile..." : "Follow Profile"}
              </span>
            </div>
            {checking || loadingFollow ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" /> : isFollowed && <CheckCircle2 className="w-6 h-6 text-green-400" />}
          </button>
        </div>

        <button
          onClick={handleFinish}
          disabled={!isStarred || !isFollowed}
          className={cn(
            "w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-2 transition-all",
            isStarred && isFollowed
              ? "premium-gradient-green text-gray-950 font-black btn-hover-effect cursor-pointer"
              : "bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed opacity-40"
          )}
        >
          Enter Dashboard <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
