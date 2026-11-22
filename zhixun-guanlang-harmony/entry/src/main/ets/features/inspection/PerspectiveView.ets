import { T } from '../../common/Theme';
import { SensorNode, Zone, riskLabel } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';
import { chartState } from './NodeCard';

@Component
struct TunnelScan {
  @StorageLink('darkMode') dark: boolean = true;
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private scanWidth: number = 0;
  private scanHeight: number = 0;
  private started: number = 0;
  private timer: number = -1;

  aboutToAppear(): void { this.started = Date.now(); }
  aboutToDisappear(): void { clearInterval(this.timer); }

  // CSS ease-in-out uses cubic-bezier(.42, 0, .58, 1).
  private ease(progress: number): number {
    let low = 0;
    let high = 1;
    for (let index = 0; index < 10; index++) {
      const t = (low + high) / 2;
      const x = 1.26 * (1 - t) * (1 - t) * t + 1.74 * (1 - t) * t * t + t * t * t;
      if (x < progress) { low = t; } else { high = t; }
    }
    const t = (low + high) / 2;
    return t * t * (3 - 2 * t);
  }

  private draw(): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.scanWidth, this.scanHeight);
    const phase = ((Date.now() - this.started) % 5500) / 5500;
    if (phase <= 0.08 || phase >= 0.92) { return; }
    const y = this.scanHeight * (0.12 + 0.74 * this.ease((phase - 0.08) / 0.84));
    let opacity = 0.75;
    if (phase < 0.18) { opacity *= this.ease((phase - 0.08) / 0.10); }
    else if (phase < 0.82) { opacity -= 0.20 * this.ease((phase - 0.18) / 0.64); }
    else { opacity = 0.55 * (1 - this.ease((phase - 0.82) / 0.10)); }
    const left = this.scanWidth * 0.05;
    const length = this.scanWidth * 0.90;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = 'rgba(53,224,208,0.2)';
    ctx.fillRect(left, y - 5, length, 1);
    ctx.fillRect(left, y + 5, length, 1);
    ctx.shadowBlur = 7;
    ctx.shadowColor = this.dark ? '#35E0D0' : 'rgba(0,126,115,0.5)';
    ctx.fillStyle = this.dark ? 'rgba(53,224,208,0.66)' : 'rgba(0,126,115,0.69)';
    ctx.fillRect(left, y, length, 1);
    ctx.restore();
  }

  build() {
    Canvas(this.context).width('100%').height('100%')
      .hitTestBehavior(HitTestMode.None)
      .onReady(() => {
        clearInterval(this.timer);
        this.timer = setInterval(() => this.draw(), 33);
      })
      .onAreaChange((_old: Area, area: Area) => {
        this.scanWidth = Number(area.width); this.scanHeight = Number(area.height); this.draw();
      })
  }
}

@Component
export struct PerspectiveView {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop @Watch('resetMarkers') zone: Zone = ZONES[1];
  @Prop live: boolean = false;
  @State markerPage: number = 0;
  onSelectNode: (node: SensorNode) => void = () => {};
  private x: number[] = [285, 197, 102];
  private y: number[] = [286, 337, 392];
  private resetMarkers(): void { this.markerPage = 0; }
  build() {
    Column() {
      Row({ space: 6 }) {
        Circle().width(6).height(6).fill(T.accent)
        Text('实时空间透视').fontSize(11).fontColor(T.text(this.dark))
        Blank()
        Text(this.live ? this.zone.nodes.length + ' 个监测节点' : '数据延迟 28ms')
          .fontSize(10).fontColor(T.muted(this.dark))
      }.height(42).padding({ left: 12, right: 12 }).width('100%')
      Stack({ alignContent: Alignment.TopStart }) {
        Image($rawfile('icons/tunnel.svg')).width('100%').height(430).objectFit(ImageFit.Fill)
        ForEach(this.zone.nodes.slice(this.markerPage * 3, this.markerPage * 3 + 3), (node: SensorNode, index: number) => {
          Column({ space: 3 }) {
            Column({ space: 2 }) {
              Text(node.id).fontSize(10).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
              Text(node.methane === '—' ? '甲烷 暂无读数' : '甲烷 ' + node.methane + ' %LEL')
                .fontSize(9).fontColor(T.state(chartState(node)))
              Text(riskLabel(node)).fontSize(9).fontColor(T.state(node.state))
            }.alignItems(HorizontalAlign.Start).padding(7).width(92).borderRadius(8)
              .backgroundColor(T.inset(this.dark)).border({ width: 1, color: T.state(chartState(node)) })
            Circle().width(12).height(12).fill(T.state(chartState(node)))
          }.position({ x: (this.x[index] / 366 * 80 - 4) + '%', y: (this.y[index] - 55) / 530 * 430 })
            .onClick(() => this.onSelectNode(node)).accessibilityText('查看节点 ' + node.id + ' 快速信息')
        }, (node: SensorNode) => node.id + '|' + node.lastSeen + '|' + node.state + '|' + node.methane)
        Row() {
          Text(this.zone.nodes[this.markerPage * 3]?.place.split(' · ').pop() || '').fontSize(10).fontColor(T.muted(this.dark))
          Blank()
          Text(this.zone.nodes[Math.min(this.markerPage * 3 + 2, this.zone.nodes.length - 1)]?.place.split(' · ').pop() || '')
            .fontSize(10).fontColor(T.muted(this.dark))
        }.width('100%').padding(8).position({ x: 0, y: 402 })
        TunnelScan()
      }.height(430).width('100%').backgroundColor(T.inset(this.dark))
      Row() {
        Column({ space: 3 }) {
          Text(this.live ? this.zone.name : this.zone.id + ' · ' + this.zone.name).fontSize(11).fontColor(T.text(this.dark))
          Text('空间节点 ' + Math.min(this.zone.nodes.length, this.markerPage * 3 + 3) + ' / ' + this.zone.count)
            .fontSize(10).fontColor(T.muted(this.dark))
        }.alignItems(HorizontalAlign.Start)
        Blank()
        if (this.live) {
          Text('点位布局示意').fontSize(10).fontColor(T.muted(this.dark))
        } else {
          Row({ space: 6 }) {
            Text('● 正常').fontSize(10).fontColor(T.state('normal'))
            Text('● 关注').fontSize(10).fontColor(T.state('watch'))
            Text('● 警告').fontSize(10).fontColor(T.state('alarm'))
          }
        }
      }.width('100%').height(56).padding(12)
      if (this.live && this.zone.nodes.length > 3) {
        Row({ space: 12 }) {
          Text('上一组').fontSize(11).fontColor(T.tint(this.dark)).padding(9)
            .enabled(this.markerPage > 0).opacity(this.markerPage > 0 ? 1 : 0.4).onClick(() => this.markerPage--)
          Text('下一组').fontSize(11).fontColor(T.tint(this.dark)).padding(9)
            .enabled((this.markerPage + 1) * 3 < this.zone.nodes.length)
            .opacity((this.markerPage + 1) * 3 < this.zone.nodes.length ? 1 : 0.4).onClick(() => this.markerPage++)
        }.width('100%').justifyContent(FlexAlign.Center)
      }
    }.width('100%').borderRadius(16).clip(true).backgroundColor(T.card(this.dark))
      .border({ width: 1, color: T.border(this.dark) })
  }
}
