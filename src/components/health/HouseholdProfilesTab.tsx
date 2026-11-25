import React, { useState } from 'react';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type {
  ActivityLevel,
  AgeGroup,
  HealthCondition,
  HouseholdMember,
  HouseholdProfile,
} from '../../types/env';
import { createSafeId } from '../../utils/sanitize';

const HEALTH_CONDITIONS: Array<{ id: HealthCondition; label: string }> = [
  { id: 'asthma', label: 'Asthma' },
  { id: 'copd', label: 'COPD' },
  { id: 'allergies', label: 'Allergies' },
  { id: 'heart_disease', label: 'Heart Disease' },
  { id: 'pregnancy', label: 'Pregnancy' },
];

interface HouseholdProfilesTabProps {
  households: HouseholdProfile[];
  activeHousehold: HouseholdProfile;
  onSelectHousehold: (id: string) => void;
  onSaveHousehold: (hh: HouseholdProfile) => Promise<void>;
  onDeleteHousehold: (id: string) => Promise<void>;
}

export const HouseholdProfilesTab: React.FC<HouseholdProfilesTabProps> = ({
  households,
  activeHousehold,
  onSelectHousehold,
  onSaveHousehold,
  onDeleteHousehold,
}) => {
  const [newHHName, setNewHHName] = useState('');
  const [newHHCity, setNewHHCity] = useState(activeHousehold.location || 'New Delhi');

  const [memberName, setMemberName] = useState('');
  const [memberAge, setMemberAge] = useState<AgeGroup>('adult');
  const [memberActivity, setMemberActivity] = useState<ActivityLevel>('moderate');
  const [memberConditions, setMemberConditions] = useState<HealthCondition[]>([]);

  const handleCreateHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHHName.trim()) return;
    const now = new Date().toISOString();
    const created: HouseholdProfile = {
      id: createSafeId('hh'),
      name: newHHName.trim(),
      location: newHHCity.trim() || 'New Delhi',
      latitude: activeHousehold.latitude ?? 28.6139,
      longitude: activeHousehold.longitude ?? 77.209,
      members: [],
      createdAt: now,
      updatedAt: now,
    };
    await onSaveHousehold(created);
    onSelectHousehold(created.id);
    setNewHHName('');
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName.trim()) return;
    const newMem: HouseholdMember = {
      id: createSafeId('mem'),
      name: memberName.trim(),
      ageGroup: memberAge,
      conditions: memberConditions,
      activityLevel: memberActivity,
    };
    await onSaveHousehold({
      ...activeHousehold,
      members: [...activeHousehold.members, newMem],
      updatedAt: new Date().toISOString(),
    });
    setMemberName('');
    setMemberConditions([]);
  };

  const handleRemoveMember = async (memId: string) => {
    await onSaveHousehold({
      ...activeHousehold,
      members: activeHousehold.members.filter((m) => m.id !== memId),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-900">Your Household Profiles</h2>
        <div className="space-y-2">
          {households.map((hh) => (
            <div
              key={hh.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                hh.id === activeHousehold.id
                  ? 'border-teal-700 bg-teal-50/60'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <button
                type="button"
                aria-pressed={hh.id === activeHousehold.id}
                onClick={() => onSelectHousehold(hh.id)}
                className="text-left flex-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <p className="text-sm font-bold text-slate-900">{hh.name}</p>
                <p className="text-xs text-slate-600">
                  {hh.location} · {hh.members.length} members
                </p>
              </button>
              {households.length > 1 && (
                <button
                  type="button"
                  aria-label={`Delete household ${hh.name}`}
                  onClick={() => onDeleteHousehold(hh.id)}
                  className="p-1.5 text-slate-600 hover:text-red-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleCreateHousehold} className="pt-4 border-t border-slate-200 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Create Additional Household
          </h3>
          <div>
            <label htmlFor="new-hh-name" className="sr-only">
              Household profile name
            </label>
            <input
              id="new-hh-name"
              type="text"
              value={newHHName}
              onChange={(e) => setNewHHName(e.target.value)}
              placeholder="e.g., Parents Home (Lucknow)"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
          <div>
            <label htmlFor="new-hh-city" className="sr-only">
              Household city
            </label>
            <input
              id="new-hh-city"
              type="text"
              value={newHHCity}
              onChange={(e) => setNewHHCity(e.target.value)}
              placeholder="City"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
          <button
            type="submit"
            className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-4 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Household Profile
          </button>
        </form>
      </div>

      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Members in {activeHousehold.name}
            </h2>
            <p className="text-xs text-slate-600">
              Deterministic recommendations adapt instantaneously when you add or edit members.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-600">
            {activeHousehold.members.length}/15
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {activeHousehold.members.map((m) => (
            <div key={m.id} className="py-3 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-900">
                  {m.name}{' '}
                  <span className="text-xs font-normal text-slate-600 capitalize">
                    · {m.ageGroup} · {m.activityLevel}
                  </span>
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  Conditions:{' '}
                  {m.conditions.length > 0
                    ? m.conditions.join(', ').replace(/_/g, ' ')
                    : 'None reported'}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Remove member ${m.name}`}
                onClick={() => handleRemoveMember(m.id)}
                className="p-1.5 text-slate-600 hover:text-red-700 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-700"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          ))}
          {activeHousehold.members.length === 0 && (
            <p className="py-4 text-sm text-slate-600">
              No members added yet. Add a family member below to personalize vulnerability rules.
            </p>
          )}
        </div>

        <form onSubmit={handleAddMember} className="pt-4 border-t border-slate-200 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <UserPlus className="w-3.5 h-3.5" aria-hidden="true" />
            Add Family Member
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="member-name" className="sr-only">
                Member name
              </label>
              <input
                id="member-name"
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                placeholder="Member name"
                required
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>
            <select
              aria-label="Age group"
              value={memberAge}
              onChange={(e) => setMemberAge(e.target.value as AgeGroup)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="infant">Infant (0–2 yrs)</option>
              <option value="child">Child (3–17 yrs)</option>
              <option value="adult">Adult (18–59 yrs)</option>
              <option value="elderly">Elderly (60+ yrs)</option>
            </select>
            <select
              aria-label="Activity level"
              value={memberActivity}
              onChange={(e) => setMemberActivity(e.target.value as ActivityLevel)}
              className="px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            >
              <option value="sedentary">Sedentary</option>
              <option value="moderate">Moderate</option>
              <option value="active">Active / Athlete</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-3">
            {HEALTH_CONDITIONS.map((cond) => {
              const checked = memberConditions.includes(cond.id);
              return (
                <label
                  key={cond.id}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setMemberConditions((prev) =>
                        checked ? prev.filter((c) => c !== cond.id) : [...prev, cond.id],
                      )
                    }
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-700"
                  />
                  {cond.label}
                </label>
              );
            })}
          </div>

          <button
            type="submit"
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
          >
            Save Member to Profile
          </button>
        </form>
      </div>
    </div>
  );
};
