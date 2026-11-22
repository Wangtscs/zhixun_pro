import { T } from '../../common/Theme';
import { MarkdownBlock, MarkdownRun, parseAssistantMarkdown } from './AssistantMarkdown';

@Component
export struct MarkdownReply {
  @Prop source: string = '';
  @Prop dark: boolean = true;

  @Builder
  prose(item: MarkdownBlock) {
    Text() {
      ForEach(item.runs, (run: MarkdownRun) => {
        Span(run.text)
          .fontWeight(run.style === 'bold' || item.kind === 'heading' ? FontWeight.Bold : FontWeight.Normal)
          .fontStyle(run.style === 'italic' ? FontStyle.Italic : FontStyle.Normal)
          .fontFamily(run.style === 'code' ? 'monospace' : 'sans-serif')
          .fontColor(run.style === 'code' ? T.tint(this.dark) : T.text(this.dark))
      }, (run: MarkdownRun, index: number) => index.toString())
    }
    .fontSize(item.kind === 'heading' ? (item.level <= 2 ? 17 : 15) : 13)
    .lineHeight(item.kind === 'heading' ? 25 : 23)
  }

  build() {
    Column({ space: 5 }) {
      ForEach(parseAssistantMarkdown(this.source), (item: MarkdownBlock) => {
        if (item.kind === 'rule') {
          Divider().color(T.border(this.dark)).margin({ top: 4, bottom: 4 })
        } else if (item.kind === 'code') {
          Text(item.runs[0].text).fontFamily('monospace').fontSize(12).lineHeight(21)
            .fontColor(T.text(this.dark)).width('100%').padding(9)
            .backgroundColor(T.selected(this.dark)).borderRadius(6)
        } else {
          Row({ space: 7 }) {
            if (item.kind === 'list') {
              Text(item.marker).fontSize(13).lineHeight(23).fontWeight(FontWeight.Medium)
                .fontColor(T.tint(this.dark))
            }
            Column() {
              this.prose(item)
            }.layoutWeight(1).alignItems(HorizontalAlign.Start)
          }
          .width('100%').alignItems(VerticalAlign.Top)
          .padding({ left: item.kind === 'quote' ? 9 : item.indent * 12 })
          .border({ width: { left: item.kind === 'quote' ? 2 : 0 }, color: T.border(this.dark) })
          .margin({ top: item.kind === 'heading' ? 4 : 0 })
        }
      }, (item: MarkdownBlock, index: number) => index.toString() + ':' + JSON.stringify(item))
    }.width('100%').alignItems(HorizontalAlign.Start)
  }
}
