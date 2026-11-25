import React, { useRef, useState } from 'react';
import { Activity, Award, Home, Leaf } from 'lucide-react';
import type {
  AQIResponse,
  ChallengeItem,
  HouseholdProfile,
  LanguageCode,
  SymptomLog,
} from '../types/env';
import { t } from '../utils/i18n';
import { ChallengesTab } from './health/ChallengesTab';
import { HouseholdProfilesTab } from './health/HouseholdProfilesTab';
import { IAQToolsTab } from './health/IAQToolsTab';
import { SymptomTrackerTab } from './health/SymptomTrackerTab';

type SubTabId = 'household' | 'symptoms' | 'iaq' | 'challenges';

interface HouseholdHealthHubProps {
  households: HouseholdProfile[];
  activeHouseholdId: string;
  onSelectHousehold: (id: string) => void;
  onSaveHousehold: (hh: HouseholdProfile) => Promise<void>;
  onDeleteHousehold: (id: string) => Promise<void>;
  symptoms: SymptomLog[];
  onAddSymptom: (log: Omit<SymptomLog, 'id' | 'createdAt'>) => Promise<void>;
  challenges: ChallengeItem[];
  onIncrementChallenge: (id: string) => Promise<void>;
  aqi: AQIResponse | null;
  windSpeedKmh: number;
  language: LanguageCode;
  hasCalendarAuth: boolean;
  calendarEvents: Array<{ id: string; summary: string; start: string; htmlLink?: string }>;
  onScheduleDoctorVisit: (summary: string, description: string, startIso: string) => Promise<void>;
}

export const HouseholdHealthHub: React.FC<HouseholdHealthHubProps> = ({
  households,
  activeHouseholdId,
  onSelectHousehold,
  onSaveHousehold,
  onDeleteHousehold,
  symptoms,
  onAddSymptom,
  challenges,
  onIncrementChallenge,
  aqi,
  windSpeedKmh,
  language,
  hasCalendarAuth,
  calendarEvents,
  onScheduleDoctorVisit,
}) => {
  const dict = t(language);
  const [subTab, setSubTab] = useState<SubTabId>('household');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeHousehold = households.find((h) => h.id === activeHouseholdId) || households[0];
  const currentAqi = aqi?.aqi ?? 140;

  const tabs: Array<{
    id: SubTabId;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'household', label: dict.householdProfiler, icon: Home },
    { id: 'symptoms', label: dict.symptomTracker, icon: Activity },
    { id: 'iaq', label: dict.iaqTools, icon: Leaf },
    { id: 'challenges', label: dict.challenges, icon: Award },
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = tabs.length - 1;

    if (nextIdx !== null) {
      e.preventDefault();
      setSubTab(tabs[nextIdx].id);
      tabRefs.current[nextIdx]?.focus();
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-navigation with WAI-ARIA tablist pattern */}
      <div className="bg-white border border-slate-200 rounded-xl p-2 inline-block max-w-full">
        <div
          role="tablist"
          aria-label="Household health sections"
          className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {tabs.map((item, idx) => {
            const Icon = item.icon;
            const selected = subTab === item.id;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  tabRefs.current[idx] = el;
                }}
                id={`health-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`health-panel-${item.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setSubTab(item.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 ${
                  selected
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {subTab === 'household' && activeHousehold && (
        <div role="tabpanel" id="health-panel-household" aria-labelledby="health-tab-household">
          <HouseholdProfilesTab
            households={households}
            activeHousehold={activeHousehold}
            onSelectHousehold={onSelectHousehold}
            onSaveHousehold={onSaveHousehold}
            onDeleteHousehold={onDeleteHousehold}
          />
        </div>
      )}

      {subTab === 'symptoms' && (
        <div role="tabpanel" id="health-panel-symptoms" aria-labelledby="health-tab-symptoms">
          <SymptomTrackerTab
            activeHousehold={activeHousehold}
            symptoms={symptoms}
            currentAqi={currentAqi}
            hasCalendarAuth={hasCalendarAuth}
            calendarEvents={calendarEvents}
            onAddSymptom={onAddSymptom}
            onScheduleDoctorVisit={onScheduleDoctorVisit}
          />
        </div>
      )}

      {subTab === 'iaq' && (
        <div role="tabpanel" id="health-panel-iaq" aria-labelledby="health-tab-iaq">
          <IAQToolsTab aqi={aqi} currentAqi={currentAqi} windSpeedKmh={windSpeedKmh} />
        </div>
      )}

      {subTab === 'challenges' && (
        <div role="tabpanel" id="health-panel-challenges" aria-labelledby="health-tab-challenges">
          <ChallengesTab challenges={challenges} onIncrementChallenge={onIncrementChallenge} />
        </div>
      )}
    </div>
  );
};
