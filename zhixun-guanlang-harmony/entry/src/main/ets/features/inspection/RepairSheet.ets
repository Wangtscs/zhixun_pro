import { T } from '../../common/Theme';
import { ActionButton, AppIcon } from '../../common/Ui';
import { SensorNode } from '../../models/Inspection';
import { ZONES } from '../../services/DemoRepository';
import { MobileSession } from '../../services/MobileSession';

interface RepairSuggestion {
  reply: string;
}

interface RepairReceipt {
  id: number;
}

@Component
export struct RepairSheet {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop node: SensorNode = ZONES[1].nodes[0];
  onClose: () => void = () => {};
  onCreate: () => void = () => {};
  @Prop initialSuggestion: string = '';
  @State description: string = '';
  @State saving: boolean = false;
  @State suggesting: boolean = false;
  @State mode: number = -1;
  @State error: string = '';
  @State orderId: number = 0;

  aboutToAppear(): void {
    if (this.node.live && this.initialSuggestion.trim()) {
      this.mode = 0;
      this.description = this.initialSuggestion.trim().slice(0, 2000);
    }
  }

  private async choose(index: number): Promise<void> {
    if (!this.node.live) { this.onCreate(); return; }
    this.mode = index;
    this.error = '';
    if (index !== 0 || this.description.trim()) { return; }
    this.suggesting = true;
    try {
      const question = '请根据巡检节点 ' + this.node.id + '（' + this.node.place +
        '）起草一段待人工确认的报修描述。区分已知信息和待核实事项，不要编造故障或读数。';
      const response = await MobileSession.post<RepairSuggestion>('/api/assistant/ask', JSON.stringify({ question }), 60000);
      this.description = (response?.reply || '').trim().slice(0, 2000);
      if (!this.description) { this.error = '未获取到建议，可手动填写故障描述'; }
    } catch {
      this.error = '暂时无法获取 AI 建议，可手动填写故障描述';
    } finally {
      this.suggesting = false;
    }
  }

  private async submit(): Promise<void> {
    const description = this.description.trim();
    if (!description || this.saving || this.suggesting || this.orderId > 0) { return; }
    this.saving = true;
    this.error = '';
    try {
      const receipt = await MobileSession.post<RepairReceipt>('/api/business/orders', JSON.stringify({
        nodeId: this.node.backendId, title: '节点 ' + this.node.id + ' 报修', description: description
      }));
      if (!receipt || !Number.isInteger(receipt.id) || receipt.id <= 0) {
        this.error = '未收到报修单编号，请向管理员确认结果后再提交';
        return;
      }
      this.orderId = receipt.id;
    } catch (error) {
      this.error = (error as Error).message;
    } finally {
      this.saving = false;
    }
  }
  build() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column().width('100%').height('100%').backgroundColor('#AF05070A')
        .onClick(() => { if (!this.saving) { this.onClose(); } })
      Column({ space: 10 }) {
        Rect().width(42).height(4).radius(2).fill('#3B4651').margin({ bottom: 8 })
        Text('发起报修').fontSize(16).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark)).width('100%')
        Text('节点 ' + this.node.id + ' · ' + this.node.zone + ' · ' + this.node.place).fontSize(9).fontColor(T.muted(this.dark)).width('100%').margin({ bottom: 8 })
        if (this.orderId > 0) {
          Text('报修单 #' + this.orderId + ' 已创建').fontSize(14).fontColor(T.tint(this.dark)).width('100%')
          Text('请由管理员在网页端派单；派发给你的工单会出现在手机「我的工单」。')
            .fontSize(11).fontColor(T.text(this.dark)).width('100%')
        } else if (this.mode >= 0) {
          Text(this.mode === 0 ? '核对 AI 建议后再提交' : '填写故障描述').fontSize(11)
            .fontColor(T.muted(this.dark)).width('100%')
          TextArea({ placeholder: this.suggesting ? '正在生成建议…' : '填写故障描述', text: this.description })
            .width('100%').height(100).maxLength(2000).backgroundColor(T.inset(this.dark))
            .fontColor(T.text(this.dark)).borderRadius(13)
            .enabled(!this.saving && !this.suggesting).onChange((value: string) => this.description = value)
          if (this.error) { Text(this.error).fontSize(11).fontColor(T.danger).width('100%') }
          ActionButton({ label: this.saving ? '正在提交…' : '创建报修单',
            isEnabled: !this.saving && !this.suggesting && !!this.description.trim(), onAction: () => this.submit() })
        } else {
        ForEach(['使用 AI 建议创建工单', '手动创建报修单'], (label: string, index: number) => {
          Row({ space: 12 }) {
            AppIcon({ name: index === 0 ? 'spark' : 'wrench', iconSize: 24, color: T.tint(this.dark) })
            Column({ space: 5 }) {
              Text(label).fontSize(11).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
              Text(index === 0 ? '自动填写风险与处置步骤' : this.node.live ? '自行补充故障描述' : '自行补充故障描述与处理人')
                .fontSize(8).fontColor(T.muted(this.dark))
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            AppIcon({ name: 'chevron', iconSize: 18 })
          }.height(66).width('100%').padding(12).backgroundColor(T.inset(this.dark)).borderRadius(13)
            .border({ width: 1, color: T.border(this.dark) }).onClick(() => this.choose(index))
        })
        }
        Button(this.orderId > 0 ? '完成' : '取消', { type: ButtonType.Normal }).width('100%').height(48).borderRadius(12)
          .backgroundColor(T.selected(this.dark)).fontColor(T.muted(this.dark)).fontSize(11).enabled(!this.saving).onClick(this.onClose)
      }.padding({ top: 10, left: 12, right: 12, bottom: 24 }).width('100%')
        .backgroundColor(T.card(this.dark)).borderRadius({ topLeft: 20, topRight: 20 })
    }.width('100%').height('100%')
  }
}
