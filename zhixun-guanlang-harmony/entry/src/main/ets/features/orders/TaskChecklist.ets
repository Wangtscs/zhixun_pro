import { T } from '../../common/Theme';
import { AppIcon } from '../../common/Ui';

@Component
export struct TaskChecklist {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop steps: string[] = [];
  @Prop completed: number[] = [];
  @Prop editable: boolean = true;
  onToggle: (index: number) => void = () => {};

  build() {
    Column({ space: 12 }) {
      Row() {
        Text('处置进度').fontSize(12).fontWeight(600).fontColor(T.text(this.dark)).layoutWeight(1)
        Text(this.completed.length + ' / 5 项').fontSize(8).fontColor(T.muted(this.dark)).margin({ right: 10 })
        Text(this.completed.length * 20 + '%').fontSize(11).fontColor(T.tint(this.dark))
      }.width('100%')
      Progress({ value: this.completed.length, total: 5, type: ProgressType.Linear }).width('100%').color(T.accent)
        .backgroundColor(T.border(this.dark)).style({ strokeWidth: 5 })
      Column() {
        ForEach(this.steps, (step: string, index: number) => {
          Row({ space: 9 }) {
            Row() {
              if (this.completed.includes(index)) { AppIcon({ name: 'check', iconSize: 16, color: '#092421' }) }
            }.width(22).height(22).justifyContent(FlexAlign.Center).borderRadius(6)
              .backgroundColor(this.completed.includes(index) ? T.accent : T.inset(this.dark))
              .border({ width: 1, color: this.completed.includes(index) ? T.tint(this.dark) : T.border(this.dark) })
            Text((index + 1).toString()).fontSize(8).fontColor(T.muted(this.dark))
            Text(step).fontSize(10).fontColor(this.completed.includes(index) ? T.muted(this.dark) : T.text(this.dark))
              .layoutWeight(1).decoration({ type: this.completed.includes(index) ? TextDecorationType.LineThrough : TextDecorationType.None })
          }.height(50).width('100%').onClick(() => { if (this.editable) { this.onToggle(index); } })
            .accessibilityText(step + (this.completed.includes(index) ? '，已勾选' : '，未勾选'))
            .border({ width: { bottom: index < 4 ? 1 : 0 }, color: T.border(this.dark) })
        })
      }.width('100%')
    }.width('100%').padding(14).backgroundColor(T.card(this.dark)).borderRadius(16)
      .border({ width: 1, color: T.border(this.dark) })
  }
}
