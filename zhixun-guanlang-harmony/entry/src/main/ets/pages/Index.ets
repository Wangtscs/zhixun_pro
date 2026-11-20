import { MobileSession } from '../services/MobileSession';
import { MobileWorkspace } from '../features/backend/MobileWorkspace';
import { T } from '../common/Theme';
import { AppIcon, PageHeader, ActionButton } from '../common/Ui';
import { SensorNode, Zone } from '../models/Inspection';
import { LiveNodeRow, zonesFromRows } from '../services/LiveInspection';
import { ZONES } from '../services/DemoRepository';
import { NodeQuickSheet } from '../features/inspection/NodeQuickSheet';
import { LoginPage } from '../features/auth/LoginPage';
import { InspectionPage } from '../features/inspection/InspectionPage';
import { PatrolPage } from '../features/inspection/PatrolPage';
import { NodeDetailPage } from '../features/inspection/NodeDetailPage';
import { RiskPage } from '../features/inspection/RiskPage';
import { RepairSheet } from '../features/inspection/RepairSheet';
import { OrdersPage } from '../features/orders/OrdersPage';
import { TaskPage } from '../features/orders/TaskPage';
import { LiveOrderChecks } from '../features/orders/OrderDetailState';
import { AssistantPage } from '../features/assistant/AssistantPage';
import { ProfilePage } from '../features/profile/ProfilePage';
import { ProfileDetailPage } from '../features/profile/ProfileDetailPage';

