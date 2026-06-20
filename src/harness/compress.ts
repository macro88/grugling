// Compression port (ADR-0001). A tool's raw output is compressed before it
// re-enters the model context, so a noisy command can't blow the tiny context
// budget (PRD › user stories 7–8). The interface is deliberately narrow —
// `compress(raw) → summary` — so a smarter backend (e.g. RTK) can replace the
// MVP's deterministic adapter without the Decide loop changing (ADR-0001).
//
// The MVP adapter is deterministic: keep the head and tail, always surface
// error/warning lines from the dropped middle (the lines a human most wants),
// and hard-cap the total characters. The full raw output is preserved
// out-of-context by the loop — compression only shapes what the model sees.

export interface Compressor {
  compress(raw: string): string;
}

export interface CompressorOptions {
  headLines?: number;
  tailLines?: number;
  maxChars?: number;
}

const ERROR_LINE = /(error|fail|warn)/i;

export function createDeterministicCompressor(opts: CompressorOptions = {}): Compressor {
  const headLines = opts.headLines ?? 10;
  const tailLines = opts.tailLines ?? 5;
  const maxChars = opts.maxChars ?? 1000;

  return {
    compress(raw: string): string {
      const lines = raw.split("\n");
      let candidate: string;

      if (lines.length <= headLines + tailLines) {
        candidate = raw;
      } else {
        const head = lines.slice(0, headLines);
        const tail = lines.slice(lines.length - tailLines);
        const middle = lines.slice(headLines, lines.length - tailLines);
        const errors = middle.filter((l) => ERROR_LINE.test(l));
        const omitted = middle.length - errors.length;
        candidate = [
          ...head,
          ...errors,
          ...(omitted > 0 ? [`[… ${omitted} lines omitted …]`] : []),
          ...tail,
        ].join("\n");
      }

      return candidate.length > maxChars ? candidate.slice(0, maxChars - 1) + "…" : candidate;
    },
  };
}
