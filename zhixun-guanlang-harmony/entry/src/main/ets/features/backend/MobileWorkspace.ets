import { T } from '../../common/Theme';
import { MobileSession } from '../../services/MobileSession';
import { OrdersPage, OrderDetail, OrderSummary } from '../orders/OrdersPage';
import { LiveTaskPage } from '../orders/LiveTaskPage';
import { LiveOrderChecks, orderAction, readOrderChecks, toggleOrderCheck, writeOrderChecks } from '../orders/OrderDetailState';
import { ProfilePage, ProfileSummary } from '../profile/ProfilePage';

interface NodeRow {
  id: number;
  code: string;
  location: string;
  area_name: string;
}

interface HandbookRow {
  id: number;
  title: string;
  steps: string;
}

interface OrderAction {
  action: string;
  result: string;
  readings?: string;
}

@Component
export struct MobileWorkspace {
  @Prop @Watch('refresh') tab: number = 0;
  @Prop @Watch('syncOrderDetail') orderDetailOpen: boolean = false;
  onOrderDetailChange: (open: boolean) => void = () => {};
  onLogout: () => void = () => {};
  onOpenHandbooks: () => void = () => {};
  onOpenProfile: (page: string) => void = () => {};
  onBack: () => void = () => {};
  @StorageLink('darkMode') dark: boolean = true;
  @State nodes: NodeRow[] = [];
  @State orders: OrderSummary[] = [];
  @State handbooks: HandbookRow[] = [];
  @State profile: ProfileSummary | undefined = undefined;
  @State selected: OrderDetail | undefined = undefined;
  @State result: string = '';
  @State completed: number[] = [];
  @State loading: boolean = false;
  @State saving: boolean = false;
  @State error: string = '';
  private revision: number = 0;

  aboutToAppear(): void { this.refresh(); }
  aboutToDisappear(): void { this.revision++; }

  private syncOrderDetail(): void {
    if (!this.orderDetailOpen && this.selected) { this.refresh(); }
  }

  private refresh(): void {
    this.selected = undefined;
    this.result = '';
    this.completed = [];
    this.nodes = [];
    this.orders = [];
    this.handbooks = [];
    this.profile = undefined;
    this.load();
  }

  private async load(orderId?: number): Promise<void> {
    const revision = ++this.revision;
    const tab = this.tab;
    this.loading = true;
    this.error = '';
    try {
      if (orderId !== undefined) {
        const row = await MobileSession.get<OrderDetail>('/api/business/orders/' + orderId);
        if (revision === this.revision) {
          this.selected = row;
          const readings = row.readings || '';
          this.completed = row.status === 'REVIEW' || row.status === 'COMPLETED' || row.status === 'CANCELLED' ?
            readOrderChecks(readings) : LiveOrderChecks.get(row.id, readings);
          this.onOrderDetailChange(true);
        }
      } else if (tab === 0) {
        const rows = await MobileSession.get<NodeRow[]>('/api/business/nodes');
        if (revision === this.revision) { this.nodes = rows; }
      } else if (tab === 1) {
        const rows = await MobileSession.get<OrderSummary[]>('/api/business/orders');
        if (revision === this.revision) { this.orders = rows; }
      } else if (tab === 2) {
        const rows = await MobileSession.get<HandbookRow[]>('/api/business/handbooks');
        if (revision === this.revision) { this.handbooks = rows; }
      } else {
        const row = await MobileSession.get<ProfileSummary>('/api/business/profile');
        if (revision === this.revision) { this.profile = row; }
      }
    } catch (error) {
      if (revision === this.revision) { this.error = (error as Error).message; }
    } finally {
      if (revision === this.revision) { this.loading = false; }
    }
  }

  private toggleCheck(index: number): void {
    const order = this.selected;
    if (!order || this.saving || this.loading) { return; }
    this.completed = toggleOrderCheck(this.completed, index);
    LiveOrderChecks.save(order.id, this.completed);
  }

