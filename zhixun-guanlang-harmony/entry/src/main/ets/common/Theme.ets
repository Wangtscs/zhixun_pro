export class T {
  static accent: string = '#35E0D0';
  static danger: string = '#FF4D4F';
  static warning: string = '#FFB020';
  static bg(dark: boolean): string { return dark ? '#0E1116' : '#F5F7F9'; }
  static card(dark: boolean): string { return dark ? '#161B22' : '#FFFFFF'; }
  static chrome(dark: boolean): string { return dark ? '#12161C' : '#FFFFFF'; }
  static inset(dark: boolean): string { return dark ? '#12171D' : '#F4F7F9'; }
  static border(dark: boolean): string { return dark ? '#232B36' : '#DCE3E9'; }
  static text(dark: boolean): string { return dark ? '#DCE5EC' : '#1A2B38'; }
  static muted(dark: boolean): string { return dark ? '#71808D' : '#5E7183'; }
  static selected(dark: boolean): string { return dark ? '#242D36' : '#E8F0F2'; }
  static tint(dark: boolean): string { return dark ? '#35E0D0' : '#007E73'; }
  static state(state: string): string {
    return state === 'alarm' ? T.danger : state === 'watch' ? T.warning : state === 'unknown' ? '#71808D' : T.accent;
  }
}
