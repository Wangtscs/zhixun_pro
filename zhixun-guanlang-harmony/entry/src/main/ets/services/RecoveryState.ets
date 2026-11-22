export class RecoveryState {
  step: number = 0;
  remaining: number = 0;
  deadline: number = 0;
  attempts: number = 3;
  error: string = '';
  done: boolean = false;
  static validJob(job: string): boolean { return /^[a-z0-9]{6,}$/i.test(job.trim()); }
  static normalizeCode(value: string): string { return value.replace(/\D/g, '').slice(0, 6); }
  static rules(password: string): boolean[] {
    return [password.length >= 8, /[a-z]/i.test(password) && /\d/.test(password), password.length > 0 && password !== 'Tunnel2026'];
  }
  send(job: string, now: number): boolean {
    if (!RecoveryState.validJob(job) || (this.step === 1 && this.remaining > 0)) { return false; }
    if (job.trim() === '000000') { this.error = '工号不存在，请确认后重试'; return false; }
    this.step = 1; this.remaining = 59; this.deadline = now + 59000; this.attempts = 3; this.error = ''; return true;
  }
  tick(now: number): void { this.remaining = Math.max(0, Math.ceil((this.deadline - now) / 1000)); }
  verify(code: string): boolean {
    if (this.step !== 1 || code.length !== 6 || this.attempts === 0) { return false; }
    if (code === '123456') { this.step = 2; this.error = ''; return true; }
    this.attempts--;
    this.error = this.attempts > 0 ? '验证码错误，还可重试 ' + this.attempts + ' 次' : '重试次数已用完，请重新发送验证码'; return false;
  }
  complete(password: string, confirmation: string): boolean {
    if (this.step !== 2 || !RecoveryState.rules(password).every((value: boolean) => value) || password !== confirmation) { return false; }
    this.done = true; return true;
  }
}
