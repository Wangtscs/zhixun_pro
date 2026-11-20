import { T } from '../../common/Theme';
import { PageHeader, AppIcon } from '../../common/Ui';
import { SensorNode, Zone } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';
import { chartState, NodeCard } from './NodeCard';
import { PerspectiveView } from './PerspectiveView';

@Component
export struct InspectionPage {
  @StorageLink('darkMode') dark: boolean = true;
  @StorageLink('sync') sync: boolean = true;
  @StorageLink('discovery') discovery: boolean = true;
  @Prop zones: Zone[] = ZONES;
  @Prop live: boolean = false;
  @Link zoneIndex: number;
  @Link perspective: boolean;
  @State filter: number = 0;
  @State filterOpen: boolean = false;
  onOpenNode: (node: SensorNode) => void = () => {};
  onOpenPatrol: () => void = () => {};
  onSelectNode: (node: SensorNode) => void = () => {};
  build() {
    Column() {
      PageHeader({ title: this.live ? this.zones[this.zoneIndex].name : this.zones[this.zoneIndex].id + ' · ' + this.zones[this.zoneIndex].name,
        connected: this.sync, actionLabel: this.live ? '巡检任务' : '', onAction: this.onOpenPatrol })
      Scroll() {
        Column() {
          Row() {
            ForEach(['列表', '透视'], (label: string, index: number) => {
              Text(label).fontSize(11).fontColor(this.perspective === (index === 1) ? T.tint(this.dark) : T.muted(this.dark))
                .fontWeight(FontWeight.Medium).height(36).layoutWeight(1).textAlign(TextAlign.Center)
                .borderRadius(9).backgroundColor(this.perspective === (index === 1) ? T.selected(this.dark) : Color.Transparent)
                .onClick(() => this.perspective = index === 1)
            })
          }.height(44).padding(3).width('100%').backgroundColor(T.inset(this.dark)).borderRadius(12)
            .border({ width: 1, color: T.border(this.dark) }).margin({ bottom: 12 })
          Row({ space: 4 }) {
            ForEach(this.zones, (zone: Zone, index: number) => {
              Row({ space: 4 }) {
                Text(this.live ? zone.name : zone.id).fontSize(12).fontColor(this.zoneIndex === index ? T.tint(this.dark) : T.muted(this.dark))
                Text(zone.count.toString()).fontSize(7).fontColor(T.muted(this.dark))
              }.layoutWeight(1).height(44).justifyContent(FlexAlign.Center).borderRadius(10)
                .backgroundColor(this.zoneIndex === index ? T.selected(this.dark) : Color.Transparent)
                .border({ width: this.zoneIndex === index ? 1 : 0, color: this.zoneIndex === index ? '#3535E0D0' : Color.Transparent })
                .onClick(() => { this.zoneIndex = index; this.filter = 0; })
            }, (zone: Zone) => zone.id)
          }.height(52).padding(4).width('100%').backgroundColor(T.card(this.dark)).borderRadius(13).margin({ bottom: 12 })
          if (this.perspective) {
            PerspectiveView({ zone: this.zones[this.zoneIndex], live: this.live, onSelectNode: this.onSelectNode })
          } else {
            Row({ space: 12 }) {
              Row() { AppIcon({ name: 'wifi', iconSize: 24, color: T.tint(this.dark) }) }
                .width(38).height(38).justifyContent(FlexAlign.Center).borderRadius(12)
                .backgroundColor('#1035E0D0').border({ width: 1, color: '#2535E0D0' })
              Column({ space: 5 }) {
                Text(this.live ? this.zones[this.zoneIndex].count + ' 个授权节点' : '已连接 ' + this.zones[this.zoneIndex].connected + ' 个节点').fontSize(12).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
                Text(this.live ? '来自业务后端' : (this.discovery ? '自动发现运行中' : '自动发现已关闭') + ' · ' + (this.sync ? '数据刚刚更新' : '自动同步已暂停'))
                  .fontSize(8).fontColor(T.muted(this.dark))
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              if (!this.live) { AppIcon({ name: 'chevron', iconSize: 18 }) }
            }.height(68).width('100%').padding(12).backgroundColor(T.card(this.dark)).borderRadius(16)
              .border({ width: 1, color: T.border(this.dark) })
            Row() {
              Column({ space: 3 }) {
                Text('附近节点').fontSize(13).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
                Text(this.live ? '业务后端最新读数' : this.zones[this.zoneIndex].id + ' · 距离由近到远')
                  .fontSize(8).fontColor(T.muted(this.dark))
              }.alignItems(HorizontalAlign.Start).layoutWeight(1)
              Text(this.filter === 1 ? '仅异常' : this.filter === 2 ? '仅正常' : '筛选').fontSize(9).fontColor(T.muted(this.dark))
                .height(32).width(44).textAlign(TextAlign.Center).onClick(() => this.filterOpen = !this.filterOpen)
            }.width('100%').height(32).margin({ top: 10, bottom: 12 })
            if (this.filterOpen) {
              Row({ space: 8 }) {
                ForEach(['全部', '异常节点', '正常节点'], (label: string, index: number) => {
                  Text(label).fontSize(10).fontColor(this.filter === index ? T.tint(this.dark) : T.muted(this.dark))
                    .padding(8).borderRadius(8).backgroundColor(T.card(this.dark))
                    .onClick(() => { this.filter = index; this.filterOpen = false; })
                })
              }.width('100%').margin({ bottom: 10 })
            }
            Column({ space: 10 }) {
              ForEach(this.zones[this.zoneIndex].nodes.filter((node: SensorNode) => this.filter === 0 ||
                (this.filter === 1 ? chartState(node) === 'alarm' || chartState(node) === 'watch' : chartState(node) === 'normal')),
                (node: SensorNode) => { NodeCard({ node: node, onOpen: () => this.onOpenNode(node) }) },
                (node: SensorNode) => node.id + '|' + node.lastSeen + '|' + node.state + '|' + node.temp + '|' + node.humidity + '|' + node.methane)
            }.width('100%')
          }
        }.width('100%').padding({ top: 12, left: 12, right: 12, bottom: 16 })
      }.layoutWeight(1).width('100%').scrollBar(BarState.Off).align(Alignment.Top)
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
