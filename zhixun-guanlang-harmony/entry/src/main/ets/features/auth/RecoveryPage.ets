import { T } from '../../common/Theme';
import { ActionButton, AppIcon } from '../../common/Ui';
import { RecoveryState } from '../../services/RecoveryState';

@Component
export struct RecoveryPage {
  @StorageLink('safeTop') safeTop: number = 26;
  @Prop initialJob: string = '';
  onBack: () => void = () => {};
  @StorageLink('recoveryStep') @Watch('stepChanged') step: number = 0;
  @State job: string = '';
  @State code: string = '';
  @State password: string = '';
  @State confirmation: string = '';
  @State touched: boolean = false;
  @State remaining: number = 0;
  @State attempts: number = 3;
  @State error: string = '';
  @State codeFocused: boolean = false;
  private model: RecoveryState = new RecoveryState();
  private timer: number = -1;
  private focusTimer: number = -1;
  aboutToAppear(): void {
    this.job = this.initialJob; this.step = 0;
    this.timer = setInterval(() => { this.model.tick(Date.now()); this.remaining = this.model.remaining; }, 1000);
  }
  aboutToDisappear(): void { clearInterval(this.timer); clearTimeout(this.focusTimer); }
  private stepChanged(): void { this.model.step = this.step; this.code = ''; this.error = ''; }
  private focusDigit(_index: number): void {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() => { focusControl.requestFocus('recovery-code'); }, 80);
  }
  private send(): void {
    this.model.step = this.step;
    if (this.model.send(this.job, Date.now())) { this.step = 1; this.code = ''; this.focusDigit(0); }
    this.error = this.model.error; this.remaining = this.model.remaining; this.attempts = this.model.attempts;
  }
  private verify(): void {
    if (this.model.verify(this.code)) { this.step = 2; }
    else { this.code = ''; this.focusDigit(0); }
    this.error = this.model.error; this.attempts = this.model.attempts;
  }
  private canComplete(): boolean { return RecoveryState.rules(this.password).every((value: boolean) => value) && this.password === this.confirmation; }
  @Builder
  identity() {
    Column({ space: 8 }) {
      Text('工号').fontSize(13).fontColor('#8A94A6').width('100%')
      TextInput({ placeholder: '请输入工号', text: this.job }).type(InputType.Normal).maxLength(20)
        .height(52).fontSize(14).fontColor('#DCE5EE').placeholderColor('#4F6072').backgroundColor('#0E1116')
        .borderRadius(12).border({ width: 1, color: this.error ? T.danger : '#232B36' })
        .onChange((value: string) => { this.job = value.replace(/[^a-z0-9]/gi, ''); this.error = ''; })
      Text('例如 ZX2026001').fontSize(11).fontColor('#596B7E').width('100%')
      Text(this.error).fontSize(11).fontColor(T.danger).width('100%')
      Row() {
        Text('绑定手机').fontSize(13).fontColor('#8A94A6').layoutWeight(1)
        Text('换绑').fontSize(11).fontColor('#596B7E').enabled(false).accessibilityText('换绑不可用，请先联系管理员')
      }.width('100%').margin({ top: 8 })
      Text('138****6721').fontSize(14).fontColor('#8A94A6').width('100%').height(52).padding(12)
        .backgroundColor('#0E1116').borderRadius(12)
    }.padding(16).width('100%').backgroundColor('#161B22').borderRadius(16).border({ width: 1, color: '#232B36' })
    ActionButton({ label: '获取验证码', isEnabled: RecoveryState.validJob(this.job), onAction: () => this.send() })
    Text('本地演示：使用 ZX2026001；输入 000000 可预览工号错误。不会发送真实短信。')
      .fontSize(11).lineHeight(19).fontColor('#596B7E').width('100%')
  }
  @Builder
  verification() {
    // One native editor owns the IME, paste and deletion. Six cells render its value.
    // Moving focus between six editors races with rapid input and can lose repeated digits.
    Stack() {
      Row({ space: 8 }) {
        ForEach([0, 1, 2, 3, 4, 5], (index: number) => {
          Text(this.code[index] || '').layoutWeight(1).height(52).textAlign(TextAlign.Center).fontSize(20).fontColor('#DCE5EE')
            .backgroundColor('#0E1116').borderRadius(10).border({ width: 1,
              color: this.error ? T.danger : this.codeFocused && index === Math.min(this.code.length, 5) ? T.accent : '#232B36' })
        })
      }.width('100%').height(52).accessibilityLevel('no-hide-descendants')
      TextInput({ text: this.code }).id('recovery-code').type(InputType.Number).maxLength(6)
        .width('100%').height(52).padding(0).fontColor(Color.Transparent).caretColor(Color.Transparent)
        .backgroundColor(Color.Transparent).borderRadius(0).enabled(this.attempts > 0)
        .onChange((value: string) => {
          const next = RecoveryState.normalizeCode(value);
          if (next !== this.code) { this.code = next; this.error = ''; }
        })
        .onFocus(() => this.codeFocused = true).onBlur(() => this.codeFocused = false)
        .accessibilityText('六位短信验证码')
    }.width('100%').height(52)
    Text(this.error).fontSize(11).fontColor(T.danger).width('100%').height(28)
    Row({ space: 8 }) {
      Text('没有收到验证码？').fontSize(11).fontColor('#8A94A6')
      Text(this.remaining > 0 ? this.remaining + 's 后可重新发送' : '重新发送').fontSize(11)
        .fontColor(this.remaining > 0 ? '#596B7E' : T.accent).height(44).enabled(this.remaining === 0).onClick(() => this.send())
    }.width('100%').justifyContent(FlexAlign.Center)
    ActionButton({ label: '下一步', isEnabled: this.code.length === 6 && this.attempts > 0, onAction: () => this.verify() })
    Text('演示验证码：123456\n输入其他 6 位数字可预览验证失败状态。').fontSize(11).lineHeight(19).fontColor('#596B7E').width('100%')
  }
  @Builder
  newPassword() {
    Column({ space: 8 }) {
      Text('新密码').fontSize(13).fontColor('#8A94A6').width('100%')
      TextInput({ placeholder: '请输入至少 8 位新密码', text: this.password }).type(InputType.Password).showPasswordIcon(true)
        .height(52).fontSize(14).fontColor('#DCE5EE').placeholderColor('#4F6072').backgroundColor('#0E1116')
        .onChange((value: string) => this.password = value)
      Text('确认新密码').fontSize(13).fontColor('#8A94A6').width('100%').margin({ top: 12 })
      TextInput({ placeholder: '请再次输入新密码', text: this.confirmation }).type(InputType.Password).showPasswordIcon(true)
        .height(52).fontSize(14).fontColor('#DCE5EE').placeholderColor('#4F6072').backgroundColor('#0E1116')
        .border({ width: 1, color: this.touched && this.confirmation !== this.password ? T.danger : '#232B36' }).borderRadius(12)
        .onChange((value: string) => { this.confirmation = value; this.touched = true; }).onBlur(() => this.touched = true)
      Text(this.touched && this.confirmation !== this.password ? '两次输入的密码不一致' : '').fontSize(11).fontColor(T.danger).width('100%')
    }.padding(16).width('100%').backgroundColor('#161B22').borderRadius(16)
    Column({ space: 12 }) {
      ForEach(['至少 8 位', '含字母和数字', '不能与旧密码相同'], (label: string, index: number) => {
        Text((RecoveryState.rules(this.password)[index] ? '✓  ' : '·  ') + label).fontSize(12)
          .fontColor(RecoveryState.rules(this.password)[index] ? T.accent : '#596B7E')
      })
    }.width('100%').alignItems(HorizontalAlign.Start).padding({ left: 12, top: 8, bottom: 8 })
    ActionButton({ label: '完成', isEnabled: this.canComplete(), onAction: () => { if (this.model.complete(this.password, this.confirmation)) { this.step = 3; } } })
    Text('旧密码比对使用演示值 Tunnel2026。\n请勿输入真实密码；新密码不会保存或上传。').fontSize(11).lineHeight(19).fontColor('#596B7E').width('100%')
  }
  build() {
    Column() {
      if (this.step === 3) {
        Column({ space: 18 }) {
          Text('✓').fontSize(38).fontColor(T.accent).width(88).height(88).textAlign(TextAlign.Center)
            .backgroundColor('#1035E0D0').borderRadius(44).border({ width: 1, color: '#4035E0D0' })
          Text('密码已重置').fontSize(24).fontColor('#EEF4F8').fontWeight(600)
          Text('请返回登录页，使用新密码登录').fontSize(13).fontColor('#8A94A6')
          Text('演示完成 · 未修改真实账号密码').fontSize(11).fontColor('#596B7E')
        }.width('100%').layoutWeight(1).justifyContent(FlexAlign.Center)
        Row() { ActionButton({ label: '返回登录', onAction: this.onBack }) }.padding(24).width('100%')
      } else {
        Row() {
          Row() { AppIcon({ name: 'back', color: '#DCE5EC' }) }.width(44).height(52).justifyContent(FlexAlign.Center)
            .onClick(() => { if (this.step > 0) { this.step--; } else { this.onBack(); } })
          Text('找回密码').fontSize(18).fontColor('#EEF4F8').fontWeight(600).layoutWeight(1).textAlign(TextAlign.Center)
          Text((this.step + 1) + '/3').fontSize(12).fontColor(T.accent).width(44).textAlign(TextAlign.Center)
        }.width('100%').height(56)
        Progress({ value: this.step + 1, total: 3, type: ProgressType.Linear }).width('100%').height(3).color(T.accent).backgroundColor('#232B36')
        Scroll() {
          Column({ space: 18 }) {
            Text('步骤 0' + (this.step + 1) + ' / 03').fontSize(11).fontColor('#596B7E').width('100%')
            Text(['验证身份', '输入验证码', '设置新密码'][this.step]).fontSize(24).fontColor('#EEF4F8').fontWeight(600).width('100%')
            Text(this.step === 0 ? '确认工号与绑定手机号，保障账号安全' : this.step === 1 ? '已发送至 138****6721' : '为你的巡检账号设置一个安全的新密码')
              .fontSize(13).fontColor('#8A94A6').width('100%')
            if (this.step === 0) { this.identity() } else if (this.step === 1) { this.verification() } else { this.newPassword() }
            Text('账号安全验证 · 智巡管廊').fontSize(11).fontColor('#596B7E').width('100%').textAlign(TextAlign.Center).margin({ top: 24 })
          }.width('100%').padding({ top: 36, left: 24, right: 24, bottom: 24 }).alignItems(HorizontalAlign.Start)
        }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      }
    }.width('100%').height('100%').padding({ top: this.safeTop }).backgroundColor('#0E1116')
  }
}
