# @axhxrx/op

A minimal implentation the Ops Pattern — a composable, generally stack-based architecture for TypeScript applications where every action is an Op.

## The Ops Pattern

The Ops Pattern is a set of constraints and simplifications that reduces the number of decisions that need to — or can be — made about application architecture.

It is intended to constrain "AI" coding agents in ways that help them more reliably produce consistent, usable output.

Every action — basic UI interactions, making API calls, executing subcommands, processsing files, arbitrary business logic — is implemented as an **`Op`** that returns a standardized **`Outcome`**.

## What's an Op?

An Op is a unit of work that returns a strongly-typed `Outcome<SuccessT, FailureT>`.

Ops normally compose via a stack-based runner, which supports record/replay of interactive sessions. This enables bots to adopt the role of the user, operate the software being built, and interactively test it, creating their own feedback loops. This, combined with extensive use of TypeScript's type system and exhaustive-type checking, seems to give them the tools they need to produce better code.

Ops are often also independently executable as standalone CLI tools.

The main point of them is that they force as much of the software as possible into the same basic pattern, which is not super-annoying for a human (it might a little bit annoying, though) and seems to provide the simplicity and testability to make it easier for LLMs to do... whatever it is they do that seems like _reasoning_, about the code.

It's a pattern that has yielded better useful results, and fewer useless or harmful results, from 2025-era coding LLMs like GPT5-Codex and Claude Sonnet 4.5 (and others), and continues to yield good results for us with more recent models.

## Examples

_Description forthcoming._

## Recording and replaying interactive sessions

This library provides a simple `--record` feature to record an entire interactive user session to a file, and a `--replay` feature to play them back. This can be useful for:

- recording a sequence of steps, e.g. to reproduce the conditions needed to debug something in your program
- write E2E tests for CLI apps, that actually run the app and interact with it
- let coding agents script the program easily to test it themselves (all models understand the session format, and can use it for scripting without any training)

To record a session, use `--record $FILENAME`:

```text
 ./demo-replay.ts --record session.json 
[IOContext] 🔴 Recording input to: session.json
Username: Axton
Password: 
Favorite color: mauve
Are you sure? (yes/no): no

You said: Axton, [password hidden], mauve, no
[RecordableStdin] 💾 Session saved to: session.json
[RecordableStdin] 📊 Recorded 4 input events
```
... and `--replay $FILENAME` to replay it:

```text
 ./demo-replay.ts --replay session.json
Username: Axton
Password: FIXME_EDIT_SESSION_FILE_TO_REPLACE_THIS_PLACEHOLDER

Favorite color: mauve
Are you sure? (yes/no): no

You said: Axton, [password hidden], mauve, no
```

Note that when recording, the session is bracketed by informational messages to indicate recording is happening. When replaying, however, this is not done, so as to keep the output as realistic as possible. The main exception to this is when recording is active and passwords are input.

When recording a password with the included `PromptForPasswordOp`, recording is disabled for security. When recording is disabled, instead of recording the real text entered interactively, the above placeholder text is recorded to the session file.

 In our demo program, things still work because we don't check the password. In a real app, though, you'd likely need to work around this, either by editing the session file and replacing the placeholder text with the real password, or else designing your app to be able to skip password prompts when certain environment variables are populated, and use the environment value instead of prompting.

## How to disable recording when capturing passwords or sensitive data

If your CLI program (or whatever you're building) prompts the user for a password, or token, etc., and you don't want to use the simple `PromptForPasswordOp`, you'll need to disable recording in your own code. 

```typescript
import { InputRecording } from "@axhxrx/op";

InputRecording.prohibit();
try {
  await mySensitiveOp.run(); // do your prompting 
} finally {
  InputRecording.removeProhibition();
}
```

Prohibitions nest safely. Sensitive input still reaches your app normally, but it is omitted from the recorded session.

## Runtime

The aim is to be runtime-agnostic to the degree feasible; Bun and Deno for sure, and hopefully recent versions of Node.js, too.

## License

MIT

## Happenings

### improved 1.x.x versions

Bite the bullet, and fix the underlying design (accepting breaking changes necessitated by this).

The stack-based `OpRunner` is convenient, standardizes the most common `Op` execution model, and reduces how much thinking needs to be done (by human or bot) when composing ops into larger functionality. But, since its introduction, it had tension with the simpler `myOp.run()` (or the static equivalent). Mixing and matching direct invocation of ops with delegation of op execution to `OpRunner` was error-prone, with non-obvious pitfalls.

With 1.0.0, the design was changed. The `OpRunner` class is now more constrained — there should be only one instance, now; we accept a little more funky constraints around `OpRunner` in exchange for unification of the Op execution model. All `Op` instances now execute via _the_ `OpRunner` (no longer "_an_ `OpRunner`"). To make this happen, we extended `OpRunner` in 0.9.3 to be able to run operations "out of band" on a different stack than the main one, and then return control.

However, that made it obvious that really fixing the the problem all the way required a backwards incompatible redesign (hence 1.x). We simplified the outcome type by removing the control flow variants (which were a dumb idea in the first place), and separating `run()` from `execute()` (invocation vs implementation).

The net effect is more simplicity at the point of use, and the elimination of the tension between the two op execution models that didn't work well in tandem.

The second major change is deciding to monkey-patch `console` after all, after explicitly deciding to avoid that originally. In the context of this lib, it makes sense, as it keeps the API much closer to what bots expect when "going with their gut" (coding based on their training data), and patching it enables the valuable record/replay features to still "just work".

- 2026-04-09 🩹 1.0.2 — fix bug where user session replay would echo simulated user input text to the terminal even when the real app would not (e.g. when using `PromptForPassword.op`)

- 2026-04-07 🩹 1.0.1 — fix bug where user input wasn't echoed to the UI when replaying a session with --replay

- 2026-03-31 💥 1.0.0 — introduce new hopefully-better execution model, to make direct op invocation and stack-based invocation stop fighting

### old 0.x.x versions

- 2026-03-25 📦 0.9.3 — improve package metadata and remove superfluous items from built package

- 2026-03-25 📦 0.9.2 — improve docs and publishing automation

- 2026-03-25 🍼 0.9.1 — initial public release (although this is a rewrite of a rewrite of a rewrite of a rewrite, so there's hopefully nothing new or novel in here...)
