import { MobileSession } from '../../services/MobileSession';
import { T } from '../../common/Theme';
import { ActionButton, AppIcon } from '../../common/Ui';
import { RecoveryPage } from './RecoveryPage';

@Component
export struct LoginPage {
  onEnter: () => void = () => {};
  @State job: string = AppStorage.get<string>('rememberedJob') || '';
  @State password: string = '';
  @State remember: boolean = true;
  @State error: boolean = false;
  @State failure: string = '';
  @State loading: boolean = false;
  @State focused: string = '';
  @StorageLink('authPanel') panel: string = '';
  @StorageLink('authRecovering') recovering: boolean = false;
  @StorageLink('recoveryStep') recoveryStep: number = 0;
  @StorageLink('authBackSignal') @Watch('handleBack') backSignal: number = 0;
  @State english: boolean = false;
  @State viewportHeight: number = 844;
  private attempt: number = 0;
  private handleBack(): void {
    if (this.panel === 'admin') { this.panel = 'forgot'; }
    else if (this.panel) { this.panel = ''; }
    else if (this.recovering && this.recoveryStep > 0 && this.recoveryStep < 3) { this.recoveryStep--; }
    else { this.finishRecovery(); }
  }
  private finishRecovery(): void { this.recovering = false; this.password = ''; this.error = false; }
  private text(zh: string, en: string): string { return this.english ? en : zh; }
  private rememberJob(): void { AppStorage.setOrCreate('rememberedJob', this.remember ? this.job : ''); }
  private enter(): void { this.rememberJob(); this.attempt++; this.loading = false; this.onEnter(); }
  private async submit(): Promise<void> {
    if (this.loading) { return; }
    this.error = false;
    this.failure = '';
    if (!this.job.trim() || !this.password) { this.error = true; return; }
    this.loading = true;
    const attempt = ++this.attempt;
    try {
      await MobileSession.login(this.job.trim(), this.password);
      if (attempt === this.attempt) { this.enter(); }
    } catch (error) {
      if (attempt === this.attempt) {
        this.failure = (error as Error).message;
        this.loading = false;
      }
    }
  }
  aboutToDisappear(): void { this.attempt++; }
  @Builder
  brand() {
    Column() {
      Row({ space: 5 }) {
        Rect().width(6).height(16).radius(2).fill(T.accent)
        Rect().width(6).height(28).radius(2).fill(T.accent)
        Rect().width(6).height(22).radius(2).fill(T.accent)
      }.width(66).height(66).padding(15).alignItems(VerticalAlign.Bottom).justifyContent(FlexAlign.Center)
        .backgroundColor('#132323').borderRadius(19).border({ width: 1, color: '#7035E0D0' })
      Text(this.text('智巡·管廊', 'Smart Tunnel')).fontSize(22).fontWeight(FontWeight.Bold).fontColor('#EEF4F8').lineHeight(32).margin({ top: 16 })
      Text(this.text('城市地下综合管廊智能巡检', 'Intelligent underground utility inspection'))
        .fontSize(13).fontColor('#8A94A6').lineHeight(20).margin({ top: 4 })
    }.width('100%').margin({ bottom: this.viewportHeight < 700 ? 24 : 38 })
  }
  @Builder
  sheet() {
    Stack({ alignContent: Alignment.Bottom }) {
      Column().width('100%').height('100%').backgroundColor('#B503070B').onClick(() => this.panel = '')
      Column({ space: 14 }) {
        Row() {
          Text(this.panel === 'language' ? '语言切换' : this.panel === 'forgot' ? '找回密码' : this.panel === 'admin' ? '联系管理员' : this.panel === 'scan' ? '扫码登录' : this.panel === 'wechat' ? '企业微信' : this.panel === 'terms' ? '用户协议' : '隐私政策')
            .fontSize(18).fontWeight(FontWeight.Bold).fontColor('#EEF4F8').layoutWeight(1)
          Text('×').fontSize(24).fontColor('#8A94A6').width(44).height(44).textAlign(TextAlign.Center).onClick(() => this.panel = '')
        }.width('100%')
        if (this.panel === 'language') {
          ForEach(['简体中文', 'English'], (label: string, index: number) => {
            Text(label + (this.english === (index === 1) ? '  ✓' : '')).fontSize(14).fontColor('#DCE5EE')
              .width('100%').height(52).onClick(() => { this.english = index === 1; this.panel = ''; })
          })
        } else if (this.panel === 'forgot' || this.panel === 'admin') {
          Text(this.panel === 'admin' ? '请联系单位运维值班室或账号管理员，提供工号申请身份核验与手机换绑。' : '将向工号绑定的手机号发送验证码')
            .fontSize(13).lineHeight(25).fontColor('#8A94A6').width('100%')
          ActionButton({ label: this.panel === 'admin' ? '返回找回密码' : '开始验证', onAction: () => {
            if (this.panel === 'admin') { this.panel = 'forgot'; }
            else { this.recovering = true; this.panel = ''; }
          } })
          Text(this.panel === 'admin' ? '我知道了' : '联系管理员').fontSize(12).fontColor('#8A94A6').height(44).width('100%').textAlign(TextAlign.Center)
            .onClick(() => { this.panel = this.panel === 'admin' ? '' : 'admin'; })
        } else {
          Text(this.panel === 'forgot' ? '通过工号与绑定手机号验证后，设置新的登录密码。' : this.panel === 'scan' || this.panel === 'wechat' ? '当前为交互原型，尚未接入单位认证服务。请使用「使用演示账号进入」体验巡检流程。' : this.panel === 'terms' ? '用户协议以部署单位发布版本为准。' : '应用使用工号和密码验证身份。')
            .fontSize(13).lineHeight(25).fontColor('#8A94A6').width('100%').margin({ bottom: 10 })
          ActionButton({ label: this.panel === 'forgot' ? '开始找回密码' : this.panel === 'scan' || this.panel === 'wechat' ? '使用演示账号进入' : '我知道了', onAction: () => {
            if (this.panel === 'forgot') { this.recovering = true; this.panel = ''; }
            else if (this.panel === 'scan' || this.panel === 'wechat') { this.panel = ''; if (!this.loading) { MobileSession.logout(); this.enter(); } }
            else { this.panel = ''; }
          } })
        }
      }.width('100%').padding({ left: 20, right: 20, top: 14, bottom: 26 }).backgroundColor('#171D24')
        .borderRadius({ topLeft: 22, topRight: 22 })
    }.width('100%').height('100%')
  }
  build() {
    Stack({ alignContent: Alignment.TopEnd }) {
      if (this.recovering) {
        RecoveryPage({ initialJob: this.job, onBack: () => this.finishRecovery() })
      } else {
        Scroll() {
          Column() {
            this.brand()
            Column() {
              Text(this.text('工号', 'Inspector ID')).fontSize(13).fontColor('#AEB9C7').width('100%').margin({ bottom: 8 })
              Row({ space: 10 }) {
                AppIcon({ name: 'badge', iconSize: 18 })
                TextInput({ placeholder: this.text('请输入工号', 'Enter inspector ID'), text: this.job }).type(InputType.Normal)
                  .height(52).layoutWeight(1).fontSize(15).fontColor('#DCE5EE').placeholderColor('#5E7183').backgroundColor(Color.Transparent)
                  .padding({ left: 0, right: 8 }).maxLength(64).onChange((value: string) => { this.job = value; this.error = false; })
                  .onFocus(() => this.focused = 'job').onBlur(() => this.focused = '')
              }.height(54).width('100%').padding({ left: 12 }).backgroundColor('#0C1116').borderRadius(13)
                .border({ width: 1, color: this.error && !this.job ? T.danger : this.focused === 'job' ? T.accent : '#242D37' })
              Text(this.text('密码', 'Password')).fontSize(13).fontColor('#AEB9C7').width('100%').margin({ top: 16, bottom: 8 })
              Row({ space: 10 }) {
                AppIcon({ name: 'lock', iconSize: 18 })
                TextInput({ placeholder: this.text('请输入密码', 'Enter password'), text: this.password }).type(InputType.Password)
                  .height(52).layoutWeight(1).fontSize(15).fontColor('#DCE5EE').placeholderColor('#5E7183').backgroundColor(Color.Transparent).showPasswordIcon(true)
                  .padding({ left: 0, right: 8 }).onChange((value: string) => { this.password = value; this.error = false; })
                  .onFocus(() => this.focused = 'password').onBlur(() => this.focused = '')
              }.height(54).width('100%').padding({ left: 12 }).backgroundColor('#0C1116').borderRadius(13)
                .border({ width: 1, color: this.error ? T.danger : this.focused === 'password' ? T.accent : '#242D37' })
              Row({ space: 7 }) {
                Checkbox().select(this.remember).shape(CheckBoxShape.ROUNDED_SQUARE).selectedColor(T.accent).width(16).height(16).margin(0).onChange((value: boolean) => this.remember = value)
                Text(this.text('记住工号', 'Remember ID')).fontSize(13).fontColor('#8A94A6').onClick(() => this.remember = !this.remember)
                Blank()
                Text(this.text('忘记密码', 'Forgot password')).fontSize(13).fontColor('#8A94A6').height(44).onClick(() => this.panel = 'forgot')
              }.width('100%').height(44).margin({ top: 6 })
            }.width('100%').padding({ top: 18, left: 16, right: 16, bottom: 6 }).backgroundColor('#171D24').borderRadius(18)
              .border({ width: 1, color: '#242D37' })
            Text(this.error ? this.text('请输入工号和密码', 'Enter your ID and password') : this.failure)
              .fontSize(12).fontColor('#FF6264').constraintSize({ minHeight: 30 }).width('100%')
            if (this.loading) {
              Row({ space: 8 }) {
                LoadingProgress().width(18).height(18).color('#092421')
                Text(this.text('登录中…', 'Signing in…')).fontSize(13).fontWeight(FontWeight.Bold).fontColor('#092421')
              }.width('100%').height(54).justifyContent(FlexAlign.Center).backgroundColor(T.accent).borderRadius(14).opacity(0.75)
            } else {
              ActionButton({ label: this.text('登 录', 'Sign in'), onAction: () => this.submit() })
            }
            Text(this.text('使用演示账号进入  →', 'Enter with demo account  →')).fontSize(14).fontColor(T.accent).height(46)
              .margin({ top: 6 }).onClick(() => { if (!this.loading) { MobileSession.logout(); this.enter(); } })
            Row({ space: 12 }) {
              Divider().color('#242D37').layoutWeight(1)
              Text(this.text('其他方式', 'Other methods')).fontSize(12).fontColor('#67778B')
              Divider().color('#242D37').layoutWeight(1)
            }.width('100%').margin({ top: 14, bottom: 16 })
            Row({ space: 12 }) {
              ForEach([this.text('扫码登录', 'Scan QR'), this.text('企业微信', 'WeCom')], (label: string, index: number) => {
                Row({ space: 8 }) {
                  AppIcon({ name: index === 0 ? 'scan' : 'wecom', iconSize: 20 })
                  Text(label).fontSize(14).fontColor('#9AA9BB')
                }.height(50).layoutWeight(1).justifyContent(FlexAlign.Center)
                  .borderRadius(14).border({ width: 1, color: '#2A3643' }).onClick(() => this.panel = index === 0 ? 'scan' : 'wechat')
              })
            }.width('100%')
            Row({ space: 4 }) {
              Text(this.text('登录即表示同意', 'By signing in, you agree to')).fontSize(12).fontColor('#67778B')
              Text(this.text('用户协议', 'Terms')).fontSize(12).fontColor('#8A94A6').height(44).onClick(() => this.panel = 'terms')
              Text(this.text('和', 'and')).fontSize(12).fontColor('#67778B')
              Text(this.text('隐私政策', 'Privacy')).fontSize(12).fontColor('#8A94A6').height(44).onClick(() => this.panel = 'privacy')
            }.justifyContent(FlexAlign.Center).width('100%').margin({ top: 22 })
            Text('v2.6.0').fontSize(11).fontColor('#596B7E')
          }.width('100%').constraintSize({ minHeight: this.viewportHeight })
            .padding({ top: this.viewportHeight < 700 ? 48 : 96, left: 24, right: 24, bottom: 16 })
        }.width('100%').height('100%').scrollBar(BarState.Off)
        Row({ space: 5 }) {
          AppIcon({ name: 'globe', iconSize: 21 })
          Text(this.english ? 'EN' : '中').fontSize(11).fontColor('#8A94A6')
        }.height(44).width(60).justifyContent(FlexAlign.Center).margin({ top: 12, right: 16 }).onClick(() => this.panel = 'language')
      }
      if (this.panel) { this.sheet() }
    }.width('100%').height('100%').backgroundColor('#0D1116')
      .onAreaChange((_old: Area, area: Area) => this.viewportHeight = Number(area.height))
  }
}
