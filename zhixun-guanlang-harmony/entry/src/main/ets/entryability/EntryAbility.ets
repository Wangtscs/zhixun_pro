import { UIAbility } from '@kit.AbilityKit';
import { window } from '@kit.ArkUI';
import { hilog } from '@kit.PerformanceAnalysisKit';

export default class EntryAbility extends UIAbility {
  private updateSafeTop(mainWindow: window.Window): void {
    try {
      const cutout = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_CUTOUT).topRect;
      const system = mainWindow.getWindowAvoidArea(window.AvoidAreaType.TYPE_SYSTEM).topRect;
      const top = Math.max(cutout.top + cutout.height, system.top + system.height);
      AppStorage.setOrCreate('safeTop', Math.max(26, mainWindow.getUIContext().px2vp(top)));
    } catch (error) {
      hilog.warn(0x0000, 'Zhixun', 'Unable to update top safe area: %{public}s', String(error));
    }
  }
  onWindowStageCreate(windowStage: window.WindowStage): void {
    const mainWindow = windowStage.getMainWindowSync();
    this.updateSafeTop(mainWindow);
    mainWindow.on('avoidAreaChange', () => this.updateSafeTop(mainWindow));
    // The supplied design includes its own status and bottom navigation bars.
    windowStage.getMainWindowSync().setWindowLayoutFullScreen(true).catch((error: Error) => {
      hilog.error(0x0000, 'Zhixun', 'Fullscreen setup failed: %{public}s', error.message);
    });
    windowStage.getMainWindowSync().setWindowSystemBarEnable([]).catch((error: Error) => {
      hilog.error(0x0000, 'Zhixun', 'System bar setup failed: %{public}s', error.message);
    });
    windowStage.loadContent('pages/Index', (error) => {
      if (error.code) {
        hilog.error(0x0000, 'Zhixun', 'Page load failed: %{public}s', error.message);
      }
    });
  }
}
