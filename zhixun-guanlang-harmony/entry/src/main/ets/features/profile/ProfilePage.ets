import { T } from '../../common/Theme';
import { PageHeader, AppIcon, ActionButton } from '../../common/Ui';

export interface ProfileSummary {
  displayName: string;
  username: string;
  role: string;
  phone: string;
  email: string;
}

@Component
export struct ProfilePage {
  @StorageLink('darkMode') dark: boolean = true;
  @StorageLink('unreadCount') unread: number = 2;
  @Prop live: boolean = false;
  @Prop profile: ProfileSummary | undefined = undefined;
  @Prop loading: boolean = false;
  @Prop error: string = '';
  onOpen: (page: string) => void = () => {};
  onLogout: () => void = () => {};
  onRefresh: () => void = () => {};
  private labels: string[] = ['消息通知', '系统设置', '帮助与反馈', '关于智巡巡检'];
  private icons: string[] = ['bell', 'settings', 'help', 'info'];
  private pages: string[] = ['notifications', 'settings', 'help', 'about'];
  @Builder
  stat(value: string, label: string, note: string) {
    Column({ space: 5 }) {
      Text(value).fontSize(26).fontWeight(FontWeight.Bold).fontColor(T.text(this.dark))
      Text(label).fontSize(12).fontColor(T.text(this.dark))
      Text(note).fontSize(10).fontColor(T.muted(this.dark)).margin({ top: 7 })
    }.alignItems(HorizontalAlign.Start).layoutWeight(1).padding(14).height(110)
      .backgroundColor(T.card(this.dark)).borderRadius(16).border({ width: 1, color: T.border(this.dark) })
  }
  build() {
    Column() {
      Stack({ alignContent: Alignment.End }) {
        PageHeader({ title: '我的', subtitle: this.live ? '' : '巡检一组', rightInset: 56 })
        Row() { AppIcon({ name: 'theme', iconSize: 20, color: T.muted(this.dark) }) }.width(44).height(44).justifyContent(FlexAlign.Center)
          .backgroundColor(T.card(this.dark)).borderRadius(12).border({ width: 1, color: T.border(this.dark) })
          .margin({ right: 12 }).onClick(() => this.dark = !this.dark).accessibilityText('切换深浅主题')
      }.height(60).width('100%')
      Scroll() {
        Column({ space: 10 }) {
          Row({ space: 12 }) {
            Text(this.live ? (this.profile?.displayName || this.profile?.username || '·').slice(0, 1) : '陈')
              .fontSize(20).fontWeight(600).fontColor(T.tint(this.dark)).width(58).height(58).textAlign(TextAlign.Center)
              .borderRadius(18).backgroundColor('#1235E0D0').border({ width: 1, color: '#4435E0D0' })
            Column({ space: 5 }) {
              Text(this.live ? this.profile?.displayName || this.profile?.username || '我的资料' : '陈巡检')
                .fontSize(19).fontWeight(600).fontColor(T.text(this.dark))
              Text(this.live ? this.profile?.username || '' : '工号 XJ-027 · 今日在线 4h 32m').fontSize(11).fontColor(T.muted(this.dark))
              if (this.live && this.profile) {
                Text([this.profile.phone, this.profile.email].filter((value: string) => !!value).join(' · '))
                  .fontSize(11).fontColor(T.muted(this.dark))
              }
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            Text(this.live ? this.profile?.role || '' : '值班中').fontSize(10).fontColor(T.tint(this.dark)).padding(7).borderRadius(6).backgroundColor('#1235E0D0')
          }.width('100%').height(112).padding(16).backgroundColor(T.card(this.dark)).borderRadius(16)
            .border({ width: 1, color: T.border(this.dark) })
          if (this.live) {
            if (this.loading) { LoadingProgress().width(24).height(24) }
            if (this.error) {
              Text(this.error).fontColor(T.danger).width('100%')
              ActionButton({ label: '重试', outlined: true, onAction: this.onRefresh })
            }
            ActionButton({ label: '巡检手册', outlined: true, onAction: () => this.onOpen('handbooks') })
            ActionButton({ label: '退出登录', onAction: this.onLogout })
          }
          if (!this.live) {
          Row({ space: 10 }) {
            this.stat('18', '今日巡检点位', '目标 24')
            this.stat('12', '本月工单数', '已完成 10')
          }.width('100%')
          }
          Column() {
            ForEach(this.labels, (label: string, index: number) => {
              Row({ space: 12 }) {
                Row() { AppIcon({ name: this.icons[index], iconSize: 19, color: T.muted(this.dark) }) }
                  .width(32).height(32).justifyContent(FlexAlign.Center).borderRadius(9).backgroundColor(T.inset(this.dark))
                Text(label).fontSize(14).fontColor(T.text(this.dark)).layoutWeight(1)
                if (!this.live && index === 0 && this.unread > 0) {
                  Text(this.unread.toString()).fontSize(10).fontColor('#FFFFFF').width(18).height(18)
                    .textAlign(TextAlign.Center).backgroundColor(T.danger).borderRadius(9)
                }
                if (index === 3) { Text('v2.6.0').fontSize(11).fontColor(T.muted(this.dark)) }
                AppIcon({ name: 'chevron', iconSize: 18 })
              }.width('100%').height(58).padding({ left: 12, right: 12 })
                .border({ width: { bottom: index < 3 ? 1 : 0 }, color: T.border(this.dark) })
                .onClick(() => this.onOpen(this.pages[index]))
            })
          }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(16).clip(true)
            .border({ width: 1, color: T.border(this.dark) })
          if (!this.live) {
          Row({ space: 10 }) {
            AppIcon({ name: 'wifi', iconSize: 20, color: T.tint(this.dark) })
            Column({ space: 4 }) {
              Text('传感器网关连接正常').fontSize(13).fontColor(T.text(this.dark))
              Text('区域网关 GW-B01 · 延迟 28ms').fontSize(11).fontColor(T.muted(this.dark))
            }.alignItems(HorizontalAlign.Start).layoutWeight(1)
            Circle().width(7).height(7).fill(T.accent)
          }.width('100%').height(58).padding(14).backgroundColor(T.card(this.dark)).borderRadius(16)
            .border({ width: 1, color: T.border(this.dark) })
          }
        }.width('100%').padding({ top: 14, left: 14, right: 14, bottom: 18 })
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
