import { T } from '../../common/Theme';
import { riskLabel, SensorNode } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';

export function chartState(node: SensorNode): string {
  return node.state;
}

export function cardStatusLabel(node: SensorNode): string {
  const state = chartState(node);
  if (node.live) { return riskLabel(node); }
  return state === 'alarm' ? '浓度持续上升' : state === 'watch' ? '建议关注' : '运行正常';
}

@Component
export struct TrendChart {
  @StorageLink('darkMode') @Watch('draw') dark: boolean = true;
  @Prop @Watch('draw') state: string = 'normal';
  @Prop large: boolean = false;
  @Prop @Watch('draw') node: SensorNode = ZONES[1].nodes[0];
  private timer: number = -1;
  private sampleTime: number = Math.floor(Date.now() / 2000);
  aboutToAppear(): void {
    this.timer = setInterval(() => {
      const sampleTime = Math.floor(Date.now() / 2000);
      if (sampleTime !== this.sampleTime) {
        this.sampleTime = sampleTime;
        this.draw();
      }
    }, 2000);
  }
  aboutToDisappear(): void { clearInterval(this.timer); }

  private baseline(): number {
    const value = parseFloat(this.node.methane);
    return !Number.isFinite(value) ? 8 : Math.max(0, value);
  }
  private methaneSample(sampleTime: number, baseline: number): number {
    let seed = 0;
    for (let index = 0; index < this.node.id.length; index++) {
      seed = (seed * 31 + this.node.id.charCodeAt(index)) % 1009;
    }
    const phase = sampleTime + seed;
    return Math.max(0, baseline + 0.55 * Math.sin(phase * 0.51) + 0.28 * Math.sin(phase * 1.7));
  }
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private chartWidth: number = 240;
  private chartHeight: number = 80;
  private draw(): void {
    const ctx = this.context;
    ctx.clearRect(0, 0, this.chartWidth, this.chartHeight);
    ctx.save();
    ctx.scale(this.chartWidth / 240, this.chartHeight / 80);
    const baseline = this.baseline();
    const minimum = Math.max(0, baseline - 1.2);
    const maximum = baseline + 1.2;
    if (this.large) {
      ctx.strokeStyle = T.border(this.dark); ctx.lineWidth = 0.8;
      [16, 40, 64].forEach((y: number) => { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(240, y); ctx.stroke(); });
      if (!this.node.live && minimum < 25 && maximum > 25) {
        const thresholdY = 80 * (maximum - 25) / (maximum - minimum);
        ctx.strokeStyle = '#FF4D4F66'; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(0, thresholdY); ctx.lineTo(240, thresholdY); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    let endY = 0;
    ctx.strokeStyle = T.state(this.state); ctx.lineWidth = this.large ? 2.5 : 2;
    ctx.beginPath();
    for (let index = 0; index < 13; index++) {
      const value = this.methaneSample(this.sampleTime - 12 + index, baseline);
      endY = 80 * (maximum - value) / (maximum - minimum);
      if (index === 0) { ctx.moveTo(4, endY); }
      else { ctx.lineTo(4 + index * 232 / 12, endY); }
    }
    ctx.stroke();
    ctx.fillStyle = T.state(this.state); ctx.beginPath(); ctx.arc(236, endY, 3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  build() {
    Canvas(this.context).width('100%').height(this.large ? 122 : 18)
      .onReady(() => this.draw())
      .onAreaChange((_old: Area, area: Area) => {
        this.chartWidth = Number(area.width); this.chartHeight = Number(area.height); this.draw();
      })
  }
}

@Component
export struct NodeCard {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop node: SensorNode = ZONES[1].nodes[0];
  onOpen: () => void = () => {};
  @Builder
  metric(label: string, value: string, unit: string, index: number) {
    Column({ space: 2 }) {
      Text(label).fontSize(12).lineHeight(16).fontColor(T.muted(this.dark))
      Row({ space: 2 }) {
        Text(value).fontSize(20).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
        Text(unit).fontSize(11).fontColor(T.muted(this.dark)).margin({ top: 6 })
      }
    }.alignItems(HorizontalAlign.Start).layoutWeight(1).height(40)
      .padding({ left: index === 0 ? 0 : 8, right: 8 })
      .border({ width: { right: index === 2 ? 0 : 1 }, color: T.border(this.dark) })
  }
  build() {
    Stack({ alignContent: Alignment.TopEnd }) {
      Column() {
        Row({ space: 8 }) {
          if (chartState(this.node) === 'alarm') { Circle().width(5).height(5).fill(T.danger) }
          Text(this.node.id).fontSize(14).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
          Text(this.node.place).fontSize(10).fontColor(T.muted(this.dark))
        }.width('100%').height(22).padding({ right: this.node.live ? 0 : 46 })
        Row() {
          this.metric('甲烷', this.node.methane, '%LEL', 0)
          this.metric('温度', this.node.temp, '℃', 1)
          this.metric('湿度', this.node.humidity, '%RH', 2)
        }.width(this.node.live ? '100%' : 'calc(100% - 52vp)').margin({ top: 3 }).alignSelf(ItemAlign.Start)
        Row() {
          Text(cardStatusLabel(this.node))
            .fontSize(10).fontColor(T.state(chartState(this.node))).padding({ left: 6, right: 6, top: 3, bottom: 3 })
            .backgroundColor(chartState(this.node) === 'alarm' ? '#15FF4D4F' : chartState(this.node) === 'watch' ? '#15FFB020' : '#1535E0D0').borderRadius(4)
          Blank()
          if (!this.node.live) {
            Text('24s').fontSize(10).fontColor(T.muted(this.dark)).margin({ right: 6 })
            Row() { TrendChart({ node: this.node, state: chartState(this.node) }) }.width(78).height(20)
          }
        }.width('100%').margin({ top: 4 })
      }.width('100%')
      if (!this.node.live) {
        Column({ space: 2 }) {
          Stack() {
            Progress({ value: this.node.score, total: 100, type: ProgressType.Ring })
              .width(44).height(44).color(T.state(chartState(this.node)))
              .backgroundColor(T.border(this.dark)).style({ strokeWidth: 4 })
            Text(this.node.score.toString()).fontSize(12).fontWeight(FontWeight.Bold)
              .fontColor(T.state(chartState(this.node)))
          }.width(44).height(44)
        }.width(44)
      }
    }.height(116).width('100%').padding(14).backgroundColor(T.card(this.dark))
      .border({ width: { left: chartState(this.node) === 'alarm' ? 3 : 1, right: 1, top: 1, bottom: 1 },
        color: { left: chartState(this.node) === 'alarm' ? T.danger : T.border(this.dark), right: T.border(this.dark), top: T.border(this.dark), bottom: T.border(this.dark) } })
      .borderRadius(16).onClick(this.onOpen)
      .accessibilityText('节点 ' + this.node.id + '，查看详情')
  }

}
