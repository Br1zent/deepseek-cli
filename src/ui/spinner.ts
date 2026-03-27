import ora, { type Ora } from "ora";

export class Spinner {
  private instance: Ora | null = null;
  private readonly noColor: boolean;

  constructor() {
    this.noColor = Boolean(process.env["NO_COLOR"]);
  }

  start(text: string): void {
    if (this.noColor || !process.stdout.isTTY) {
      process.stderr.write(`${text}...\n`);
      return;
    }
    this.instance = ora({ text, stream: process.stderr }).start();
  }

  update(text: string): void {
    if (this.instance) {
      this.instance.text = text;
    }
  }

  succeed(text?: string): void {
    if (this.instance) {
      this.instance.succeed(text);
      this.instance = null;
    } else if (text) {
      process.stderr.write(`✓ ${text}\n`);
    }
  }

  fail(text?: string): void {
    if (this.instance) {
      this.instance.fail(text);
      this.instance = null;
    } else if (text) {
      process.stderr.write(`✗ ${text}\n`);
    }
  }

  stop(): void {
    if (this.instance) {
      this.instance.stop();
      this.instance = null;
    }
  }

  isSpinning(): boolean {
    return this.instance?.isSpinning ?? false;
  }
}
