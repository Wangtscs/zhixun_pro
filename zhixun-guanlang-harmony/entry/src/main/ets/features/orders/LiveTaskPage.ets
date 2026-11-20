import { T } from '../../common/Theme';
import { ActionButton, AppIcon, PageHeader } from '../../common/Ui';
import { OrderAttachment, OrderDetail } from './OrdersPage';
import { OrderDetailSummary } from './OrderDetailSummary';
import { orderAction, orderDeadline, orderPriority } from './OrderDetailState';
import { TaskChecklist } from './TaskChecklist';

@Component
export struct LiveTaskPage {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop order: OrderDetail = { id: 0, title: '', status: '' };
  @Prop statusLabel: string = '';
  @Prop busy: boolean = false;
  @Prop error: string = '';
  @Prop completed: number[] = [];
  @State showDescription: boolean = false;
  @Link result: string;
  onBack: () => void = () => {};
  onRefresh: () => void = () => {};
  onAdvance: () => void = () => {};
  onToggle: (index: number) => void = () => {};

  private steps(): string[] {
    return ['抵达 ' + (this.order.node_code || '工单') + ' 点位', '使用便携检测仪复核现场读数',
      '检查设备外观及通信连接', '对照历史基线记录变化情况', '记录复核结果并拍照留档'];
  }

  private editable(): boolean {
    return !this.busy && (this.order.status === 'DRAFT' || this.order.status === 'PENDING' ||
      !!orderAction(this.order.status));
  }

  private photos(): OrderAttachment[] {
    return (this.order.attachments || []).filter((file: OrderAttachment) =>
      (file.content_type || '').startsWith('image/'));
  }

  private actionLabel(): string {
    const action = orderAction(this.order.status);
    return action === 'accept' ? '接单' : action === 'start' ? '开始处理' :
      action === 'submit' ? '完成并上报' : this.order.status === 'COMPLETED' ? '任务已完成上报' : '已上报，待复核';
  }

  @Builder
  evidence() {
    Column({ space: 12 }) {
      Row() {
        Text('现场照片').fontSize(12).fontWeight(600).fontColor(T.text(this.dark)).layoutWeight(1)
        Text(this.photos().length + ' 张').fontSize(8).fontColor(T.muted(this.dark))
      }.width('100%')
      if (this.photos().length === 0) {
        Text('暂无现场照片').fontSize(10).fontColor(T.muted(this.dark)).width('100%')
      } else {
        ForEach(this.photos(), (file: OrderAttachment) => {
          Row({ space: 8 }) {
            AppIcon({ name: 'camera', iconSize: 16, color: T.tint(this.dark) })
            Text(file.original_name).fontSize(10).fontColor(T.text(this.dark)).layoutWeight(1)
          }.width('100%').padding(8).borderRadius(8).backgroundColor(T.inset(this.dark))
        }, (file: OrderAttachment) => file.id.toString())
      }
      if (this.order.status === 'PROCESSING' || this.order.result_text) {
        Text('处理结果').fontSize(12).fontWeight(600).fontColor(T.text(this.dark)).width('100%')
      }
      if (this.order.status === 'PROCESSING') {
        TextArea({ placeholder: '补充现场情况、读数或处置结果…', text: this.result })
          .height(76).maxLength(4000).fontSize(10).fontColor(T.text(this.dark))
          .placeholderColor(T.muted(this.dark)).backgroundColor(T.inset(this.dark)).borderRadius(10)
          .border({ width: 1, color: T.border(this.dark) }).enabled(!this.busy)
          .onChange((value: string) => this.result = value)
      } else if (this.order.result_text) {
        Text(this.order.result_text).fontSize(11).lineHeight(18).fontColor(T.text(this.dark)).width('100%')
      }
    }.width('100%').padding(14).backgroundColor(T.card(this.dark)).borderRadius(16)
      .border({ width: 1, color: T.border(this.dark) })
  }

  build() {
    Column() {
      PageHeader({ title: '工单详情', subtitle: this.statusLabel, back: true,
        actionLabel: this.busy ? '' : '刷新', onBack: this.onBack, onAction: this.onRefresh })
      Scroll() {
        Column({ space: 12 }) {
          OrderDetailSummary({ number: this.order.number || '#' + this.order.id,
            location: this.order.node_code || '—', gradeLabel: '工单优先级',
            grade: orderPriority(this.order.priority || ''), deadline: orderDeadline(this.order.due_at || '') })
          Text(this.order.title).fontSize(13).fontWeight(600).fontColor(T.text(this.dark)).width('100%')
          if (this.error) { Text(this.error).fontSize(11).fontColor(T.danger).width('100%') }
          if (this.busy) { LoadingProgress().width(24).height(24) }
          TaskChecklist({ steps: this.steps(), completed: this.completed, editable: this.editable(), onToggle: this.onToggle })
          this.evidence()
          if (this.order.description) {
            Column({ space: 8 }) {
              Button(this.showDescription ? '收起报修说明' : '查看报修说明', { type: ButtonType.Normal })
                .width('100%').fontSize(11).fontColor(T.tint(this.dark)).backgroundColor(T.inset(this.dark))
                .borderRadius(10).onClick(() => this.showDescription = !this.showDescription)
              if (this.showDescription) {
                Text(this.order.description).fontSize(11).lineHeight(18).fontColor(T.text(this.dark)).width('100%')
              }
            }.width('100%').padding(14).backgroundColor(T.card(this.dark)).borderRadius(16)
              .border({ width: 1, color: T.border(this.dark) })
          }
        }.padding(12).width('100%')
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      if (orderAction(this.order.status) || this.order.status === 'REVIEW' || this.order.status === 'COMPLETED') {
        Row() {
          ActionButton({ label: this.actionLabel(), isEnabled: !this.busy && !!orderAction(this.order.status),
            onAction: this.onAdvance })
        }.width('100%').padding(12).backgroundColor(T.card(this.dark))
      } else if (this.order.status === 'DRAFT' || this.order.status === 'PENDING') {
        Text('等待网页管理端派单。手机接单并开始处理后即可上报。').fontSize(11).fontColor(T.muted(this.dark))
          .width('100%').textAlign(TextAlign.Center).padding(12).backgroundColor(T.card(this.dark))
      }
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
