#!/usr/bin/env bun

import process from 'node:process';
import { init } from './init.ts';
import { Op } from './Op.ts';
import type { Failure, Success } from './Outcome.ts';
import { PromptForPasswordOp } from './PromptForPasswordOp.ts';
import { PromptForValueOp } from './PromptForValueOp.ts';

class DemoOp extends Op<string, 'canceled'>
{
  name = 'DemoOp';

  async execute(): Promise<Success<string> | Failure<'canceled'>>
  {
    const name = await new PromptForValueOp('Username: ').run();
    if (!name.ok) return this.fail('canceled');

    // PromptForPasswordOp uses InputRecording.prohibit(), so the actual
    // password is never saved to the recording file. During replay, you must
    // manually add a placeholder event for this prompt in the session JSON
    // (the value doesn't matter for most test scenarios — use "\n" for empty
    // or "placeholder\n" if the op validates non-empty input).
    const password = await new PromptForPasswordOp('Password: ').run();
    if (!password.ok) return this.fail('canceled');

    const color = await new PromptForValueOp('Favorite color: ').run();
    if (!color.ok) return this.fail('canceled');

    const confirm = await new PromptForValueOp('Are you sure? (yes/no): ').run();
    if (!confirm.ok) return this.fail('canceled');

    this.io.stdout.write(`\nYou said: ${name.value}, [password hidden], ${color.value}, ${confirm.value}\n`);
    return this.succeed(`${name.value}:${color.value}:${confirm.value}`);
  }
}

const { opsMain } = init(process.argv.slice(2));
const outcome = await opsMain(new DemoOp());

if (!outcome.ok)
{
  process.exit(1);
}
