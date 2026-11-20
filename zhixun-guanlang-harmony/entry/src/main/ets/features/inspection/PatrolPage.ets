import { T } from '../../common/Theme';
import { MobileSession } from '../../services/MobileSession';

interface PatrolRun {
  id: number;
  name: string;
  status: string;
}

interface PatrolPoint {
  id: number;
  code: string;
  location: string;
  check_items: string;
  result_text?: string;
  checked_at?: string;
  order_id?: number;
}

interface PatrolDetail extends PatrolRun {
  points: PatrolPoint[];
}

interface PatrolSubmission {
  result: string;
  abnormal: boolean;
}

@Component
export struct PatrolPage {
  onBack: () => void = () => {};
  @StorageLink('darkMode') dark: boolean = true;
  @State runs: PatrolRun[] = [];
  @State detail: PatrolDetail | undefined = undefined;
  @State selected: number = 0;
  @State description: string = '';
  @State abnormal: boolean = false;
  @State loading: boolean = true;
  @Link saving: boolean;
  @State error: string = '';
  @State notice: string = '';
  @State retryRun: number = 0;
  @State mustRefresh: boolean = false;

  aboutToAppear(): void { this.loadRuns(); }

  private clearDraft(): void {
    this.selected = 0;
    this.description = '';
    this.abnormal = false;
  }

  private async loadRuns(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      this.runs = await MobileSession.get<PatrolRun[]>('/api/business/patrol/runs');
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async loadDetail(id: number): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const detail = await MobileSession.get<PatrolDetail>('/api/business/patrol/runs/' + id);
      this.detail = detail;
      this.retryRun = 0;
      this.mustRefresh = false;
      if (detail.points.some((point: PatrolPoint) => point.id === this.selected && !!point.checked_at)) {
        this.clearDraft();
      }
    } catch (error) {
      this.error = '刷新任务失败：' + (error as Error).message;
    } finally {
      this.loading = false;
    }
  }

  private async submit(id: number): Promise<void> {
    const detail = this.detail;
    const result = this.description.trim();
    if (!detail || !result || this.saving || this.loading || this.mustRefresh || this.selected !== id) { return; }
    this.saving = true;
    this.notice = '';
    this.error = '';
    const submission: PatrolSubmission = { result: result, abnormal: this.abnormal };
    try {
      await MobileSession.post<Object>('/api/business/patrol/results/' + id, JSON.stringify(submission));
      this.clearDraft();
      this.notice = '巡检结果已提交';
      this.detail = undefined;
      await this.loadDetail(detail.id);
      if (!this.detail) { this.retryRun = detail.id; }
    } catch (error) {
      this.error = (error as Error).message;
      this.mustRefresh = true;
    } finally {
      this.saving = false;
    }
  }

  private statusLabel(status: string): string {
    if (status === 'COMPLETED') { return '已完成'; }
    if (status === 'PROCESSING') { return '进行中'; }
    if (status === 'PENDING') { return '待巡检'; }
    return status;
  }

  @Builder
  pointCard(point: PatrolPoint) {
    Column({ space: 8 }) {
      Text(point.code + ' · ' + point.location).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
      Text(point.check_items).fontSize(14).fontColor(T.muted(this.dark))
      if (point.checked_at) {
        Text(point.result_text || '已提交').fontColor(T.text(this.dark))
        if (point.order_id) {
          Text('关联工单 #' + point.order_id).fontColor(T.tint(this.dark))
        }
      } else if (this.selected === point.id) {
        TextArea({ text: this.description, placeholder: '填写巡检结果' }).height(96).maxLength(4000)
          .enabled(!this.saving).onChange((value: string) => this.description = value)
        Row({ space: 8 }) {
          Text('发现异常').fontColor(T.text(this.dark))
          Toggle({ type: ToggleType.Switch, isOn: this.abnormal }).enabled(!this.saving)
            .onChange((checked: boolean) => this.abnormal = checked)
        }
        Row({ space: 8 }) {
          Button('取消', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(!this.saving && !this.loading).onClick(() => this.clearDraft())
          Button(this.saving ? '提交中…' : '提交结果', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9)
            .enabled(!this.saving && !this.loading && !this.mustRefresh && !!this.description.trim())
            .onClick(() => this.submit(point.id))
        }
      } else {
        Button('填写结果', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(!this.selected && !this.loading && !this.saving)
          .onClick(() => { this.selected = point.id; this.notice = ''; })
      }
    }.width('100%').alignItems(HorizontalAlign.Start).padding(12)
      .backgroundColor(T.inset(this.dark)).borderRadius(10)
  }

  build() {
    Column({ space: 12 }) {
      Row({ space: 10 }) {
        Button('返回', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(!this.saving && !this.loading).onClick(() => {
          if (this.detail || this.retryRun) {
            this.detail = undefined;
            this.retryRun = 0;
            this.notice = '';
            this.clearDraft();
            this.loadRuns();
          } else {
            this.onBack();
          }
        })
        Text('巡检任务').fontSize(20).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
        Blank()
        Button('刷新', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).enabled(!this.loading && !this.saving).onClick(() => {
          if (this.detail) { this.loadDetail(this.detail.id); }
          else if (this.retryRun) { this.loadDetail(this.retryRun); }
          else { this.loadRuns(); }
        })
      }.width('100%')
      if (this.notice) { Text(this.notice).fontColor(T.tint(this.dark)) }
      if (this.error) { Text(this.error).fontColor(T.danger) }
      if (this.loading) { Text('正在加载…').fontColor(T.muted(this.dark)) }
      Scroll() {
        Column({ space: 10 }) {
          if (this.detail) {
            Text(this.detail.name + ' · #' + this.detail.id + ' · ' + this.statusLabel(this.detail.status))
              .fontSize(16).fontColor(T.text(this.dark))
            ForEach(this.detail.points, (point: PatrolPoint) => {
              this.pointCard(point)
            }, (point: PatrolPoint) => String(point.id))
          } else if (!this.retryRun && !this.loading) {
            if (!this.runs.length && !this.error) { Text('暂无巡检任务').fontColor(T.muted(this.dark)) }
            ForEach(this.runs, (run: PatrolRun) => {
              Button(run.name + ' · #' + run.id + ' · ' + this.statusLabel(run.status), { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).width('100%')
                .onClick(() => this.loadDetail(run.id))
            }, (run: PatrolRun) => String(run.id))
          }
        }.alignItems(HorizontalAlign.Start).width('100%')
      }.width('100%').layoutWeight(1)
    }.width('100%').height('100%').padding(12)
  }
}