@Entry
@Component
struct Index {
  @StorageLink('darkMode') dark: boolean = true;
  @StorageLink('taskNodeId') taskNodeId: string = 'B-03';
  @State signedIn: boolean = false;
  @State live: boolean = false;
  @State liveZones: Zone[] = [];
  @State inspectionError: string = '';
  @State inspectionLoading: boolean = false;
  @State patrolSaving: boolean = false;
  @State liveOrderDetailOpen: boolean = false;
  @State tab: number = 0;
  @State route: string = '';
  @State zoneIndex: number = 1;
  @State perspective: boolean = false;
  @State node: SensorNode = ZONES[1].nodes[0];
  @State repairOpen: boolean = false;
  @State repairSuggestion: string = '';
  @State quickNode: SensorNode = ZONES[1].nodes[0];
  @State quickOpen: boolean = false;
  private history: string[] = [];
  private inspectionRevision: number = 0;
  private labels: string[] = ['巡检', '工单', '助手', '我的'];
  private icons: string[] = ['radar', 'clipboard', 'bot', 'user'];
  private open(page: string): void { this.history.push(this.route); this.route = page; }
  private logout(): void {
    MobileSession.logout();
    LiveOrderChecks.reset();
    this.signedIn = false;
    this.live = false;
    this.liveOrderDetailOpen = false;
    this.inspectionRevision++;
    this.inspectionLoading = false;
    this.liveZones = [];
    this.route = '';
    this.history = [];
  }
  private async loadInspection(): Promise<void> {
    if (this.inspectionLoading) { return; }
    const revision = ++this.inspectionRevision;
    this.inspectionLoading = true;
    this.inspectionError = '';
    try {
      const zones = zonesFromRows(await MobileSession.get<LiveNodeRow[]>('/api/business/nodes'));
      if (revision !== this.inspectionRevision) { return; }
      this.liveZones = zones;
      if (this.zoneIndex >= zones.length) { this.zoneIndex = 0; }
      if (this.route === 'node') {
        for (const zone of zones) {
          const latest = zone.nodes.find((node: SensorNode) => node.backendId === this.node.backendId);
          if (latest) { this.node = latest; break; }
        }
      }
    } catch (error) {
      if (revision === this.inspectionRevision) { this.inspectionError = (error as Error).message; }
    } finally {
      if (revision === this.inspectionRevision) { this.inspectionLoading = false; }
    }
  }
  private switchTab(index: number): void {
    this.tab = index;
    this.history = [];
    if (this.live && index === 0) { this.loadInspection(); }
  }
  private openNode(node: SensorNode): void {
    this.node = node;
    this.open('node');
    if (this.live) { this.loadInspection(); }
  }
  private back(): void {
    if (this.repairOpen) { this.repairOpen = false; return; }
    this.route = this.history.pop() || '';
  }
  private createTask(): void {
    this.repairOpen = false; this.taskNodeId = this.node.id; this.tab = 1; this.open('task');
  }
  private taskNode(): SensorNode {
    for (const zone of ZONES) {
      for (const node of zone.nodes) { if (node.id === this.taskNodeId) { return node; } }
    }
    return ZONES[1].nodes[0];
  }
  onBackPress(): boolean {
    if (!this.signedIn && (AppStorage.get<boolean>('authRecovering') || AppStorage.get<string>('authPanel'))) {
      AppStorage.setOrCreate('authBackSignal', (AppStorage.get<number>('authBackSignal') || 0) + 1);
      return true;
    }
    if (this.quickOpen) { this.quickOpen = false; return true; }
    if (this.liveOrderDetailOpen) { this.liveOrderDetailOpen = false; return true; }
    if (this.route === 'patrol' && this.patrolSaving) { return true; }
    if (AppStorage.get<string>('profilePanel')) { AppStorage.setOrCreate('profilePanel', ''); return true; }
    if (this.route === 'task') { this.tab = 1; this.route = ''; this.history = []; return true; }
    if (this.repairOpen || this.route) { this.back(); return true; }
    if (this.signedIn && this.tab !== 0) { this.switchTab(0); return true; }
    return false;
  }
  @Builder
  statusBar() {
    Row({ space: 6 }) {
      Text('14:32').fontSize(11).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
      Blank()
      Text('5G').fontSize(9).fontColor(T.muted(this.dark))
      AppIcon({ name: 'wifi', iconSize: 12, color: T.muted(this.dark) })
      Text('86').fontSize(7).fontColor(T.text(this.dark)).width(21).height(12).textAlign(TextAlign.Center)
        .border({ width: 1, color: T.muted(this.dark) }).borderRadius(3)
    }.height(26).width('100%').padding({ left: 17, right: 17 }).backgroundColor(T.chrome(this.dark))
  }
  @Builder
  navigationBar() {
    Row() {
      ForEach(this.labels, (label: string, index: number) => {
        Column({ space: 4 }) {
          Stack({ alignContent: Alignment.TopEnd }) {
            AppIcon({ name: this.icons[index], iconSize: 20, color: this.tab === index ? T.tint(this.dark) : T.muted(this.dark) })
            if (index === 1 && !this.live) {
              Text('1').fontSize(7).fontColor('#FFFFFF').width(11).height(11).textAlign(TextAlign.Center)
                .backgroundColor(T.danger).borderRadius(6).position({ x: 15, y: -5 })
            }
          }.width(20).height(20)
          Text(label).fontSize(9).fontColor(this.tab === index ? T.tint(this.dark) : T.muted(this.dark))
        }.layoutWeight(1).height(72).justifyContent(FlexAlign.Center)
          .onClick(() => this.switchTab(index))
      })
    }.height(72).width('100%').padding({ bottom: 5 }).backgroundColor(T.inset(this.dark))
      .border({ width: { top: 1 }, color: T.border(this.dark) })
  }
  build() {
    Stack() {
      if (!this.signedIn) {
        LoginPage({ onEnter: () => {
          this.live = MobileSession.active();
          this.liveZones = [];
          this.inspectionError = '';
          this.signedIn = true;
          this.tab = 0;
          this.zoneIndex = this.live ? 0 : 1;
          this.route = '';
          this.history = [];
          if (this.live) { this.loadInspection(); }
        } })
      } else {
        Column() {
          this.statusBar()
          Column() {
            if (this.live && !this.route && (this.tab === 1 || this.tab === 3)) {
              MobileWorkspace({ tab: this.tab, orderDetailOpen: this.liveOrderDetailOpen,
                onOrderDetailChange: (open: boolean) => this.liveOrderDetailOpen = open,
                onOpenHandbooks: () => this.open('handbooks'),
                onOpenProfile: (page: string) => this.open(page),
                onLogout: () => this.logout() })
            } else if (this.route === 'handbooks') {
              MobileWorkspace({ tab: 2, onBack: () => this.back() })
            } else if (this.route === 'patrol') {
              PatrolPage({ saving: $patrolSaving, onBack: () => this.back() })
            } else if (this.route === 'node') {
              NodeDetailPage({ node: this.node, readingLoading: this.inspectionLoading, readingError: this.inspectionError,
                onRefresh: () => this.loadInspection(), onBack: () => this.back(), onRisk: () => {
                if (this.live) { this.open('node-assistant'); } else { this.open('risk'); }
              }, onRepair: () => { this.repairSuggestion = ''; this.repairOpen = true; } })
            } else if (this.route === 'node-assistant') {
              AssistantPage({ node: this.node, onBack: () => this.back(),
                onRepair: (suggestion: string) => { this.repairSuggestion = suggestion; this.repairOpen = true; },
                onOpenTask: () => {
                this.tab = 1; this.route = ''; this.history = [];
              } })
            } else if (this.route === 'risk') {
              RiskPage({ node: this.node, onBack: () => this.back(), onCreateTask: () => this.createTask() })
            } else if (this.route === 'task') {
              TaskPage({ node: this.taskNode(), onBack: () => { this.tab = 1; this.route = ''; this.history = []; } })
            } else if (this.route) {
              ProfileDetailPage({ page: this.route, onBack: () => this.back() })
            } else if (this.tab === 0) {
              if (this.live && this.liveZones.length === 0) {
                PageHeader({ title: '巡检', actionLabel: '巡检任务', onAction: () => this.open('patrol'),
                  connected: !this.inspectionLoading && !this.inspectionError })
                Column({ space: 12 }) {
                  Text(this.inspectionLoading ? '正在加载巡检节点…' : this.inspectionError || '暂无授权巡检节点')
                    .fontColor(T.text(this.dark))
                  ActionButton({ label: '刷新', outlined: true, isEnabled: !this.inspectionLoading,
                    onAction: () => this.loadInspection() })
                }.width('100%').padding(16)
              } else {
                InspectionPage({ zones: this.live ? this.liveZones : ZONES, live: this.live,
                  zoneIndex: $zoneIndex, perspective: $perspective,
                  onOpenPatrol: () => this.open('patrol'),
                  onSelectNode: (node: SensorNode) => { this.quickNode = node; this.quickOpen = true; },
                  onOpenNode: (node: SensorNode) => this.openNode(node) })
              }
            } else if (this.tab === 1) {
              OrdersPage({ onOpenTask: (nodeId: string) => { this.taskNodeId = nodeId; this.open('task'); } })
            } else if (this.tab === 2) {
              AssistantPage({ onOpenTask: () => {
                this.tab = 1;
                if (!this.live) { this.taskNodeId = 'B-03'; this.open('task'); }
              } })
            } else {
              ProfilePage({ onOpen: (page: string) => this.open(page), onLogout: () => this.logout() })
            }
          }.width('100%').layoutWeight(1)
          if (!this.route && !this.liveOrderDetailOpen) { this.navigationBar() }
        }.height('100%').width('100%')
      }
      if (this.quickOpen) {
        NodeQuickSheet({ node: this.quickNode, onClose: () => this.quickOpen = false,
          onOpenNode: () => { this.quickOpen = false; this.openNode(this.quickNode); } })
      }
      if (this.repairOpen) {
        RepairSheet({ node: this.node, initialSuggestion: this.repairSuggestion,
          onClose: () => this.repairOpen = false, onCreate: () => this.createTask() })
      }
    }.height('100%').width('100%').backgroundColor(T.bg(this.dark))
      .expandSafeArea([SafeAreaType.SYSTEM], [SafeAreaEdge.TOP, SafeAreaEdge.BOTTOM])
  }
}
