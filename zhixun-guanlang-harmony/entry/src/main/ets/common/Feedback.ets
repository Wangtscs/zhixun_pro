import { UIContext } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

export function notify(context: UIContext, message: string): void {
  try { context.getPromptAction().showToast({ message: message }); }
  catch { hilog.warn(0x0000, 'Zhixun', 'Toast unavailable after UI context changed'); }
}
