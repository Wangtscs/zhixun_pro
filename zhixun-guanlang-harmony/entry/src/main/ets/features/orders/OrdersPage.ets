import { T } from '../../common/Theme';
import { PageHeader } from '../../common/Ui';
import { TaskRepository } from '../../services/TaskRepository';

export interface OrderSummary {
  id: number;
  title: string;
  status: string;
  node_code?: string;
  description?: string;
  result_text?: string;
}

export interface OrderAttachment {
  id: number;
  original_name: string;
  content_type?: string;
}

export interface OrderDetail extends OrderSummary {
  number?: string;
  priority?: string;
  due_at?: string;
  readings?: string;
  attachments?: OrderAttachment[];
}

@Component
export struct OrdersPage {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop live: boolean = false;
  @Prop rows: OrderSummary[] = [];
  @Prop loading: boolean = false;
  @Prop error: string = '';
  onOpenTask: (nodeId: string) => void = () => {};
  onOpenOrder: (id: number) => void = () => {};
  onRefresh: () => void = () => {};
  formatStatus: (status: string) => string = (status: string) => status;
  @State b03Progress: number = 2;
  @State c06Progress: number = 4;

  private countByStatus(statuses: string[]): string {
    return this.rows.filter((row: OrderSummary) => statuses.includes(row.status)).length.toString();
  }

  aboutToAppear(): void {
    this.b03Progress = TaskRepository.get('B-03').completed.length;
    this.c06Progress = TaskRepository.get('C-06').completed.length;
  }
  @Builder
  stat(value: string, label: string) {
    Column({ space: 6 }) {
      Text(value).fontSize(26).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
      Text(label).fontSize(11).fontColor(T.muted(this.dark))
    }.alignItems(HorizontalAlign.Start).padding(14).layoutWeight(1).height(80).backgroundColor(T.card(this.dark))
      .borderRadius(14).border({ width: 1, color: T.border(this.dark) })
  }
  @Builder
  order(nodeId: string, title: string, subtitle: string, risk: string, deadline: string, progress: number, primary: boolean) {
    Column({ space: 12 }) {
      Row() {
        Text(risk).fontSize(10).fontColor(primary ? T.danger : T.warning)
          .padding({ left: 7, right: 7, top: 4, bottom: 4 }).borderRadius(5)
          .backgroundColor(primary ? '#15FF4D4F' : '#15FFB020')
        Blank()
        Text(deadline).fontSize(10).fontColor(T.muted(this.dark))
      }.width('100%')
      Text(title).fontSize(15).fontWeight(600).fontColor(T.text(this.dark)).width('100%')
      Text(subtitle).fontSize(10).fontColor(T.muted(this.dark)).width('100%')
      if (progress >= 0) {
        Column({ space: 4 }) {
          Text(progress + '/5').fontSize(10).fontColor(T.muted(this.dark)).alignSelf(ItemAlign.End)
          Progress({ value: progress, total: 5, type: ProgressType.Linear }).color(T.accent)
            .backgroundColor(T.border(this.dark)).style({ strokeWidth: 4 }).width('100%')
        }.width('100%').margin({ top: 3 })
      }
    }.width('100%').padding(16).backgroundColor(T.card(this.dark)).borderRadius(16)
      .border({ width: 1, color: T.border(this.dark) })
      .onClick(() => { if (this.live) { this.onOpenOrder(Number(nodeId)); } else { this.onOpenTask(nodeId); } })
  }
  build() {
    Column() {
      PageHeader({ title: '我的工单', subtitle: this.live ? this.rows.length + ' 项工单' : '今日 3 项任务',
        connected: !this.error, actionLabel: this.live && !this.loading ? '刷新' : '', onAction: this.onRefresh })
      Scroll() {
        Column({ space: 12 }) {
          if (this.live) {
            Row({ space: 9 }) {
              this.stat(this.countByStatus(['DRAFT', 'PENDING', 'ASSIGNED']), '待处理')
              this.stat(this.countByStatus(['ACCEPTED', 'PROCESSING', 'REVIEW']), '处理中')
              this.stat(this.countByStatus(['COMPLETED']), '已完成')
            }.width('100%')
            if (this.loading) { LoadingProgress().width(24).height(24) }
            if (this.error) { Text(this.error).fontSize(13).fontColor(T.danger).width('100%') }
            if (!this.loading && !this.error && this.rows.length === 0) {
              Text('暂无工单').fontSize(13).fontColor(T.muted(this.dark)).width('100%').padding(16)
            }
            ForEach(this.rows, (row: OrderSummary) => {
              this.order(row.id.toString(), row.title, row.node_code || '', this.formatStatus(row.status), '', -1, false)
            }, (row: OrderSummary) => row.id.toString())
          } else {
          Row({ space: 9 }) {
            this.stat('1', '待处理')
            this.stat('2', '处理中')
            this.stat('12', '本月完成')
          }.width('100%')
          Column({ space: 4 }) {
            Text('进行中').fontSize(15).fontWeight(600).fontColor(T.text(this.dark))
            Text('按截止时间排序').fontSize(11).fontColor(T.muted(this.dark))
          }.width('100%').alignItems(HorizontalAlign.Start).margin({ top: 5, bottom: 2 })
          this.order('B-03', '燃气舱 B-03 异常处置', 'WO-2025-0812-017 · B区 K0+420', '高风险', '截止 15:00', this.b03Progress, true)
          this.order('C-06', 'C区排水泵例行检查', 'WO-2025-0812-012 · C区 K1+120', '一般', '截止 17:30', this.c06Progress, false)
          }
        }.width('100%').padding(12)
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
