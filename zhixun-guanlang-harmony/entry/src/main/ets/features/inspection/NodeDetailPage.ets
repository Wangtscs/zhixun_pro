import { T } from '../../common/Theme';
import { PageHeader, ActionButton } from '../../common/Ui';
import { NodeReading, SensorNode, riskLabel } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';
import { chartState, TrendChart } from './NodeCard';
import { MobileSession } from '../../services/MobileSession';
import { LiveTrendChart, TrendSample } from './LiveTrendChart';

interface AlarmRecord {
  id: number;
  node_id: number;
  reason: string;
  triggered_at: string;
  status: string;
  recovered_at?: string;
}

@Component
export struct NodeDetailPage {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop @Watch('recordReadings') node: SensorNode = ZONES[1].nodes[0];
  @Prop readingLoading: boolean = false;
  @Prop readingError: string = '';
  onRefresh: () => void = () => {};
  onBack: () => void = () => {};
  onRisk: () => void = () => {};
  onRepair: () => void = () => {};
  @State showAll: boolean = false;
  @State alarms: AlarmRecord[] = [];
  @State alarmError: string = '';
  @State loadingAlarms: boolean = false;
  @State methaneSamples: TrendSample[] = [];
  private readingTimer: number = -1;
  private sampledNodeId: number = 0;

  aboutToAppear(): void {
    if (this.node.live) {
      this.loadAlarms();
      this.recordReadings();
      this.readingTimer = setInterval(() => this.onRefresh(), 5000);
    }
  }

  aboutToDisappear(): void { clearInterval(this.readingTimer); }

  private recordReadings(): void {
    if (this.sampledNodeId !== this.node.backendId) {
      this.sampledNodeId = this.node.backendId;
      this.methaneSamples = [];
    }
    this.methaneSamples = this.appendSample(this.methaneSamples, 'methane');
  }

  private appendSample(samples: TrendSample[], metric: string): TrendSample[] {
    const reading = this.node.latest.find((item: NodeReading) => item.metric === metric);
    if (!reading || !reading.source || reading.source === 'SIMULATOR' || !Number.isFinite(reading.metric_value)) {
      return samples;
    }
    const time = Date.parse(reading.collected_at || '');
    const last = samples[samples.length - 1];
    if (!Number.isFinite(time) || (last && time <= last.time)) { return samples; }
    const sample: TrendSample = { time: time, value: reading.metric_value };
    return samples.slice(-29).concat(sample);
  }

