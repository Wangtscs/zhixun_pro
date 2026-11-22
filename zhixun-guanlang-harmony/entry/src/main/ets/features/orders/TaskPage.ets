import { photoAccessHelper } from '@kit.MediaLibraryKit';

import { T } from '../../common/Theme';
import { notify } from '../../common/Feedback';
import { PageHeader, ActionButton, AppIcon } from '../../common/Ui';
import { SensorNode, riskLabel } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';
import { TaskRepository } from '../../services/TaskRepository';
import { OrderDetailSummary } from './OrderDetailSummary';
import { TaskChecklist } from './TaskChecklist';

@Component
export struct TaskPage {
  @StorageLink('darkMode') dark: boolean = true;
  @State reported: boolean = false;
  @Prop node: SensorNode = ZONES[1].nodes[0];
  onBack: () => void = () => {};
  @State completed: number[] = [0, 1];
  @State photos: string[] = [];
  @State note: string = '';
  aboutToAppear(): void {
    const draft = TaskRepository.get(this.node.id);
    this.completed = draft.completed;
    this.photos = draft.photos;
    this.note = draft.note;
    this.reported = draft.reported;
  }

  private saveDraft(): void {
    TaskRepository.save(this.node.id, this.completed, this.photos, this.note, this.reported);
  }
  private steps(): string[] {
    return this.node.state === 'alarm' ? ['抵达 ' + this.node.id + ' 点位并设置警戒区', '关闭 ' + this.node.id + ' 上游手动阀门', '启动 2# 防爆风机强制通风', '使用便携检测仪复核接口', '记录浓度并拍照留档'] :
      ['抵达 ' + this.node.zone + ' ' + this.node.id + ' 点位', '使用便携检测仪复核现场读数', '检查设备外观及通信连接', '对照历史基线记录变化情况', '记录复核结果并拍照留档'];
  }
  private async choosePhoto(): Promise<void> {
    if (this.photos.length >= 5) { return; }
    const options = new photoAccessHelper.PhotoSelectOptions();
    options.MIMEType = photoAccessHelper.PhotoViewMIMETypes.IMAGE_TYPE;
    options.maxSelectNumber = 5 - this.photos.length;
    try {
      const result = await new photoAccessHelper.PhotoViewPicker().select(options);
      this.photos = this.photos.concat(result.photoUris).slice(0, 5);
      this.saveDraft();
    } catch {
      notify(this.getUIContext(), '未添加照片，可重新选择');
    }
  }
  private toggle(index: number): void {
    this.completed = this.completed.includes(index) ? this.completed.filter((value: number) => value !== index) : this.completed.concat([index]);
    this.saveDraft();
  }
  build() {
    Column() {
      PageHeader({ title: '工单详情', subtitle: '处理中', back: true, onBack: this.onBack })
      Scroll() {
        Column({ space: 12 }) {
          OrderDetailSummary({ number: this.node.id === 'C-06' ? 'WO-2025-0812-012' : 'WO-2025-0812-017',
            location: this.node.zone + ' · ' + this.node.id,
            grade: this.node.id === 'C-06' ? '一般' : riskLabel(this.node),
            deadline: this.node.id === 'C-06' ? '今天 17:30' : '今天 15:00' })
          TaskChecklist({ steps: this.steps(), completed: this.completed, onToggle: (index: number) => this.toggle(index) })
          Column({ space: 12 }) {
            Row() {
              Text('现场照片').fontSize(12).fontWeight(600).fontColor(T.text(this.dark)).layoutWeight(1)
              Text((this.photos.length + 1) + ' / 6 张').fontSize(10).fontColor(T.muted(this.dark))
            }.width('100%')
            Scroll() {
              Row({ space: 8 }) {
                Row() { AppIcon({ name: 'check', iconSize: 24, color: T.tint(this.dark) }) }
                  .width(68).height(64).justifyContent(FlexAlign.Center).backgroundColor('#1535E0D0').borderRadius(10)
                ForEach(this.photos, (uri: string) => {
                  Image(uri).width(68).height(64).borderRadius(10).objectFit(ImageFit.Cover)
                }, (uri: string) => uri)
                if (this.photos.length < 5) {
                  Column({ space: 5 }) {
                    AppIcon({ name: 'camera', iconSize: 22, color: T.tint(this.dark) })
                    Text('添加照片').fontSize(10).fontColor(T.tint(this.dark))
                  }.width(68).height(64).justifyContent(FlexAlign.Center).borderRadius(10)
                    .border({ width: 1, color: T.border(this.dark) }).onClick(() => this.choosePhoto())
                }
              }
            }.width('100%').scrollable(ScrollDirection.Horizontal).scrollBar(BarState.Off).align(Alignment.Start)
            TextArea({ placeholder: '补充现场情况、读数或处置结果…', text: this.note }).height(62).fontSize(12)
              .fontColor(T.text(this.dark)).placeholderColor(T.muted(this.dark)).backgroundColor(T.inset(this.dark)).borderRadius(10)
              .border({ width: 1, color: T.border(this.dark) }).onChange((value: string) => {
                this.note = value;
                this.saveDraft();
              })
          }.width('100%').padding(14).backgroundColor(T.card(this.dark)).borderRadius(16).border({ width: 1, color: T.border(this.dark) })
        }.padding(12).width('100%')
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      Row() {
        ActionButton({ label: this.reported ? '任务已完成上报' : '完成并上报', isEnabled: !this.reported, onAction: () => {
          this.reported = true;
          this.saveDraft();
        } })
      }.width('100%').padding(12).backgroundColor(T.card(this.dark))
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
