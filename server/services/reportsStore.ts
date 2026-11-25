import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { CommunityReport, ReportType } from '../../src/types/env';
import { redactSecrets } from '../security';

const SEED_REPORTS: CommunityReport[] = [
  {
    id: 'seed-delhi-ito',
    authorId: 'community-sentinel-1',
    authorAlias: 'Ananya R.',
    type: 'traffic',
    description: 'Heavy morning diesel bus congestion near ITO intersection causing visible haze.',
    city: 'New Delhi',
    latitude: 28.6289,
    longitude: 77.241,
    upvotes: 14,
    downvotes: 1,
    verified: true,
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-delhi-lodhi',
    authorId: 'community-sentinel-2',
    authorAlias: 'Vikram S.',
    type: 'clean_zone',
    description:
      'Lodhi Gardens inner canopy paths noticeably cooler and calmer than outer ring road.',
    city: 'New Delhi',
    latitude: 28.5931,
    longitude: 77.2197,
    upvotes: 22,
    downvotes: 0,
    verified: true,
    createdAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-mumbai-bkc',
    authorId: 'community-sentinel-3',
    authorAlias: 'Meera K.',
    type: 'dust',
    description:
      'Metro utility excavation dust along Bandra-Kurla connector road; wear mask if walking.',
    city: 'Mumbai',
    latitude: 19.0653,
    longitude: 72.8682,
    upvotes: 9,
    downvotes: 1,
    verified: false,
    createdAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 3600 * 1000).toISOString(),
  },
  {
    id: 'seed-blr-cubbon',
    authorId: 'community-sentinel-4',
    authorAlias: 'Karthik N.',
    type: 'clean_zone',
    description: 'Cubbon Park bamboo grove morning readings steady and clean after brief drizzle.',
    city: 'Bengaluru',
    latitude: 12.9763,
    longitude: 77.5929,
    upvotes: 19,
    downvotes: 0,
    verified: true,
    createdAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 9 * 3600 * 1000).toISOString(),
  },
];

export interface NewReportInput {
  type: ReportType;
  description: string;
  city: string;
  latitude: number;
  longitude: number;
  authorId?: string;
  authorAlias?: string;
  photoDataUrl?: string;
}

/**
 * Atomic JSON-backed store for community hazard & clean-zone reports.
 */
export function createReportsStore(dataDir: string) {
  const reportsFile = path.join(dataDir, 'reports.json');

  function load(): CommunityReport[] {
    try {
      if (!fs.existsSync(reportsFile)) {
        save([...SEED_REPORTS]);
        return [...SEED_REPORTS];
      }
      const raw = fs.readFileSync(reportsFile, 'utf-8');
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [...SEED_REPORTS];
    } catch {
      return [...SEED_REPORTS];
    }
  }

  function save(reports: CommunityReport[]): void {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      const tmpFile = `${reportsFile}.${process.pid}.${crypto.randomUUID().slice(0, 6)}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(reports.slice(0, 200), null, 2));
      fs.renameSync(tmpFile, reportsFile);
    } catch (err) {
      console.error('Failed to persist community reports:', redactSecrets(String(err)));
    }
  }

  function create(input: NewReportInput): CommunityReport {
    const now = new Date().toISOString();
    const newReport: CommunityReport = {
      id: `rep-${Date.now()}-${crypto.randomUUID().slice(0, 6)}`,
      authorId: input.authorId || 'anonymous-resident',
      authorAlias: input.authorAlias || 'Local Resident',
      type: input.type,
      description: input.description,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      photoDataUrl: input.photoDataUrl,
      upvotes: 1,
      downvotes: 0,
      verified: false,
      createdAt: now,
      updatedAt: now,
    };
    const reports = load();
    reports.unshift(newReport);
    save(reports);
    return newReport;
  }

  function vote(id: string, direction: 'up' | 'down'): CommunityReport | null {
    const reports = load();
    const target = reports.find((r) => r.id === id);
    if (!target) return null;
    if (direction === 'up') target.upvotes += 1;
    else target.downvotes += 1;
    target.verified = target.upvotes >= 5 && target.upvotes > target.downvotes * 2;
    target.updatedAt = new Date().toISOString();
    save(reports);
    return target;
  }

  return { load, save, create, vote };
}
