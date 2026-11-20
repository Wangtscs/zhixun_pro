
import { T } from '../../common/Theme';
import { abilityAccessCtrl } from '@kit.AbilityKit';
import { audio } from '@kit.AudioKit';
import { speechRecognizer, textToSpeech } from '@kit.CoreSpeechKit';
import { MobileSession } from '../../services/MobileSession';
import { PageHeader, AppIcon } from '../../common/Ui';
import { SensorNode } from '../../models/Inspection';
import { assistantPlainText } from './AssistantMarkdown';
import { MarkdownReply } from './MarkdownReply';

interface AssistantReply {
  reply: string;
}

@Component
export struct AssistantPage {
  @StorageLink('darkMode') dark: boolean = true;
  onOpenTask: () => void = () => {};
  onRepair: (suggestion: string) => void = () => {};
  onBack: () => void = () => {};
  @Prop node: SensorNode | undefined = undefined;
  @State input: string = '';
  @State question: string = '';
  @State reply: string = '';
  @State error: string = '';
  @State loading: boolean = false;
  @State voiceStatus: string = '';
  @State voiceBusy: boolean = false;
  @State recording: boolean = false;
  @State speaking: boolean = false;
  private recognition?: speechRecognizer.SpeechRecognitionEngine;
  private capturer?: audio.AudioCapturer;
  private narrator?: textToSpeech.TextToSpeechEngine;
  private voiceId: string = '';
  private readId: string = '';
  private timer: number = -1;
  private sequence: number = 0;
  private transcript: string = '';
  private partial: string = '';

  aboutToDisappear(): void {
    this.endVoice(false);
    this.stopReading();
  }

  private async releaseCapture(source: audio.AudioCapturer): Promise<void> {
    try { await source.release(); } catch {}
  }

  private endVoice(useText: boolean, message: string = ''): void {
    this.voiceId = '';
    clearTimeout(this.timer);
    const source = this.capturer;
    const engine = this.recognition;
    this.capturer = undefined;
    this.recognition = undefined;
    this.recording = false;
    this.voiceBusy = false;
    if (source) { this.releaseCapture(source); }
    try { engine?.shutdown(); } catch {}
    const value = (this.transcript + this.partial).trim();
    if (useText && value) {
      this.input = this.input.trim() ? this.input.trim() + ' ' + value : value;
    }
    this.voiceStatus = message || (useText ? (value ? '请确认识别文字后发送' : '未听清，请重试或手动输入') : '');
  }

  private finishVoice(): void {
    const id = this.voiceId;
    if (!id || !this.recording) { return; }
    this.recording = false;
    this.voiceStatus = '正在识别…';
    clearTimeout(this.timer);
    const source = this.capturer;
    this.capturer = undefined;
    if (source) { this.releaseCapture(source); }
    this.timer = setTimeout(() => {
      if (this.voiceId === id) { this.endVoice(true); }
    }, 4000);
    try { this.recognition?.finish(id); } catch { this.endVoice(true); }
  }

