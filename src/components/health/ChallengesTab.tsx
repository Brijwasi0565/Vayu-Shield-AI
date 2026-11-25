import React, { useMemo } from 'react';
import type { ChallengeItem } from '../../types/env';

interface ChallengesTabProps {
  challenges: ChallengeItem[];
  onIncrementChallenge: (id: string) => Promise<void>;
}

export const ChallengesTab: React.FC<ChallengesTabProps> = ({
  challenges,
  onIncrementChallenge,
}) => {
  const totalPoints = useMemo(
    () =>
      challenges.reduce(
        (sum, c) =>
          sum + (c.completed ? c.points : Math.round((c.progress / c.target) * c.points * 0.5)),
        0,
      ),
    [challenges],
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Clean Air Challenges &amp; Badges</h2>
          <p className="text-xs text-slate-600">
            Build protective household habits during high-pollution weeks. Progress is saved locally
            and synced to your account.
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-slate-600 uppercase tracking-wider">Household Score</span>
          <p className="text-2xl font-bold font-mono text-teal-700">{totalPoints} pts</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {challenges.map((c) => {
          const pct = Math.min(100, Math.round((c.progress / c.target) * 100));
          return (
            <div
              key={c.id}
              className="border border-slate-200 rounded-xl p-5 flex flex-col justify-between space-y-4"
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-bold text-teal-700">+{c.points} pts</span>
                  <span className="text-slate-600">
                    {c.completed ? `Unlocked: ${c.badgeName}` : c.badgeName}
                  </span>
                </div>
                <h3 className="text-sm font-bold text-slate-900">{c.title}</h3>
                <p className="text-xs text-slate-600">{c.description}</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs font-mono text-slate-600">
                  <span>Progress</span>
                  <span>
                    {c.progress}/{c.target} ({pct}%)
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-label={`${c.title} progress`}
                  aria-valuenow={c.progress}
                  aria-valuemin={0}
                  aria-valuemax={c.target}
                  className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"
                >
                  <div className="h-full bg-teal-700 transition-all" style={{ width: `${pct}%` }} />
                </div>
                <button
                  type="button"
                  disabled={c.completed}
                  onClick={() => onIncrementChallenge(c.id)}
                  className={`w-full py-2 text-xs font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2 ${
                    c.completed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                      : 'bg-slate-900 text-white hover:bg-slate-800'
                  }`}
                >
                  {c.completed ? 'Challenge Completed' : 'Log Today’s Action (+1)'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
