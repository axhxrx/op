/*
 Globally exposes the control to disable input recording, so that e.g. password prompts can prevent the `--record` mode from capturing sensitive input.
 */
export class InputRecording
{
  private static prohibitionCount = 0;

  /**
   Returns true when at least one caller has prohibited persisted input recording, and that prohibition is still active.
   */
  static get disabled(): boolean
  {
    return this.prohibitionCount > 0;
  }

  /**
   Adds a prohibition against persisted input recording.

   Prohibitions nest, so callers do not need to snapshot the previous state. Each call to `prohibit()` must eventually be paired with `removeProhibition()`.
   */
  static prohibit(): void
  {
    this.prohibitionCount += 1;
  }

  /**
   Removes one previously-added recording prohibition.
   */
  static removeProhibition(): void
  {
    if (this.prohibitionCount === 0)
    {
      throw new Error('[InputRecording] Cannot remove a prohibition when none exist');
    }

    this.prohibitionCount -= 1;
  }
}
