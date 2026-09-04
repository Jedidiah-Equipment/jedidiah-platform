// Transport-level caps stay separate from the UI-message envelope so byte counting has one owner.
export const CHAT_MAX_MESSAGES = 40;
export const CHAT_MAX_PAYLOAD_BYTES = 64 * 1024;

export function getUtf8ByteLength(value: string): number {
  let bytes = 0;

  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;

    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }

  return bytes;
}
