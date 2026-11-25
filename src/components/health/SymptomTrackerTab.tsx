import React, { useMemo, useState } from 'react';
import { Calendar, Download, Printer } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { HouseholdProfile, SymptomLog, SymptomType } from '../../types/env';
import { calculateDailyExposure } from '../../utils/aqi';
import { escapeCsvCell } from '../../utils/sanitize';

interface SymptomTrackerTabProps {
  activeHousehold?: HouseholdProfile;
  symptoms: SymptomLog[];
  currentAqi: number;
  hasCalendarAuth: boolean;
  calendarEvents: Array<{ id: string; summary: string; start: string; htmlLink?: string }>;
  onAddSymptom: (log: Omit<SymptomLog, 'id' | 'createdAt'>) => Promise<void>;
  onScheduleDoctorVisit: (summary: string, description: string, startIso: string) => Promise<void>;
}

export const SymptomTrackerTab: React.FC<SymptomTrackerTabProps> = ({
  activeHousehold,
  symptoms,
  currentAqi,
  hasCalendarAuth,
  calendarEvents,
  onAddSymptom,
  onScheduleDoctorVisit,
}) => {
  const [symptomType, setSymptomType] = useState<SymptomType>('cough');
  const [severity, setSeverity] = useState<1 | 2 | 3 | 4 | 5>(2);
  const [outdoorMinutes, setOutdoorMinutes] = useState(45);
  const [medicationTaken, setMedicationTaken] = useState('');
  const [symptomNotes, setSymptomNotes] = useState('');

  const [doctorTitle, setDoctorTitle] = useState('Pulmonologist / Respiratory Checkup');
  const [doctorDate, setDoctorDate] = useState(() => {
    const d = new Date(Date.now() + 86400_000 * 2);
    return d.toISOString().slice(0, 16);
  });
  const [calendarFeedback, setCalendarFeedback] = useState<string | null>(null);

  const exposure = useMemo(
    () => calculateDailyExposure(outdoorMinutes, currentAqi),
    [outdoorMinutes, currentAqi],
  );

  const chartData = useMemo(
    () =>
      [...symptoms]
        .slice(0, 14)
        .reverse()
        .map((s) => ({
          date: s.createdAt.slice(5, 10),
          severity: s.severity,
          exposure: Math.round((s.outdoorMinutes / 60) * s.aqiAtTime),
        })),
    [symptoms],
  );

  const handleLogSymptom = async (e: React.FormEvent) => {
    e.preventDefault();
    await onAddSymptom({
      type: symptomType,
      severity,
      aqiAtTime: currentAqi,
      outdoorMinutes,
      medicationTaken: medicationTaken.trim() || undefined,
      notes: symptomNotes.trim() || undefined,
    });
    setMedicationTaken('');
    setSymptomNotes('');
  };

  const handleExportCSV = () => {
    const header = 'Date,Symptom,Severity(1-5),AQI,OutdoorMinutes,Medication,Notes\n';
    const rows = symptoms
      .map(
        (s) =>
          `${escapeCsvCell(s.createdAt)},${escapeCsvCell(s.type)},${s.severity},${s.aqiAtTime},${s.outdoorMinutes},${escapeCsvCell(s.medicationTaken || '')},${escapeCsvCell(s.notes || '')}`,
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vayushield-health-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleScheduleDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    setCalendarFeedback(null);
    try {
      await onScheduleDoctorVisit(
        doctorTitle,
        `VayuShield AI health consultation. Household: ${activeHousehold?.name || 'Primary'}. Recent AQI: ${currentAqi}.`,
        new Date(doctorDate).toISOString(),
      );
      setCalendarFeedback('Doctor visit scheduled in your Google Calendar.');
    } catch (err) {
      setCalendarFeedback(
        err instanceof Error ? err.message : 'Unable to schedule calendar event.',
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            Daily Exposure &amp; Symptom Logger
          </h2>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
            <p className="font-bold text-slate-900">
              Live Exposure Estimate:{' '}
              <span className="font-mono">{exposure.exposureUnits} AQI-hrs</span> (
              {exposure.riskLevel})
            </p>
            <p className="text-slate-600">
              Estimated PM2.5 inhaled dose ≈{' '}
              <span className="font-mono font-semibold">{exposure.cigaretteEquivalent}</span>{' '}
              cigarette-equivalents at AQI {currentAqi}.
            </p>
          </div>

          <form onSubmit={handleLogSymptom} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="symptom-type"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Symptom
                </label>
                <select
                  id="symptom-type"
                  value={symptomType}
                  onChange={(e) => setSymptomType(e.target.value as SymptomType)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  <option value="cough">Cough</option>
                  <option value="breathlessness">Breathlessness</option>
                  <option value="eye_irritation">Eye Irritation</option>
                  <option value="headache">Headache</option>
                  <option value="wheezing">Wheezing</option>
                  <option value="fatigue">Fatigue</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="symptom-sev"
                  className="block text-xs font-semibold text-slate-700 mb-1"
                >
                  Severity (1–5)
                </label>
                <select
                  id="symptom-sev"
                  value={severity}
                  onChange={(e) => setSeverity(Number(e.target.value) as 1 | 2 | 3 | 4 | 5)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} — {n <= 2 ? 'Mild' : n === 3 ? 'Moderate' : 'Severe'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="outdoor-mins"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Outdoor Minutes Today ({outdoorMinutes} min)
              </label>
              <input
                id="outdoor-mins"
                type="range"
                min={0}
                max={480}
                step={15}
                value={outdoorMinutes}
                onChange={(e) => setOutdoorMinutes(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
            </div>

            <div>
              <label htmlFor="symptom-medication" className="sr-only">
                Medication or inhaler taken
              </label>
              <input
                id="symptom-medication"
                type="text"
                value={medicationTaken}
                onChange={(e) => setMedicationTaken(e.target.value)}
                placeholder="Medication / Inhaler taken (optional)"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            <div>
              <label htmlFor="symptom-notes" className="sr-only">
                Symptom notes
              </label>
              <input
                id="symptom-notes"
                type="text"
                value={symptomNotes}
                onChange={(e) => setSymptomNotes(e.target.value)}
                placeholder="Notes (e.g. after morning metro walk)"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
            >
              Log Health Entry
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-bold text-slate-900">
              Exposure &amp; Symptom Trends ({symptoms.length} records)
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <Download className="w-3.5 h-3.5" aria-hidden="true" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                Print PDF
              </button>
            </div>
          </div>

          <div
            className="h-52 w-full"
            role="img"
            aria-label={`Daily exposure trend chart (${chartData.length} logged days)`}
          >
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#475569' }} />
                  <Tooltip />
                  <Bar
                    dataKey="exposure"
                    name="Exposure (AQI-hrs)"
                    fill="#0F766E"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-600 border border-dashed border-slate-200 rounded-lg">
                Log your first symptom or daily exposure entry to render trend analytics.
              </div>
            )}
          </div>

          {/* Doctor Visit Google Calendar Scheduler */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-700" aria-hidden="true" />
              Doctor Consultation Scheduler (Google Calendar)
            </h3>
            <form onSubmit={handleScheduleDoctor} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input
                type="text"
                aria-label="Doctor appointment title"
                value={doctorTitle}
                onChange={(e) => setDoctorTitle(e.target.value)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                required
              />
              <input
                type="datetime-local"
                aria-label="Doctor appointment date and time"
                value={doctorDate}
                onChange={(e) => setDoctorDate(e.target.value)}
                className="px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
                required
              />
              <button
                type="submit"
                className="px-3 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-offset-2"
              >
                {hasCalendarAuth ? 'Add to Google Calendar' : 'Sign in to Sync'}
              </button>
            </form>
            {calendarFeedback && (
              <p role="status" aria-live="polite" className="text-xs text-teal-900">
                {calendarFeedback}
              </p>
            )}
            {calendarEvents.length > 0 && (
              <div className="text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-slate-800">Upcoming Google Calendar Events:</p>
                {calendarEvents.slice(0, 3).map((ev) => (
                  <div key={ev.id} className="flex justify-between">
                    <span className="truncate">{ev.summary}</span>
                    <span className="font-mono text-slate-600 shrink-0 ml-2">
                      {ev.start ? new Date(ev.start).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
