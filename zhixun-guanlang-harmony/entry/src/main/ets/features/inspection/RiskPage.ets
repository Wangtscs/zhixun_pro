import { T } from '../../common/Theme';
import { PageHeader, ActionButton, AppIcon } from '../../common/Ui';
import { SensorNode, riskLabel } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';

@Component
export struct RiskPage {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop node: SensorNode = ZONES[1].nodes[0];
  onBack: () => void = () => {};
  onCreateTask: () => void = () => {};
  @State expanded: boolean = true;
  @Builder
  evidence(label: string, value: string, note: string) {
    Row() {
      Text(label).fontSize(11).fontColor(T.muted(this.dark)).width(70)
      Text(value).fontSize(12).fontColor(T.text(this.dark)).layoutWeight(1)
      Text(note).fontSize(10).fontColor(T.muted(this.dark))
    }.width('100%').height(36)
  }
  build() {
    Column() {
      PageHeader({ title: 'AI 风险研判', subtitle: '14:31 更新', back: true, onBack: this.onBack })
      Scroll() {
        Column({ space: 18 }) {
          Row({ space: 12 }) {
            Row() { AppIcon({ name: 'spark', iconSize: 26, color: T.tint(this.dark) }) }
              .width(46).height(46).justifyContent(FlexAlign.Center).backgroundColor('#1535E0D0').borderRadius(13)
            Column({ space: 4 }) {
              Text('风险等级').fontSize(11).fontColor(T.muted(this.dark))
              Text(this.node.state === 'alarm' ? '高' : this.node.state === 'watch' ? '中' : '低')
                .fontSize(30).fontWeight(FontWeight.Bold).fontColor(T.state(this.node.state))
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            Text('节点 ' + this.node.id).fontSize(11).fontColor(T.muted(this.dark)).padding(7)
              .backgroundColor(T.inset(this.dark)).borderRadius(5)
          }.width('100%')
          Text(this.node.state === 'alarm' ? this.node.place.split(' · ')[0] + '甲烷浓度持续上升，结合红外温度异常，疑似阀门接口发生微量泄漏。' : this.node.state === 'watch' ? this.node.id + ' 指标偏离历史基线，建议现场复测并检查设备状态。' : this.node.id + ' 当前各项指标正常，暂无明显风险，建议保持例行巡检。')
            .fontSize(13).lineHeight(24).fontColor(T.text(this.dark)).width('100%')
          Row({ space: 10 }) {
            AppIcon({ name: 'clock', iconSize: 20, color: T.danger })
            Column({ space: 7 }) {
              Text(this.node.state === 'alarm' ? '趋势预测 · 置信度 92%' : '趋势预测 · 基于当前读数').fontSize(10).fontColor(this.dark ? '#87696D' : '#A34A50')
              Text(this.node.state === 'alarm' ? '预计 15 分钟后达到报警阈值' : '短期暂无达到报警阈值趋势').fontSize(11).fontColor(T.danger)
            }.alignItems(HorizontalAlign.Start)
          }.width('100%').padding(12).borderRadius({ topRight: 10, bottomRight: 10 }).backgroundColor('#0BFF4D4F')
            .border({ width: { left: 3 }, color: T.danger })
          Text('建议立即执行').fontSize(12).fontColor(T.muted(this.dark)).width('100%')
          Row({ space: 7 }) {
            ForEach([0, 1, 2], (index: number) => {
              Column({ space: 9 }) {
                Text((index + 1).toString()).fontSize(12).fontWeight(FontWeight.Bold).fontColor(T.tint(this.dark))
                  .width(24).height(24).textAlign(TextAlign.Center).borderRadius(12).backgroundColor('#1535E0D0')
                Text(this.node.state === 'alarm' ? ['关闭 ' + this.node.id + '\n上游阀门', '启动燃气舱\n强制通风', '携检测仪\n复核接口'][index] : ['复测 ' + this.node.id + '\n现场读数', '检查设备\n运行状态', '记录数据\n持续观察'][index])
                  .fontSize(12).lineHeight(20).fontColor(T.text(this.dark)).textAlign(TextAlign.Center)
              }.layoutWeight(1).padding(12).borderRadius(12).backgroundColor(T.inset(this.dark))
            })
          }.width('100%')
          Column() {
            Row() {
              Text('判断依据').fontSize(14).fontColor(T.text(this.dark)).layoutWeight(1)
              Text(this.expanded ? '⌄' : '›').fontSize(20).fontColor(T.muted(this.dark))
            }.width('100%').height(44).onClick(() => this.expanded = !this.expanded)
            if (this.expanded) {
              this.evidence('甲烷浓度', this.node.methane + ' %LEL', this.node.state === 'alarm' ? '30 分钟上升 7.4' : '报警阈值 25 %LEL')
              this.evidence('红外温度', this.node.infrared + ' ℃', this.node.state === 'alarm' ? '高于历史基线 9.8℃' : '设备表面实测温度')
              this.evidence('模型依据', riskLabel(this.node), '气体 + 温度读数联合评估')
            }
          }.padding({ left: 12, right: 12, bottom: 8 }).width('100%').backgroundColor(T.inset(this.dark)).borderRadius(12)
          Row({ space: 7 }) {
            AppIcon({ name: 'info', iconSize: 16 })
            Text('由管廊风险模型 v3.6 生成，仅供处置决策参考').fontSize(10).fontColor(T.muted(this.dark))
          }.width('100%')
        }.padding(16).width('100%').backgroundColor(T.card(this.dark)).borderRadius(16)
          .border({ width: 1, color: T.border(this.dark) }).margin({ top: 12, bottom: 12 })
      }.width('100%').layoutWeight(1).padding({ left: 12, right: 12 }).scrollBar(BarState.Off).align(Alignment.Top)
      Row({ space: 10 }) {
        Row() { ActionButton({ label: '稍后处理', outlined: true, onAction: this.onBack }) }.layoutWeight(1)
        Button('立即派单', { type: ButtonType.Normal }).height(52).layoutWeight(2).borderRadius(13)
          .backgroundColor(T.danger).fontSize(14).fontColor('#FFFFFF').onClick(this.onCreateTask)
      }.width('100%').padding(12).backgroundColor(T.card(this.dark))
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
