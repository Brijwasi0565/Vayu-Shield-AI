import React, { useMemo, useState } from 'react';
import type { AQIResponse } from '../../types/env';
import { calculateIAQEffectiveness, getVentilationWindowAdvice } from '../../utils/aqi';

const INDOOR_PLANTS = [
  {
    name: 'Snake Plant (Sansevieria)',
    benefit: 'Releases O₂ at night; low-water bedroom resilience.',
    placement: '1–2 pots per 100 sq ft bedroom',
  },
  {
    name: 'Areca Palm (Dypsis lutescens)',
    benefit: 'High transpiration natural humidifier; traps coarse dust on fronds.',
    placement: 'Living room sunny window',
  },
  {
    name: 'Peace Lily (Spathiphyllum)',
    benefit: 'Absorbs airborne VOCs (benzene, formaldehyde) in shaded rooms.',
    placement: 'Study / shaded hallway (keep away from pets)',
  },
  {
    name: 'Money Plant (Epipremnum aureum)',
    benefit: 'Hardy Indian indoor climber supporting VOC & indoor particulate capture.',
    placement: 'Balcony entrance / kitchen shelf',
  },
];

interface IAQToolsTabProps {
  aqi: AQIResponse | null;
  currentAqi: number;
  windSpeedKmh: number;
}

export const IAQToolsTab: React.FC<IAQToolsTabProps> = ({ aqi, currentAqi, windSpeedKmh }) => {
  const [roomSqFt, setRoomSqFt] = useState(160);
  const [ceilingFt, setCeilingFt] = useState(9);
  const [cadrM3h, setCadrM3h] = useState(320);

  const iaqResult = useMemo(
    () => calculateIAQEffectiveness(roomSqFt, ceilingFt, cadrM3h, currentAqi),
    [roomSqFt, ceilingFt, cadrM3h, currentAqi],
  );
  const ventilationAdvice = useMemo(
    () => getVentilationWindowAdvice(aqi?.hourly ?? [], windSpeedKmh),
    [aqi?.hourly, windSpeedKmh],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-900">
          Air Purifier CADR &amp; Cost-Benefit Calculator
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="room-sqft" className="block text-xs font-semibold text-slate-700 mb-1">
              Room Area (sq ft)
            </label>
            <input
              id="room-sqft"
              type="number"
              min={40}
              max={2000}
              value={roomSqFt}
              onChange={(e) => setRoomSqFt(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
          <div>
            <label htmlFor="room-ceil" className="block text-xs font-semibold text-slate-700 mb-1">
              Ceiling (ft)
            </label>
            <input
              id="room-ceil"
              type="number"
              min={7}
              max={18}
              value={ceilingFt}
              onChange={(e) => setCeilingFt(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
          <div>
            <label
              htmlFor="purifier-cadr"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              CADR (m³/h)
            </label>
            <input
              id="purifier-cadr"
              type="number"
              min={50}
              max={1200}
              value={cadrM3h}
              onChange={(e) => setCadrM3h(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-700"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg bg-slate-50 border border-slate-200">
          <div>
            <span className="text-xs text-slate-600">ACH Rate</span>
            <p className="text-xl font-bold font-mono text-slate-900">{iaqResult.ach}x</p>
          </div>
          <div>
            <span className="text-xs text-slate-600">Indoor AQI</span>
            <p className="text-xl font-bold font-mono text-teal-700">
              {iaqResult.estimatedIndoorAqi}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-600">Filter / Year</span>
            <p className="text-xl font-bold font-mono text-slate-900">
              ₹{iaqResult.annualFilterCostInr}
            </p>
          </div>
          <div>
            <span className="text-xs text-slate-600">Power / Mo</span>
            <p className="text-xl font-bold font-mono text-slate-900">
              ₹{iaqResult.monthlyPowerCostInr}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-700">
          <strong>Verdict:</strong> {iaqResult.verdict} · Recommended CADR for{' '}
          {iaqResult.roomVolumeM3} m³ room:{' '}
          <span className="font-mono font-bold">{iaqResult.recommendedCadrM3h} m³/h</span> (
          {iaqResult.pm25ReductionPercent}% PM2.5 reduction).
        </p>

        <div className="pt-4 border-t border-slate-200 space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Room Ventilation Window Optimizer</h3>
          <p className="text-xs text-slate-700">{ventilationAdvice.reason}</p>
        </div>
      </div>

      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-900">
          Natural Air-Purifying Plants &amp; Low-Cost DIY IAQ
        </h2>
        <div className="divide-y divide-slate-200">
          {INDOOR_PLANTS.map((p) => (
            <div key={p.name} className="py-3">
              <p className="text-sm font-bold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-600 mt-0.5">{p.benefit}</p>
              <p className="text-[11px] font-mono text-teal-800 mt-0.5">{p.placement}</p>
            </div>
          ))}
        </div>
        <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-1.5">
          <p className="font-bold text-slate-900">Zero-Cost / Low-Cost Indian Household IAQ Tips</p>
          <p>
            • Tape a HEPA-13 replacement filter (~₹1,500) behind a standard box/table fan for DIY
            Corsi-Rosenthal filtration.
          </p>
          <p>
            • Switch from dry broom sweeping (jhadu) to wet-mopping to prevent resuspending settled
            PM10 road dust.
          </p>
          <p>
            • Seal AC exhaust vents &amp; wooden window gaps with ₹120 foam weatherstrip tape during
            severe winter smog.
          </p>
        </div>
      </div>
    </div>
  );
};
