import { T } from '../../common/Theme';

export interface TrendSample {
  time: number;
  value: number;
}

@Component
export struct LiveTrendChart {
  @StorageLink('darkMode') @Watch('draw') dark: boolean = true;
  @Prop @Watch('draw') samples: TrendSample[] = [];
  private context: CanvasRenderingContext2D = new CanvasRenderingContext2D(new RenderingContextSettings(true));
  private chartWidth: number = 0;
  private chartHeight: number = 0;

  private draw(): void {
    const ctx = this.context;
    const width = this.chartWidth;
    const height = this.chartHeight;
    if (width <= 16 || height <= 16) { return; }
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = T.border(this.dark);
    ctx.lineWidth = 1;
    for (let row = 1; row <= 3; row++) {
      const y = row * height / 4;
      ctx.beginPath(); ctx.moveTo(8, y); ctx.lineTo(width - 8, y); ctx.stroke();
    }
    if (this.samples.length === 0) { return; }

    const last = this.samples[this.samples.length - 1];
    const start = last.time - 24000;
    const visible = this.samples.filter((sample: TrendSample) => sample.time >= start);
    const values = visible.map((sample: TrendSample) => sample.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const padding = Math.max((maximum - minimum) * 0.1, 0.1);

    ctx.strokeStyle = T.tint(this.dark);
    ctx.lineWidth = 2;
    ctx.beginPath();
    let x = width - 8;
    let y = height / 2;
    visible.forEach((sample: TrendSample, index: number) => {
      x = 8 + (sample.time - start) / 24000 * (width - 16);
      y = 8 + (maximum + padding - sample.value) / (maximum - minimum + 2 * padding) * (height - 16);
      if (index === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
    });
    ctx.stroke();
    ctx.fillStyle = T.tint(this.dark);
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
  }

  build() {
    Canvas(this.context).width('100%').height(122)
      .onReady(() => this.draw())
      .onAreaChange((_old: Area, area: Area) => {
        this.chartWidth = Number(area.width);
        this.chartHeight = Number(area.height);
        this.draw();
      })
  }
}
