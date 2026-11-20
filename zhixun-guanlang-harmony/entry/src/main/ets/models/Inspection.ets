export interface NodeReading {
  metric: string;
  metric_value: number;
  collected_at?: string;
  source?: string;
}

export class SensorNode {
  live: boolean = false;
  backendId: number = 0;
  lastSeen: string = '';
  latest: NodeReading[] = [];
  id: string;
  zone: string;
  place: string;
  score: number;
  methane: string;
  temp: string;
  humidity: string;
  infrared: string;
  state: string;
  constructor(id: string, zone: string, place: string, score: number, methane: string,
    temp: string, humidity: string, infrared: string, state: string) {
    this.id = id; this.zone = zone; this.place = place; this.score = score;
    this.methane = methane; this.temp = temp; this.humidity = humidity; this.infrared = infrared; this.state = state;
  }
}

export class Zone {
  id: string;
  name: string;
  count: number;
  connected: number;
  nodes: SensorNode[];
  constructor(id: string, name: string, count: number, connected: number, nodes: SensorNode[]) {
    this.id = id; this.name = name; this.count = count; this.connected = connected; this.nodes = nodes;
  }
}

export function riskLabel(node: SensorNode): string {
  if (node.live) { return node.state === 'alarm' ? '有活动告警' : node.state === 'unknown' ? '暂无读数' : '无活动告警'; }
  return node.state === 'alarm' ? '高风险' : node.state === 'watch' ? '需关注' : '正常';
}
