import React from 'react';
import { Award, Star, Users, ChevronRight } from 'lucide-react';

interface FeatureSelectionProps {
  onSelectFeature: (feature: 'badges' | 'stars' | 'followers') => void;
}

export function FeatureSelection({ onSelectFeature }: FeatureSelectionProps) {
  return (
    <div className="max-w-5xl w-full mx-auto text-center min-w-0">
      <h2 className="text-3xl sm:text-5xl font-black text-white mb-4 uppercase tracking-tight">
        Choose a Feature
      </h2>
      <p className="text-base sm:text-xl text-gray-300 mb-12 max-w-2xl mx-auto leading-relaxed">
        Select a tool from the Developer Ascend ecosystem to enhance your GitHub profile.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Badges Feature */}
        <button
          onClick={() => onSelectFeature('badges')}
          className="glass-card p-8 sm:p-10 flex flex-col items-center justify-between gap-6 hover:border-purple-400/80 hover:bg-white/5 btn-hover-effect border border-white/25 group cursor-pointer text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-400/30 text-purple-400 group-hover:scale-105 transition-transform">
            <Award className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider mb-3">Badges</h3>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Earn QuickDraw, YOLO, Pull Shark, and Pair Extraordinaire achievement badges.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-sm font-black uppercase text-purple-400 group-hover:text-purple-300 tracking-wider">
            Select Feature <ChevronRight className="w-5 h-5 ml-1" />
          </div>
        </button>

        {/* Increase Stars Feature */}
        <button
          onClick={() => onSelectFeature('stars')}
          className="glass-card p-8 sm:p-10 flex flex-col items-center justify-between gap-6 hover:border-green-400/80 hover:bg-white/5 btn-hover-effect border border-white/25 group cursor-pointer text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-400/30 text-green-400 group-hover:scale-105 transition-transform">
            <Star className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider mb-3">Stars</h3>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Submit up to 2 repositories for community discovery and exchange daily stars.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-sm font-black uppercase text-green-400 group-hover:text-green-300 tracking-wider">
            Select Feature <ChevronRight className="w-5 h-5 ml-1" />
          </div>
        </button>

        {/* Increase Followers Feature */}
        <button
          onClick={() => onSelectFeature('followers')}
          className="glass-card p-8 sm:p-10 flex flex-col items-center justify-between gap-6 hover:border-blue-400/80 hover:bg-white/5 btn-hover-effect border border-white/25 group cursor-pointer text-center"
        >
          <div className="w-20 h-20 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-400/30 text-blue-400 group-hover:scale-105 transition-transform">
            <Users className="w-10 h-10" />
          </div>
          <div>
            <h3 className="text-xl sm:text-2xl font-black text-white uppercase tracking-wider mb-3">Followers</h3>
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed">
              Connect with authentic developers in the community and expand your network.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-sm font-black uppercase text-blue-400 group-hover:text-blue-300 tracking-wider">
            Select Feature <ChevronRight className="w-5 h-5 ml-1" />
          </div>
        </button>
      </div>
    </div>
  );
}
