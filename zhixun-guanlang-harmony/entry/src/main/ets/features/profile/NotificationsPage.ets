import { T } from '../../common/Theme';
import { AppIcon } from '../../common/Ui';

export class Notice {
  type: string; title: string; body: string; time: string;
  constructor(type: string, title: string, body: string, time: string) {
    this.type = type; this.title = title; this.body = body; this.time = time;
  }
}
export const NOTICES: Notice[] = [
  new Notice('警告', 'B-03 甲烷浓度异常', '当前 18.6 %LEL，请尽快前往复核', '2分钟前'),
  new Notice('警告', 'A-05 设备温度预警', '红外测温 38.5℃，已偏离历史基线', '16分钟前'),
  new Notice('工单', '收到新的巡检工单', 'C区排水泵检查，请于 17:30 前完成', '38分钟前'),
  new Notice('工单', '工单上报审核通过', 'B区阀门检查结果已归档', '1小时前'),
  new Notice('系统', '传感器网关已恢复连接', 'GW-B01 数据同步恢复正常', '2小时前'),
  new Notice('系统', '工业知识库更新完成', '新增 8 份设备维护手册，可离线查阅', '昨天')
];

@Component
export struct NotificationsPage {
  @StorageLink('darkMode') dark: boolean = true;
  @StorageLink('unreadCount') unread: number = 2;
  @StorageLink('noticeRead') read: number[] = [];
  @State filter: string = '全部';
  onOpen: (index: number) => void = () => {};
  private markRead(index: number): void {
    if (index < 2 && !this.read.includes(index)) { this.read = this.read.concat([index]); this.unread = Math.max(0, this.unread - 1); }
  }
  build() {
    Column({ space: 12 }) {
      Row({ space: 6 }) {
        ForEach(['全部', '警告', '工单', '系统'], (label: string) => {
          Row({ space: 4 }) {
            Text(label).fontSize(12).fontColor(this.filter === label ? T.tint(this.dark) : T.muted(this.dark))
            if (label === '警告' && this.unread > 0) {
              Text(this.unread.toString()).fontSize(10).fontColor('#FFFFFF').padding(3).backgroundColor(T.danger).borderRadius(8)
            }
          }.height(40).layoutWeight(1).justifyContent(FlexAlign.Center)
            .backgroundColor(this.filter === label ? T.selected(this.dark) : T.card(this.dark)).borderRadius(9)
            .onClick(() => this.filter = label)
        })
      }.width('100%')
      Row() {
        Text(this.filter === '全部' ? '最近消息' : this.filter + '消息').fontSize(12).fontColor(T.muted(this.dark)).layoutWeight(1)
        Text(this.unread ? this.unread + ' 条未读' : '全部消息已读').fontSize(11).fontColor(T.muted(this.dark))
      }.width('100%')
      Column() {
        ForEach(NOTICES, (notice: Notice, index: number) => {
          if (this.filter === '全部' || this.filter === notice.type) {
            Row({ space: 10 }) {
              AppIcon({ name: notice.type === '警告' ? 'bell' : notice.type === '工单' ? 'clipboard' : 'settings', iconSize: 20,
                color: notice.type === '警告' ? T.danger : T.tint(this.dark) })
              Column({ space: 4 }) {
                Text(notice.title).fontSize(13).fontWeight(600).fontColor(T.text(this.dark))
                Text(notice.body).fontSize(11).fontColor(T.muted(this.dark)).maxLines(1).textOverflow({ overflow: TextOverflow.Ellipsis })
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              Column({ space: 8 }) {
                Text(notice.time).fontSize(10).fontColor(T.muted(this.dark))
                if (index < 2 && !this.read.includes(index)) { Circle().width(5).height(5).fill(T.accent) }
              }.alignItems(HorizontalAlign.End)
            }.width('100%').height(70).padding(14).onClick(() => { this.markRead(index); this.onOpen(index); })
              .gesture(PanGesture({ direction: PanDirection.Left, distance: 50 }).onActionEnd(() => this.markRead(index)))
          }
        })
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(14).clip(true)
      Text('← 左滑可标记已读').fontSize(11).fontColor(T.muted(this.dark)).padding(8)
      Text('✓ 仅展示与你负责区域相关的通知').fontSize(11).fontColor(T.muted(this.dark)).margin({ top: 18 })
    }.width('100%').padding(14)
  }
}
