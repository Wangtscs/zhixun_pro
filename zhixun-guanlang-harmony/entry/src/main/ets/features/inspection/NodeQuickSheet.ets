import { T } from '../../common/Theme';
import { ActionButton } from '../../common/Ui';
import { SensorNode, riskLabel } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';

@Component
export struct NodeQuickSheet {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop node: SensorNode = ZONES[1].nodes[0];
  onClose: () => void = () => {};
  onOpenNode: () => void = () => {};

  @Builder
  metric(label: string, value: string, unit: string) {
    Column({ space: 5 }) {
      Text(label).fontSize(9).fontColor(T.muted(this.dark))
      Row({ space: 3 }) {
        Text(value).fontSize(21).fontWeight(600).fontColor(T.text(this.dark))
        Text(unit).fontSize(8).fontColor(T.muted(this.dark))
      }.alignItems(VerticalAlign.Bottom)
    }.alignItems(HorizontalAlign.Start).layoutWeight(1).padding(10)
      .backgroundColor(T.inset(this.dark)).borderRadius(10).border({ width: 1, color: T.border(this.dark) })
  }

  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column().width('100%').height('100%').backgroundColor('#A605090D').onClick(this.onClose)
      Column({ space: 12 }) {
        Rect().width(36).height(4).radius(2).fill(T.border(this.dark)).alignSelf(ItemAlign.Center)
        Row({ space: 8 }) {
          Circle().width(8).height(8).fill(T.state(this.node.state))
          Column({ space: 4 }) {
            Text('节点 ' + this.node.id).fontSize(16).fontWeight(600).fontColor(T.text(this.dark))
            Text(this.node.place).fontSize(9).fontColor(T.muted(this.dark))
          }.alignItems(HorizontalAlign.Start).layoutWeight(1)
          Text(this.node.live ? riskLabel(this.node) : this.node.state === 'alarm' ? '警告' : this.node.state === 'watch' ? '关注' : '正常')
            .fontSize(10).fontColor(T.state(this.node.state)).padding(5).borderRadius(5).backgroundColor(T.inset(this.dark))
          Text('×').fontSize(22).fontColor(T.muted(this.dark)).width(32).height(36).textAlign(TextAlign.Center)
            .onClick(this.onClose).accessibilityText('关闭节点信息')
        }.width('100%')
        Row({ space: 7 }) {
          this.metric('甲烷', this.node.methane, '%LEL')
          this.metric('温度', this.node.temp, '℃')
          if (this.node.live) { this.metric('湿度', this.node.humidity, '%RH') } else { this.metric('健康度', this.node.score.toString(), '') }
        }.width('100%')
        ActionButton({ label: '查看详情  ›', onAction: this.onOpenNode })
      }.width('100%').padding({ top: 8, left: 12, right: 12, bottom: 20 }).backgroundColor(T.card(this.dark))
        .borderRadius({ topLeft: 18, topRight: 18 }).onClick(() => {})
    }.width('100%').height('100%')
  }
}
