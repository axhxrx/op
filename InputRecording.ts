/**
 Global switch for temporarily suppressing persisted stdin recording.

 This only affects RecordableStdin. If record mode is not active, toggling this flag has no effect.
 */
export class InputRecording
{
  static disabled = false;
}