  private async advance(order: OrderDetail): Promise<void> {
    if (this.saving || this.loading) { return; }
    const action = orderAction(order.status);
    if (!action) { return; }
    if (action === 'submit' && !this.result.trim()) { this.error = '请填写处理结果'; return; }
    const body: OrderAction = { action: action, result: this.result.trim() };
    if (action === 'submit') {
      body.readings = writeOrderChecks(order.readings || '', this.completed);
      if (body.readings.length > 2000) { this.error = '工单已有的读数记录过长，无法一并保存检查清单'; return; }
    }
    const revision = this.revision;
    this.saving = true;
    this.error = '';
    try {
      await MobileSession.post<Object>('/api/business/orders/' + order.id + '/action', JSON.stringify(body));
      if (revision === this.revision) {
        if (action === 'submit') { LiveOrderChecks.clear(order.id); }
        this.result = '';
        await this.load(order.id);
      }
    } catch (error) {
      if (revision === this.revision) { this.error = (error as Error).message; }
    } finally {
      this.saving = false;
    }
  }

  private status(value: string): string {
    switch (value) {
      case 'DRAFT':
      case 'PENDING': return '待派发';
      case 'ASSIGNED': return '待接单';
      case 'ACCEPTED': return '已接单';
      case 'PROCESSING': return '处理中';
      case 'REVIEW': return '待复核';
      case 'COMPLETED': return '已完成';
      case 'CANCELLED': return '已取消';
      default: return value;
    }
  }

  @Builder
  card(title: string, detail: string) {
    Column({ space: 8 }) {
      Text(title).fontSize(16).fontWeight(FontWeight.Medium).fontColor(T.text(this.dark)).width('100%')
      if (detail) { Text(detail).fontSize(13).lineHeight(21).fontColor(T.muted(this.dark)).width('100%') }
    }.width('100%').padding(16).backgroundColor(T.inset(this.dark)).borderRadius(12)
  }

  build() {
    if (this.tab === 1) {
      if (this.selected) {
        LiveTaskPage({ order: this.selected, statusLabel: this.status(this.selected.status),
          result: $result, completed: this.completed, busy: this.loading || this.saving, error: this.error,
          onToggle: (index: number) => this.toggleCheck(index),
          onBack: () => { this.onOrderDetailChange(false); },
          onRefresh: () => { if (!this.saving && !this.loading) { this.load(this.selected?.id); } },
          onAdvance: () => { if (this.selected) { this.advance(this.selected); } } })
      } else {
        OrdersPage({ live: true, rows: this.orders, loading: this.loading || this.saving, error: this.error,
          formatStatus: (status: string) => this.status(status), onRefresh: () => this.load(),
          onOpenOrder: (id: number) => { if (!this.loading && !this.saving) { this.load(id); } } })
      }
    } else if (this.tab === 3) {
      ProfilePage({ live: true, profile: this.profile, loading: this.loading, error: this.error, onLogout: this.onLogout,
        onRefresh: () => this.load(), onOpen: (page: string) => {
          if (page === 'handbooks') { this.onOpenHandbooks(); }
          else { this.onOpenProfile(page); }
        } })
    } else {
    Scroll() {
      Column({ space: 12 }) {
        Row() {
          Text(['巡检节点', '工单', '巡检手册', '我的资料'][this.tab])
            .fontSize(22).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark)).layoutWeight(1)
          Button('刷新', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(!this.loading && !this.saving).onClick(() => this.load(this.selected?.id))
          if (this.tab === 2) { Button('返回', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).onClick(this.onBack) }
        }.width('100%')
        if (this.loading || this.saving) {
          LoadingProgress().width(24).height(24)
        }
        if (this.error) { Text(this.error).fontColor(T.danger).width('100%') }
        if (this.tab === 0) {
          ForEach(this.nodes, (node: NodeRow) => {
            this.card(node.code, [node.area_name, node.location].filter((value: string) => !!value).join(' · '))
          }, (node: NodeRow) => node.id.toString())
          if (!this.loading && !this.error && this.nodes.length === 0) { this.card('暂无巡检节点', '') }
        } else if (this.tab === 2) {
          ForEach(this.handbooks, (book: HandbookRow) => {
            this.card(book.title, book.steps)
          }, (book: HandbookRow) => book.id.toString())
          if (!this.loading && !this.error && this.handbooks.length === 0) { this.card('暂无巡检手册', '') }
        }
      }.width('100%').padding(16)
    }.width('100%').height('100%').align(Alignment.Top)
    }
  }
}
