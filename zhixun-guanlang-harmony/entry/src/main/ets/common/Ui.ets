import { T } from './Theme';

@Component
export struct AppIcon {
  @Prop name: string = 'radar';
  @Prop iconSize: number = 20;
  @Prop color: string = '#71808D';
  build() {
    Image($rawfile('icons/' + this.name + '_' + this.color.slice(1).toLowerCase() + '.svg')).width(this.iconSize).height(this.iconSize)
      .objectFit(ImageFit.Contain)
  }
}

@Component
export struct PageHeader {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop title: string = '';
  @Prop subtitle: string = '';
  @Prop back: boolean = false;
  @Prop connected: boolean = true;
  @Prop rightInset: number = 0;
  @Prop actionLabel: string = '';
  onBack: () => void = () => {};
  onAction: () => void = () => {};
  build() {
    Row({ space: 10 }) {
      if (this.back) {
        Row() { AppIcon({ name: 'back', color: T.text(this.dark) }) }
          .width(36).height(44).justifyContent(FlexAlign.Center).onClick(this.onBack)
          .accessibilityText('返回')
      } else {
        Row({ space: 3 }) {
          Rect().width(4).height(11).fill(T.accent).radius(1)
          Rect().width(4).height(19).fill(T.accent).radius(1)
          Rect().width(4).height(15).fill(T.accent).radius(1)
        }.width(34).height(34).padding(7).alignItems(VerticalAlign.Bottom).borderRadius(10)
          .backgroundColor('#0D35E0D0').border({ width: 1, color: '#6635E0D0' })
      }
      Column({ space: 3 }) {
        Text(this.title).fontSize(16).fontWeight(FontWeight.Medium).fontColor(T.text(this.dark))
        if (this.subtitle) { Text(this.subtitle).fontSize(8).fontColor(T.muted(this.dark)) }
      }.alignItems(HorizontalAlign.Start).layoutWeight(1)
      if (this.actionLabel) {
        Button(this.actionLabel, { type: ButtonType.Normal }).height(32).borderRadius(8)
          .fontSize(10).fontColor(T.tint(this.dark)).backgroundColor(T.selected(this.dark))
          .onClick(this.onAction)
      }
      Row({ space: 5 }) {
        Circle().width(5).height(5).fill(this.connected ? T.accent : T.muted(this.dark))
        Text(this.connected ? '实时连接' : '同步已暂停').fontSize(8).fontColor(T.muted(this.dark))
      }
    }.width('100%').height(58).padding({ left: 14, right: 14 + this.rightInset })
      .backgroundColor(T.chrome(this.dark)).border({ width: { bottom: 1 }, color: T.border(this.dark) })
  }
}

@Component
export struct ActionButton {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop label: string = '';
  @Prop outlined: boolean = false;
  @Prop isEnabled: boolean = true;
  onAction: () => void = () => {};
  build() {
    Button(this.label, { type: ButtonType.Normal }).height(52).width('100%').borderRadius(13)
      .fontSize(12).fontWeight(FontWeight.Bold)
      .backgroundColor(this.outlined ? T.card(this.dark) : T.accent)
      .fontColor(this.outlined ? T.text(this.dark) : '#092421')
      .border({ width: this.outlined ? 1 : 0, color: T.border(this.dark) })
      .enabled(this.isEnabled).opacity(this.isEnabled ? 1 : 0.45).borderRadius(13).clip(true).onClick(this.onAction)
  }
}
