import { T } from '../../common/Theme';
import { AppIcon, ActionButton } from '../../common/Ui';
import { NotificationsPage, NOTICES } from './NotificationsPage';
import { SettingsPage } from './SettingsPage';
import { QUESTIONS, ANSWERS, DOCUMENT_TITLES, DOCUMENT_SUBTITLES, DOCUMENT_BODIES } from './ProfileData';
import { ProfileLogic } from './ProfileLogic';

@Component
export struct ProfileDetailPage {
  @StorageLink('darkMode') dark: boolean = true;
  @Prop page: string = 'help';
  onBack: () => void = () => {};
  @StorageLink('profilePanel') panel: string = '';
  @StorageLink('unreadCount') unread: number = 2;
  @StorageLink('noticeRead') read: number[] = [];
  @StorageLink('quietStart') quietStart: string = '22:00';
  @StorageLink('quietEnd') quietEnd: string = '07:00';
  @StorageLink('reconnect') reconnect: number = 30;
  @StorageLink('cache') cache: number = 128;
  @State search: string = '';
  @State expanded: number = 0;
  @State description: string = '';
  @State submitted: boolean = false;
  @State noticeIndex: number = 0;
  @State documentIndex: number = 0;
  @State draftStart: string = '22:00';
  @State draftEnd: string = '07:00';
  @State draftInterval: number = 30;
  aboutToAppear(): void { this.panel = ''; }
  private title(): string { return this.page === 'notifications' ? '消息通知' : this.page === 'settings' ? '系统设置' : this.page === 'about' ? '关于' : '帮助与反馈'; }
  private close(): void { this.panel = ''; }
  private open(panel: string): void {
    this.draftStart = this.quietStart; this.draftEnd = this.quietEnd; this.draftInterval = this.reconnect;
    if (panel === 'feedback') { this.submitted = false; }
    this.panel = panel;
  }
  private matches(index: number): boolean { return ProfileLogic.matches(index, this.search); }
  private resultCount(): number { return QUESTIONS.filter((_question: string, index: number) => this.matches(index)).length; }
  private sheetTitle(): string {
    if (this.panel === 'notice') { return NOTICES[this.noticeIndex].title; }
    if (this.panel === 'document') { return DOCUMENT_TITLES[this.documentIndex]; }
    return this.panel === 'quiet' ? '免打扰时段' : this.panel === 'reconnect' ? '重连间隔' : this.panel === 'cache' ? '清理缓存' : this.panel === 'account' ? '账号信息' : this.panel === 'feedback' ? '提交反馈' : this.panel === 'chat' ? '在线客服' : '电话支持';
  }
  @Builder
  paragraph(text: string) { Text(text).fontSize(12).lineHeight(23).fontColor(T.muted(this.dark)).width('100%') }
  @Builder
  header() {
    Stack() {
      Text(this.title()).fontSize(17).fontWeight(600).fontColor(T.text(this.dark))
      Row() {
        Row() { AppIcon({ name: 'back', color: T.text(this.dark), iconSize: 22 }) }.width(44).height(52).justifyContent(FlexAlign.Center)
          .onClick(() => { if (this.panel) { this.close(); } else { this.onBack(); } }).accessibilityText('返回我的')
        Blank()
        if (this.page === 'notifications') {
          Text('全部已读').fontSize(11).fontColor(T.tint(this.dark)).height(52).padding({ left: 8, right: 14 })
            .onClick(() => { this.read = [0, 1]; this.unread = 0; })
        } else { Blank().width(44) }
      }.width('100%')
    }.width('100%').height(56).backgroundColor(T.chrome(this.dark)).border({ width: { bottom: 1 }, color: T.border(this.dark) })
  }
  @Builder
  help() {
    Column({ space: 14 }) {
      Row() {
        TextInput({ placeholder: '搜索问题关键词', text: this.search }).height(44).fontSize(12).fontColor(T.text(this.dark))
          .backgroundColor(Color.Transparent).placeholderColor(T.muted(this.dark)).onChange((value: string) => this.search = value).layoutWeight(1)
        if (this.search) { Text('×').fontSize(21).fontColor(T.muted(this.dark)).height(44).width(44).textAlign(TextAlign.Center).onClick(() => this.search = '').accessibilityText('清空搜索') }
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12).border({ width: 1, color: T.border(this.dark) })
      Row() {
        Text('常见问题').fontSize(10).fontColor(T.muted(this.dark)).layoutWeight(1)
        Text(this.resultCount() + ' 个问题').fontSize(9).fontColor(T.muted(this.dark))
      }.width('100%')
      Column() {
        ForEach(QUESTIONS, (question: string, index: number) => {
          if (this.matches(index)) {
            Column() {
              Row() {
                Text(question).fontSize(12).fontColor(this.expanded === index ? T.tint(this.dark) : T.text(this.dark)).layoutWeight(1)
                Text(this.expanded === index ? '⌄' : '›').fontSize(18).fontColor(T.muted(this.dark))
              }.width('100%').height(50).onClick(() => this.expanded = this.expanded === index ? -1 : index)
              if (this.expanded === index) { Text(ANSWERS[index]).fontSize(11).lineHeight(21).fontColor(T.muted(this.dark)).width('100%').margin({ bottom: 14 }) }
            }.width('100%').padding({ left: 14, right: 14 }).border({ width: { bottom: 1 }, color: T.border(this.dark) })
          }
        })
        if (this.resultCount() === 0) { Text('未找到相关问题，试试其他关键词或提交反馈。').fontSize(11).fontColor(T.muted(this.dark)).padding(18) }
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12).clip(true)
      ActionButton({ label: '提交反馈', onAction: () => this.open('feedback') })
      Column() {
        this.supportRow('在线客服', '工作日 09:00–18:00', 'chat')
        this.supportRow('电话支持', '运维服务热线', 'phone')
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
    }.width('100%').padding(12)
  }
  @Builder
  supportRow(label: string, note: string, panel: string) {
    Row({ space: 8 }) {
      AppIcon({ name: 'help', iconSize: 18 })
      Text(label).fontSize(12).fontColor(T.text(this.dark)).layoutWeight(1)
      Text(note).fontSize(9).fontColor(T.muted(this.dark))
      Text('›').fontSize(18).fontColor(T.muted(this.dark))
    }.width('100%').height(54).padding(12).onClick(() => this.open(panel))
  }
  @Builder
  brand() {
    Column({ space: 12 }) {
      Row({ space: 4 }) {
        Rect().width(6).height(16).radius(2).fill(T.accent)
        Rect().width(6).height(28).radius(2).fill(T.accent)
        Rect().width(6).height(22).radius(2).fill(T.accent)
      }.width(64).height(64).padding(16).justifyContent(FlexAlign.Center).alignItems(VerticalAlign.Bottom).backgroundColor('#1435E0D0').borderRadius(18).border({ width: 1, color: '#6635E0D0' })
      Text('智巡巡检').fontSize(21).fontWeight(600).fontColor(T.text(this.dark))
      Text('v2.6.0').fontSize(11).fontColor(T.muted(this.dark))
      Text('让每一次巡检，都有据可依').fontSize(11).fontColor(T.muted(this.dark))
    }.width('100%').padding({ top: 52, bottom: 42 })
  }
  @Builder
  about() {
    Column() {
      this.brand()
      Column() {
        ForEach(DOCUMENT_TITLES, (title: string, index: number) => {
          Row() {
            Text(title).fontSize(12).fontColor(T.text(this.dark)).layoutWeight(1)
            if (index === 0) { Text('当前已是最新版本').fontSize(9).fontColor(T.muted(this.dark)).margin({ right: 8 }) }
            Text('›').fontSize(19).fontColor(T.muted(this.dark))
          }.height(54).width('100%').padding(12).border({ width: { bottom: index < 3 ? 1 : 0 }, color: T.border(this.dark) })
            .onClick(() => { this.documentIndex = index; this.open('document'); })
        })
      }.width('100%').backgroundColor(T.card(this.dark)).borderRadius(12)
      Column({ space: 10 }) {
        Text('—  INDUSTRIAL INTELLIGENCE  —').fontSize(9).fontColor(T.muted(this.dark))
        Text('© 2025 智巡巡检 · 版权所有').fontSize(10).fontColor(T.muted(this.dark))
        Text('备案号：待正式上线后登记').fontSize(9).fontColor(T.muted(this.dark))
      }.width('100%').padding({ top: 90, bottom: 25 })
    }.width('100%').padding(12)
  }
  private pickTime(start: boolean): void {
    const parts = (start ? this.draftStart : this.draftEnd).split(':');
    const date = new Date(); date.setHours(Number(parts[0]), Number(parts[1]));
    this.getUIContext().showTimePickerDialog({ selected: date, useMilitaryTime: true, onAccept: (value: TimePickerResult) => {
      const time = (value.hour || 0).toString().padStart(2, '0') + ':' + (value.minute || 0).toString().padStart(2, '0');
      if (start) { this.draftStart = time; } else { this.draftEnd = time; }
    } });
  }
  @Builder
  timeField(label: string, value: string, start: boolean) {
    Column({ space: 8 }) {
      Text(label).fontSize(10).fontColor(T.muted(this.dark)).width('100%')
      Text(value + '   ◷').fontSize(12).fontColor(T.text(this.dark)).height(42).width('100%').padding(10)
        .backgroundColor(T.inset(this.dark)).borderRadius(8).border({ width: 1, color: T.border(this.dark) }).onClick(() => this.pickTime(start))
    }.layoutWeight(1)
  }
  @Builder
  sheetContent() {
    if (this.panel === 'quiet') {
      this.paragraph('时段内静默普通通知，高风险警告仍会提示。')
      Row({ space: 12 }) { this.timeField('开始时间', this.draftStart, true); this.timeField('结束时间', this.draftEnd, false) }.width('100%')
      ActionButton({ label: '保存时段', onAction: () => { this.quietStart = this.draftStart; this.quietEnd = this.draftEnd; this.close(); } })
    } else if (this.panel === 'reconnect') {
      this.paragraph('节点连接断开后，按所选间隔尝试重连。')
      Row({ space: 8 }) {
        ForEach([15, 30, 60], (seconds: number) => {
          Text(seconds + ' 秒').fontSize(13).fontColor(this.draftInterval === seconds ? T.tint(this.dark) : T.muted(this.dark))
            .height(44).layoutWeight(1).textAlign(TextAlign.Center).backgroundColor(T.inset(this.dark)).borderRadius(8)
            .border({ width: 1, color: this.draftInterval === seconds ? T.accent : T.border(this.dark) }).onClick(() => this.draftInterval = seconds)
        })
      }.width('100%')
      ActionButton({ label: '保存设置', onAction: () => { this.reconnect = this.draftInterval; this.close(); } })
    } else if (this.panel === 'cache') {
      this.paragraph('可清理 ' + this.cache + ' MB 的知识库临时缓存，不会删除未上传的巡检记录。')
      ActionButton({ label: '确认清理', onAction: () => { this.cache = 0; this.close(); } })
    } else if (this.panel === 'account') {
      this.paragraph('当前为巡检员演示账号 XJ-027。本原型未连接真实登录服务，不会退出你的实际账号。')
      ActionButton({ label: '返回设置', onAction: () => this.close() })
    } else if (this.panel === 'notice') {
      Text(NOTICES[this.noticeIndex].type + '通知 · ' + NOTICES[this.noticeIndex].time).fontSize(10).fontColor(T.muted(this.dark)).width('100%')
      this.paragraph(NOTICES[this.noticeIndex].body + '。')
      this.paragraph('请结合现场实际情况处理；涉及安全风险时优先遵守现场应急规程。')
      ActionButton({ label: '我知道了', onAction: () => this.close() })
    } else if (this.panel === 'document') {
      Text(DOCUMENT_SUBTITLES[this.documentIndex]).fontSize(10).fontColor(T.muted(this.dark)).width('100%')
      this.paragraph(DOCUMENT_BODIES[this.documentIndex])
      ActionButton({ label: '关闭', onAction: () => this.close() })
    } else if (this.panel === 'feedback') {
      if (this.submitted) {
        Text('✓').fontSize(30).fontColor(T.tint(this.dark)).width(52).height(52).textAlign(TextAlign.Center).backgroundColor('#1535E0D0').borderRadius(26).alignSelf(ItemAlign.Center)
        this.paragraph('演示反馈已生成，内容仅在当前页面预览，未发送至服务器。')
        ActionButton({ label: '完成', onAction: () => { this.description = ''; this.close(); } })
      } else {
        this.paragraph('请描述出现的问题及操作步骤，不要填写密码或敏感信息。')
        TextArea({ placeholder: '例如：B区节点连接后，数据一直未更新…', text: this.description }).height(150).fontSize(12)
          .fontColor(T.text(this.dark)).backgroundColor(T.inset(this.dark)).placeholderColor(T.muted(this.dark)).maxLength(500).onChange((value: string) => this.description = value)
        Text(this.description.length + ' / 500').fontSize(9).fontColor(T.muted(this.dark)).alignSelf(ItemAlign.End)
        ActionButton({ label: '生成反馈预览', isEnabled: ProfileLogic.canPreview(this.description), onAction: () => this.submitted = true })
      }
    } else {
      this.paragraph(this.panel === 'chat' ? '服务时间：工作日 09:00–18:00。请先记录节点编号、异常时间和错误提示，以便运维人员排查。' : '紧急情况请按现场应急预案联系值班人员，优先撤离危险区域。日常设备问题请联系单位运维值班室。')
      this.paragraph('演示模式尚未接入单位客服与值班通讯录，请通过单位既有渠道联系。')
      ActionButton({ label: '我知道了', onAction: () => this.close() })
    }
  }
  @Builder
  sheet() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column().width('100%').height('100%').backgroundColor('#B505090E').onClick(() => this.close())
      Column({ space: 14 }) {
        Rect().width(42).height(4).radius(2).fill(T.muted(this.dark)).alignSelf(ItemAlign.Center)
        Row() {
          Text(this.sheetTitle()).fontSize(16).fontWeight(600).fontColor(T.text(this.dark)).layoutWeight(1)
          Text('×').fontSize(24).fontColor(T.muted(this.dark)).height(44).width(44).textAlign(TextAlign.Center).onClick(() => this.close()).accessibilityText('关闭')
        }.width('100%')
        this.sheetContent()
      }.width('100%').padding({ top: 10, left: 16, right: 16, bottom: 24 }).backgroundColor(T.card(this.dark))
        .borderRadius({ topLeft: 20, topRight: 20 }).onClick(() => {})
    }.width('100%').height('100%')
  }
  build() {
    Stack() {
      Column() {
        this.header()
        Scroll() {
          Column() {
            if (this.page === 'notifications') { NotificationsPage({ onOpen: (index: number) => { this.noticeIndex = index; this.open('notice'); } }) }
            else if (this.page === 'settings') { SettingsPage({ onOpen: (panel: string) => this.open(panel) }) }
            else if (this.page === 'about') { this.about() }
            else { this.help() }
          }.width('100%')
        }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      }.width('100%').height('100%')
      if (this.panel) { this.sheet() }
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