  private async loadAlarms(): Promise<void> {
    this.loadingAlarms = true;
    this.alarmError = '';
    try {
      const rows = await MobileSession.get<AlarmRecord[]>('/api/business/alarms');
      this.alarms = rows.filter((row: AlarmRecord) => row.node_id === this.node.backendId);
    } catch (error) {
      this.alarmError = (error as Error).message;
    } finally {
      this.loadingAlarms = false;
    }
  }
  @Builder
  readout(label: string, value: string, unit: string, note: string, danger: boolean) {
    Column({ space: 4 }) {
      Text(label).fontSize(11).fontColor(T.muted(this.dark))
      Text(value).fontSize(28).fontWeight(FontWeight.Bold).fontColor(danger ? T.danger : T.text(this.dark))
      Text(unit).fontSize(10).fontColor(T.muted(this.dark))
      Text(note).fontSize(10).fontColor(danger ? T.danger : T.muted(this.dark)).margin({ top: 4 })
    }.alignItems(HorizontalAlign.Start).layoutWeight(1).height(120).padding(14)
      .backgroundColor(T.card(this.dark)).borderRadius(13).border({ width: 1, color: T.border(this.dark) })
  }
  @Builder
  methaneTrend() {
    Column({ space: 12 }) {
      Row() {
        Column({ space: 4 }) {
          Text(this.node.live ? '甲烷浓度趋势' : '甲烷趋势预览')
            .fontSize(13).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
          Text(this.methaneSamples.length > 0 ? '上报前 24 秒' : '最近 24 秒')
            .fontSize(10).fontColor(T.muted(this.dark))
        }.alignItems(HorizontalAlign.Start)
        Blank()
        if (!this.node.live) { Text('报警阈值 25 %LEL').fontSize(10).fontColor(T.danger) }
      }.width('100%')
      if (this.node.live) {
        Stack() {
          LiveTrendChart({ samples: this.methaneSamples })
          if (this.methaneSamples.length === 0) {
            Text('暂无甲烷实测数据').fontSize(10).fontColor(T.muted(this.dark))
          }
        }.width('100%').height(122)
      } else {
        TrendChart({ node: this.node, state: chartState(this.node), large: true })
      }
      Row() {
        ForEach(['24 秒前', '18 秒前', '12 秒前', '6 秒前', this.methaneSamples.length > 0 ? '最新上报' : '现在'], (time: string) => {
          Text(time).fontSize(10).fontColor(T.muted(this.dark))
        })
      }.width('100%').justifyContent(FlexAlign.SpaceBetween)
    }.padding(14).width('100%').backgroundColor(T.card(this.dark)).borderRadius(16)
      .border({ width: 1, color: T.border(this.dark) })
  }
  @Builder
  history(title: string, subtitle: string, done: boolean) {
    Row({ space: 9 }) {
      Circle().width(6).height(6).fill(done ? T.warning : T.danger)
      Column({ space: 5 }) {
        Text(title).fontSize(12).fontColor(T.text(this.dark))
        Text(subtitle).fontSize(10).fontColor(T.muted(this.dark))
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      Text(done ? '已确认' : '未处理').fontSize(10).fontColor(done ? T.muted(this.dark) : T.danger)
    }.height(60).width('100%').border({ width: { bottom: 1 }, color: T.border(this.dark) })
  }
  build() {
    Column() {
      PageHeader({ title: '节点 ' + this.node.id, subtitle: this.node.zone + ' · ' + this.node.place,
        actionLabel: this.node.live ? (this.readingLoading ? '读取中' : '刷新') : '', onAction: this.onRefresh,
        back: true, onBack: this.onBack })
      Scroll() {
        Column({ space: 12 }) {
          Column({ space: 7 }) {
            Text('●  ' + riskLabel(this.node)).fontSize(12).fontWeight(FontWeight.Bold).fontColor(T.state(this.node.state))
            Text(this.node.live ? '状态来自业务后端' : this.node.state === 'alarm' ? '甲烷浓度持续上升，请尽快处置' : this.node.state === 'watch' ? '指标偏离历史基线，建议现场复核' : '各项指标处于正常范围，保持例行巡检')
              .fontSize(11).fontColor(T.muted(this.dark))
          }.alignItems(HorizontalAlign.Start).width('100%').padding(14).borderRadius(12)
            .backgroundColor(this.node.state === 'alarm' ? '#0BFF4D4F' : this.node.state === 'watch' ? '#0BFFB020' : '#0B35E0D0')
            .border({ width: 1, color: T.state(this.node.state) })
          Row({ space: 8 }) {
            this.readout('甲烷浓度', this.node.methane, '%LEL', this.node.live ? '最新读数' : this.node.state === 'alarm' ? '↑ 7.4 / 30min' : '报警阈值 25 %LEL', this.node.state === 'alarm')
            this.readout('环境温度', this.node.temp, '℃', this.node.live ? '最新读数' : '基线 26.0℃', false)
            if (this.node.live) {
              this.readout('环境湿度', this.node.humidity, '%RH', '最新读数', false)
            } else {
              this.readout('红外测温', this.node.infrared, '℃', '设备表面温度', false)
            }
          }.width('100%')
          this.methaneTrend()
          if (this.node.live) {
            if (this.readingError) {
              Text(this.readingError).fontSize(10).fontColor(T.danger).width('100%')
            }
            Text(this.node.lastSeen ? '最近上报：' + this.node.lastSeen : '暂无上报时间')
              .fontSize(10).fontColor(T.muted(this.dark)).width('100%')
            if (this.node.infrared !== '—') {
              Row() { this.readout('红外测温', this.node.infrared, '℃', '最新读数', false) }.width('100%')
            }
            Column({ space: 8 }) {
              Row() {
                Text('报警记录').fontSize(14).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
                Blank()
                Button(this.showAll ? '收起' : '查看全部', { type: ButtonType.Normal }).fontSize(12).height(32).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(this.alarms.length > 2)
                  .onClick(() => this.showAll = !this.showAll)
              }.width('100%')
              if (this.loadingAlarms) { LoadingProgress().width(24).height(24) }
              else if (this.alarmError) {
                Text(this.alarmError).fontColor(T.danger)
                Button('重试', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).onClick(() => this.loadAlarms())
              } else if (this.alarms.length === 0) {
                Text('暂无报警记录').fontSize(11).fontColor(T.muted(this.dark))
              } else {
                ForEach(this.showAll ? this.alarms : this.alarms.slice(0, 2), (alarm: AlarmRecord) => {
                  this.history(alarm.reason, alarm.triggered_at, !!alarm.recovered_at || alarm.status === 'ACKNOWLEDGED')
                }, (alarm: AlarmRecord) => alarm.id.toString())
              }
            }.padding(14).width('100%').backgroundColor(T.card(this.dark)).borderRadius(16)
          } else {
          Column() {
            Row() {
              Text('报警记录').fontSize(14).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
              Blank()
              Text(this.showAll ? '收起' : '查看全部').fontSize(11).fontColor(T.muted(this.dark)).height(32)
                .onClick(() => this.showAll = !this.showAll)
            }.width('100%')
            if (this.node.state === 'normal') {
              Text('近 24 小时无报警记录').fontSize(10).fontColor(T.muted(this.dark)).padding({ top: 20, bottom: 20 })
            } else {
              this.history(this.node.state === 'alarm' ? '甲烷浓度异常上升' : '指标偏离历史基线', '今天 14:28 · ' + this.node.methane + ' %LEL', false)
              this.history('红外测温复核记录', '今天 14:16 · ' + this.node.infrared + ' ℃', true)
              if (this.showAll) { this.history('例行巡检完成', '昨天 16:20 · 设备运行正常', true) }
            }
          }.padding(14).width('100%').backgroundColor(T.card(this.dark)).borderRadius(16)
            .border({ width: 1, color: T.border(this.dark) })
          }
        }.padding({ top: 14, left: 14, right: 14, bottom: 18 }).width('100%')
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      Row({ space: 10 }) {
        Row() { ActionButton({ label: '报修', outlined: true, onAction: this.onRepair }) }.layoutWeight(1)
        Row() { ActionButton({ label: '发起 AI 研判', onAction: this.onRisk }) }.layoutWeight(2)
      }.width('100%').padding(12).backgroundColor(T.card(this.dark))
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