  private async capture(id: string): Promise<void> {
    try {
      const source = await audio.createAudioCapturer({
        streamInfo: { samplingRate: audio.AudioSamplingRate.SAMPLE_RATE_16000,
          channels: audio.AudioChannel.CHANNEL_1, sampleFormat: audio.AudioSampleFormat.SAMPLE_FORMAT_S16LE,
          encodingType: audio.AudioEncodingType.ENCODING_TYPE_RAW },
        capturerInfo: { source: audio.SourceType.SOURCE_TYPE_MIC, capturerFlags: 0 }
      });
      if (this.voiceId !== id) { this.releaseCapture(source); return; }
      this.capturer = source;
      source.on('readData', (buffer: ArrayBuffer) => {
        if (this.voiceId !== id || !this.recording) { return; }
        try { this.recognition?.writeAudio(id, new Uint8Array(buffer)); }
        catch { this.endVoice(false, '语音识别中断，请重试或手动输入'); }
      });
      this.recording = true;
      await source.start();
      if (this.voiceId !== id || !this.recording) { return; }
      this.voiceStatus = '正在听，点麦克风结束';
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.finishVoice(), 15000);
    } catch {
      if (this.voiceId === id) { this.endVoice(false, '无法使用麦克风，请检查权限或手动输入'); }
    }
  }

  private async microphone(): Promise<void> {
    if (this.recording) { this.finishVoice(); return; }
    if (this.voiceBusy || this.loading || this.speaking) { return; }
    const id = 'voice-' + Date.now() + '-' + (++this.sequence);
    this.voiceId = id;
    this.voiceBusy = true;
    this.voiceStatus = '正在准备语音输入…';
    this.transcript = '';
    this.partial = '';
    try {
      const context = this.getUIContext().getHostContext();
      if (!context) { this.endVoice(false, '无法使用麦克风，可手动输入'); return; }
      const result = await abilityAccessCtrl.createAtManager().requestPermissionsFromUser(context,
        ['ohos.permission.MICROPHONE']);
      if (this.voiceId !== id) { return; }
      if (result.authResults[0] !== 0) { this.endVoice(false, '请在系统设置允许麦克风，或手动输入'); return; }
      this.timer = setTimeout(() => {
        if (this.voiceId === id) { this.endVoice(false, '语音服务启动超时，可手动输入'); }
      }, 10000);
      const engine = await speechRecognizer.createEngine({ language: 'zh-CN', online: 1 });
      if (this.voiceId !== id) { engine.shutdown(); return; }
      this.recognition = engine;
      engine.setListener({
        onStart: (sessionId: string) => { if (sessionId === this.voiceId) { this.capture(sessionId); } },
        onEvent: () => {},
        onResult: (sessionId: string, result: speechRecognizer.SpeechRecognitionResult) => {
          if (sessionId !== this.voiceId) { return; }
          if (result.isFinal) { this.transcript += result.result; this.partial = ''; }
          else { this.partial = result.result; }
        },
        onComplete: (sessionId: string) => { if (sessionId === this.voiceId) { this.endVoice(true); } },
        onError: (sessionId: string) => {
          if (sessionId === this.voiceId) { this.endVoice(false, '语音识别不可用，请重试或手动输入'); }
        }
      });
      engine.startListening({ sessionId: id,
        audioInfo: { audioType: 'pcm', sampleRate: 16000, soundChannel: 1, sampleBit: 16 } });
    } catch {
      if (this.voiceId === id) { this.endVoice(false, '设备暂无法启用中文语音识别，可手动输入'); }
    }
  }

  private stopReading(): void {
    this.readId = '';
    this.speaking = false;
    const engine = this.narrator;
    this.narrator = undefined;
    try { engine?.stop(); } catch {}
    try { engine?.shutdown(); } catch {}
  }

  private async readReply(): Promise<void> {
    if (this.speaking) { this.stopReading(); return; }
    if (!this.reply || this.loading || this.voiceBusy) { return; }
    const id = 'read-' + Date.now() + '-' + (++this.sequence);
    this.readId = id;
    this.speaking = true;
    this.voiceStatus = '';
    try {
      const engine = await textToSpeech.createEngine({ language: 'zh-CN', person: 0, online: 1 });
      if (this.readId !== id) { engine.shutdown(); return; }
      this.narrator = engine;
      const parts = assistantPlainText(this.reply).match(/[\s\S]{1,240}/g) || [];
      let index = 0;
      engine.setListener({
        onStart: () => {},
        onStop: () => {},
        onComplete: (requestId: string) => {
          if (this.readId !== id || requestId !== id + '-' + index) { return; }
          index++;
          if (index >= parts.length) { this.stopReading(); return; }
          try { engine.speak(parts[index], { requestId: id + '-' + index }); }
          catch { this.stopReading(); this.voiceStatus = '朗读中断，可以查看文字回复'; }
        },
        onError: () => {
          if (this.readId === id) { this.stopReading(); this.voiceStatus = '朗读失败，可以查看文字回复'; }
        }
      });
      engine.speak(parts[0], { requestId: id + '-0' });
    } catch {
      if (this.readId === id) { this.stopReading(); this.voiceStatus = '设备暂无法朗读，可以查看文字回复'; }
    }
  }
  private examples: string[] = [
    '模拟告警：演示舱 A 的气体传感器触发告警，读数和单位暂缺。',
    '模拟告警：演示舱 B 的阀门压力出现波动，告警等级待确认。'
  ];

  private async send(value: string): Promise<void> {
    const question = value.trim();
    if (!question || this.loading || this.voiceBusy) { return; }
    this.stopReading();
    this.voiceStatus = '';
    this.question = question;
    this.reply = '';
    this.error = '';
    if (!MobileSession.active()) {
      this.error = '请使用业务账号登录后再使用巡检助手。';
      return;
    }
    this.input = '';
    this.loading = true;
    try {
      const prompt = this.node ? '巡检节点 ' + this.node.id + '：' + question : question;
      const result = await MobileSession.post<AssistantReply>('/api/assistant/ask', JSON.stringify({ question: prompt }), 60000);
      this.reply = result?.reply?.trim() || '';
      if (!this.reply) { this.error = 'DeepSeek未返回答复，请重试。'; }
    } catch (error) {
      this.error = (error as Error).message || '调用DeepSeek失败，请重试。';
    } finally {
      this.loading = false;
    }
  }

  build() {
    Column() {
      PageHeader({ title: 'AI 巡检助手', subtitle: this.node?.id || '告警研判与抢险建议',
        back: this.node !== undefined, onBack: this.onBack })
      Scroll() {
        Column({ space: 16 }) {
          if (this.question) {
            Text(this.question).fontSize(12).lineHeight(21).fontColor(T.text(this.dark))
              .width('88%').padding(13).backgroundColor(T.selected(this.dark))
              .borderRadius(14).alignSelf(ItemAlign.End)
          }
          if (this.loading || this.error || this.reply) {
            Column({ space: 12 }) {
              Text('DeepSeek · 管廊告警处置助手').fontSize(11).fontColor(T.muted(this.dark)).width('100%')
              if (this.loading || this.error) {
                Text(this.loading ? '正在研判告警…' : this.error)
                  .fontSize(13).lineHeight(23).fontColor(T.text(this.dark)).width('100%')
              } else {
                MarkdownReply({ source: this.reply, dark: this.dark })
              }
              if (this.error && MobileSession.active()) {
                Button('重试', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).onClick(() => this.send(this.question))
              }
              if (this.reply) {
                if (this.node?.live) {
                  Button('使用 AI 建议报修', { type: ButtonType.Normal })
                    .backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9)
                    .onClick(() => this.onRepair(assistantPlainText(this.reply)))
                }
                Button(this.speaking ? '停止朗读' : '朗读回复', { type: ButtonType.Normal })
                  .backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9)
                  .enabled(!this.voiceBusy).onClick(() => this.readReply())
                Button('查看工单', { type: ButtonType.Normal }).backgroundColor(T.selected(this.dark)).fontColor(T.tint(this.dark)).borderRadius(9).onClick(this.onOpenTask)
              }
            }.width('100%').padding(13).backgroundColor(T.card(this.dark)).borderRadius(14)
              .border({ width: 1, color: T.border(this.dark) })
          }
          Text('试试这样问').fontSize(8).fontColor(T.muted(this.dark)).width('100%')
          Row({ space: 8 }) {
            ForEach(['燃气泄漏处置', '阀门压力异常'], (label: string, index: number) => {
              Text(label).fontSize(9).fontColor(T.text(this.dark)).padding(10).borderRadius(10)
                .backgroundColor(T.card(this.dark)).border({ width: 1, color: T.border(this.dark) }).onClick(() => this.send(this.examples[index]))
            })
          }.width('100%')
        }.width('100%').padding(12)
      }.width('100%').layoutWeight(1).scrollBar(BarState.Off).align(Alignment.Top)
      if (this.voiceStatus) {
        Text(this.voiceStatus).fontSize(10).fontColor(T.muted(this.dark)).width('100%').padding({ left: 12, right: 12 })
      }
      Row({ space: 8 }) {
        TextInput({ placeholder: '输入巡检问题…', text: this.input }).layoutWeight(1).height(48).fontSize(12)
          .fontColor(T.text(this.dark)).placeholderColor(T.muted(this.dark)).backgroundColor(T.inset(this.dark)).onChange((value: string) => this.input = value)
          .enterKeyType(EnterKeyType.Send).onSubmit(() => this.send(this.input))
        Row() { AppIcon({ name: 'mic', iconSize: 22 }) }.width(40).height(44).justifyContent(FlexAlign.Center)
          .backgroundColor(this.recording ? T.selected(this.dark) : Color.Transparent).borderRadius(9)
          .enabled(!this.loading && !this.speaking && (!this.voiceBusy || this.recording))
          .accessibilityText(this.recording ? '结束录音' : '语音输入').onClick(() => this.microphone())
        Row() { AppIcon({ name: 'send', iconSize: 18, color: '#092421' }) }.width(38).height(38).justifyContent(FlexAlign.Center)
          .borderRadius(10).backgroundColor(T.accent).onClick(() => this.send(this.input))
      }.width('100%').padding(12).backgroundColor(T.card(this.dark))
    }.width('100%').height('100%').backgroundColor(T.bg(this.dark))
  }
}
