import { NodeReading, SensorNode, Zone } from '../models/Inspection';

export interface LiveNodeRow {
  id: number;
  area_id: number;
  area_name: string;
  code: string;
  location: string;
  active_alarms?: number;
  last_seen?: string | null;
  latest?: NodeReading[];
}

function reading(rows: NodeReading[], metric: string): string {
  const value = rows.find((row: NodeReading) => row.metric === metric)?.metric_value;
  return value === undefined || !Number.isFinite(value) ? '—' : value.toString();
}

export function zonesFromRows(rows: LiveNodeRow[]): Zone[] {
  const zones = new Map<number, Zone>();
  for (const row of rows) {
    let zone = zones.get(row.area_id);
    if (!zone) {
      zone = new Zone(row.area_id.toString(), row.area_name, 0, 0, []);
      zones.set(row.area_id, zone);
    }
    const latest = row.latest || [];
    const state = (row.active_alarms || 0) > 0 ? 'alarm' : latest.length ? 'normal' : 'unknown';
    const node = new SensorNode(row.code, row.area_name, row.location, 0, reading(latest, 'methane'),
      reading(latest, 'temperature'), reading(latest, 'humidity'), reading(latest, 'infrared'), state);
    node.live = true;
    node.backendId = row.id;
    node.lastSeen = row.last_seen || '';
    node.latest = latest;
    zone.nodes.push(node);
    zone.count++;
  }
  return Array.from(zones.values());
}
