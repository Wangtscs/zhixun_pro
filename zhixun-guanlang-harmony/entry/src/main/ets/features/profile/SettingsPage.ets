import { T } from '../../common/Theme';
import { AppIcon } from '../../common/Ui';

@Component
export struct SettingsPage {
  @StorageLink('darkMode') dark: boolean = true;
  @StorageLink('sound') sound: boolean = true;
  @StorageLink('sync') sync: boolean = true;
  @StorageLink('discovery') discovery: boolean = true;
  @StorageLink('quietStart') quietStart: string = '22:00';
  @StorageLink('quietEnd') quietEnd: string = '07:00';
  @StorageLink('reconnect') reconnect: number = 30;
  @StorageLink('cache') cache: number = 128;
  onOpen: (panel: string) => void = () => {};
  @Builder
  heading(label: string) { Text(label).fontSize(10).fontColor(T.muted(this.dark)).width('100%').margin({ top: 16, bottom: 8 }) }
  @Builder
  row(icon: string, label: string, value: string, action: () => void) {
    Row({ space: 10 }) {
      AppIcon({ name: icon, iconSize: 18 })
      Text(label).fontSize(12).fontColor(T.text(this.dark)).layoutWeight(1)
      Text(value).fontSize(10).fontColor(T.muted(this.dark))
      Text('›').fontSize(19).fontColor(T.muted(this.dark))
    }.height(54).width('100%').padding(12).onClick(action)
  }
  @Builder
  toggle(icon: string, label: string, value: boolean, change: (value: boolean) => void) {
    Row({ space: 10 }) {
      AppIcon({ name: icon, iconSize: 18 })
      Text(label).fontSize(12).fontColor(T.text(this.dark)).layoutWeight(1)
      Toggle({ type: ToggleType.Switch, isOn: value }).selectedColor(T.accent).onChange(change)
    }.width('100%').height(54).padding(12)
  }
  build() {
    Column() {
      this.heading('通知')
      Column() {
        this.toggle('bell', '警告声音', this.sound, (value: boolean) => this.sound = value)
        this.row('clock', '免打扰时段', this.quietStart + '–' + this.quietEnd, () => this.onOpen('quiet'))
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
      this.heading('数据')
      Column() {
        this.toggle('settings', '自动同步', this.sync, (value: boolean) => this.sync = value)
        this.row('clipboard', '缓存占用', this.cache + ' MB   清理', () => this.onOpen('cache'))
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
      Text(this.sync ? '联网时自动同步巡检记录' : '自动同步已关闭，巡检记录保留在本机').fontSize(9).fontColor(T.muted(this.dark)).width('100%').margin({ top: 8 })
      this.heading('网络')
      Column() {
        this.toggle('wifi', '节点自动发现', this.discovery, (value: boolean) => this.discovery = value)
        this.row('clock', '重连间隔', this.reconnect + ' 秒', () => this.onOpen('reconnect'))
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
      this.heading('账号')
      Column() {
        this.row('user', '当前账号', '陈巡检 · XJ-027', () => this.onOpen('account'))
        Text('退出登录').fontSize(12).fontColor(T.danger).height(52).width('100%').textAlign(TextAlign.Center).onClick(() => this.onOpen('account'))
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
      Text('设置仅在本次演示中生效，不影响现场设备').fontSize(9).fontColor(T.muted(this.dark)).padding(18)
    }.width('100%').padding(12)
  }
}
