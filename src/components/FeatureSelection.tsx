import React from 'react';
import { Award, Star, Users, ChevronRight } from 'lucide-react';

interface FeatureSelectionProps {
  onSelectFeature: (feature: 'badges' | 'stars' | 'followers') => void;
}

export function FeatureSelection({ onSelectFeature }: FeatureSelectionProps) {
  return (
    <div className="max-w-4xl mx-auto text-center min-w-0">
      <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tighter">Choose a Feature</h2>
      <p className="text-sm text-gray-400 mb-10 max-w-xl mx-auto">
        Select a tool from the Developer Ascend ecosystem to enhance your GitHub profile.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Badges Feature */}
        <button
          onClick={() => onSelectFeature('badges')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-black/60 btn-hover-effect border border-purple-500/30 group bg-black/40 backdrop-blur-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-400">
            <Award className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Badges</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Earn QuickDraw, YOLO, Pull Shark, and Pair Extraordinaire achievement badges.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-purple-400 group-hover:text-purple-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Increase Stars Feature */}
        <button
          onClick={() => onSelectFeature('stars')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-black/60 btn-hover-effect border border-green-500/30 group bg-black/40 backdrop-blur-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-green-500/10 flex items-center justify-center border border-green-500/20 text-green-400">
            <Star className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Stars</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Submit up to 2 repositories for community discovery and exchange daily stars.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-green-400 group-hover:text-green-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>

        {/* Increase Followers Feature */}
        <button
          onClick={() => onSelectFeature('followers')}
          className="glass-card p-8 flex flex-col items-center justify-between gap-6 hover:bg-black/60 btn-hover-effect border border-blue-500/30 group bg-black/40 backdrop-blur-xl"
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 text-blue-400">
            <Users className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Followers</h3>
            <p className="text-xs text-gray-400 leading-relaxed">
              Connect with authentic developers in the community and expand your network.
            </p>
          </div>
          <div className="w-full mt-4 flex items-center justify-center text-xs font-black uppercase text-blue-400 group-hover:text-blue-300">
            Select <ChevronRight className="w-4 h-4 ml-1" />
          </div>
        </button>
      </div>
    </div>
  );
}
