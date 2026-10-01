// Moved out of aisLiveVessels.js (aisLiveVesselsQuery).

import * as Cesium from 'cesium';
import { mapAnalystRecord } from './aisVesselRecords.js';
import { formatKnots } from './detectionDraw.js';
import { state } from './aisLiveVesselsConstants.js';
import { clearVesselInspection, selectVessel } from './aisLiveVesselsInteraction.js';

export function findAisByQuery(query) {
    if (query === null || query === undefined) return null;
    const records = state.vesselRecords;
    if (!Array.isArray(records) || !records.length) return null;
    const q = String(query).trim();
    if (!q) return null;

    let record = null;
    if (/^\d+$/.test(q)) {
      record = state.vesselMap.get(q) || null;
    }
    if (!record) {
      const lower = q.toLowerCase();
      record = records.find((r) => String(r.name || '').toLowerCase().includes(lower)) || null;
    }
    if (!record) return null;

    const position = record.billboard?.position || record.position;
    if (!position) return null;
    return {
      mmsi: record.mmsi,
      name: record.name,
      position,
      latitude: record.lat,
      longitude: record.lon,
      speedKt: record.speed,
      course: record.course,
      type: record.type,
    };
  }

export function getAisNearby(centerCartesian, rangeM, maxCount = 25) {
    const records = state.vesselRecords;
    if (!centerCartesian || !Array.isArray(records) || !records.length) return [];
    const range = Number.isFinite(rangeM) && rangeM > 0 ? rangeM : Infinity;
    const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 25;

    const entries = [];
    for (const record of records) {
      if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon)) continue;
      const position = record.billboard?.position || record.position;
      if (!position) continue;
      const distanceM = Cesium.Cartesian3.distance(centerCartesian, position);
      if (!Number.isFinite(distanceM) || distanceM > range) continue;
      entries.push({ mmsi: record.mmsi, name: record.name, position, distanceM });
    }
    entries.sort((a, b) => a.distanceM - b.distanceM);
    return entries.slice(0, cap);
  }

export function aisHasContact(mmsi) {
    if (!state.enabled || !state.vesselMap || state.vesselMap.size === 0) return null;
    if (!mmsi) return false;
    return state.vesselMap.has(String(mmsi).trim());
  }

export function getAisAllPositions(maxCount = 800) {
    const result = [];
    const records = state.vesselRecords;
    if (!Array.isArray(records)) return result;
    const cap = Number.isFinite(maxCount) && maxCount > 0 ? Math.floor(maxCount) : 800;

    for (const record of records) {
      if (result.length >= cap) break;
      const position = record.billboard?.position || record.position;
      if (!position) continue;
      result.push({
        id: record.mmsi,
        label: record.name || record.mmsi,
        position,
        latitude: record.lat,
        longitude: record.lon,
      });
    }
    return result;
  }

export function getAisAnalystRecords(maxCount = 2000) {
    if (!state.enabled) return [];
    const records = state.vesselRecords;
    if (!Array.isArray(records) || !records.length) return [];
    const limit = Number.isFinite(maxCount) ? Math.max(1, Math.floor(maxCount)) : 2000;
    const result = [];
    for (const record of records) {
      if (result.length >= limit) break;
      result.push(mapAnalystRecord(record));
    }
    return result;
  }

export function selectAisById(mmsi) {
    if (mmsi === null || mmsi === undefined) return false;
    const target = String(mmsi).trim();
    if (!target) return false;
    const record = state.vesselMap.get(target);
    if (!record) return false;
    selectVessel(record);
    return true;
  }

export function clearAisSelection() {
    clearVesselInspection();
    return true;
  }

export function getAisSelectedInfo() {
    const record = state.selectedRecord;
    if (!record) return null;
    return {
      mmsi: record.mmsi,
      name: record.name,
      latitude: record.lat,
      longitude: record.lon,
      speedKt: record.speed,
      course: record.course,
      type: record.type,
    };
  }

export function getAisDetectableObjects(options = {}) {
    if (!state.enabled || !state.billboardCollection || !state.billboardCollection.show) return [];
    const records = state.vesselRecords;
    if (!Array.isArray(records) || !records.length) return [];

    const maxCount = Number.isFinite(options.maxCount)
      ? Math.max(1, Math.floor(options.maxCount))
      : records.length;
    const seed = Number.isFinite(options.seed) ? Math.floor(options.seed) : 0;
    // Deterministic stride: evenly space selections across the record list
    const stride = Math.max(1, Math.ceil(records.length / maxCount));
    const start = seed % stride;

    const selected = state.selectedRecord;
    const result = [];
    for (let idx = 0; idx < records.length; idx += 1) {
      if (((idx - start) % stride) !== 0) continue;
      const record = records[idx];
      if (record.billboard && !record.billboard.show) continue;
      const position = record.billboard?.position || record.position;
      if (!position) continue;
      result.push({
        position,
        sourceId: record.mmsi,
        id: record.name || record.mmsi || 'VESSEL',
        type: 'SEA',
        skipLabel: record === selected,
        klass: record.type ? String(record.type).toUpperCase().slice(0, 14) : undefined,
        metric: formatKnots(record.speed), // record.speed is knots
      });
      if (result.length >= maxCount) break;
    }
    return result;
  }
