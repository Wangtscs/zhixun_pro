import { T } from '../../common/Theme';

@Component
export struct OrderDetailSummary {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop number: string = '';
  @Prop location: string = '';
  @Prop gradeLabel: string = '风险等级';
  @Prop grade: string = '';
  @Prop deadline: string = '';

  @Builder
  field(label: string, value: string, highlighted: boolean) {
    Column({ space: 5 }) {
      Text(label).fontSize(9).fontColor(T.muted(this.dark))
      Text(value).fontSize(10).fontWeight(500).fontColor(highlighted ? T.warning : T.text(this.dark))
    }.alignItems(HorizontalAlign.Start).layoutWeight(1)
  }

  build() {
    Column({ space: 14 }) {
      Row({ space: 16 }) {
        this.field('任务编号', this.number, false)
        this.field('点位', this.location, false)
      }.width('100%')
      Row({ space: 16 }) {
        this.field(this.gradeLabel, this.grade, false)
        this.field('截止时间', this.deadline, true)
      }.width('100%')
    }.width('100%').padding(14).backgroundColor(T.card(this.dark)).borderRadius(16)
      .border({ width: 1, color: T.border(this.dark) })
  }
}
