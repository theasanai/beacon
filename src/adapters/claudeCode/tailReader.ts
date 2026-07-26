import * as fs from 'node:fs'

// The first historical read of a large transcript doesn't pull the whole file: we read a limited
// tail (~256 KB) and align to the first newline, discarding the partial first line.
const FIRST_TAIL_BYTES = 262_144

export class TailReader {
  private offset = 0
  private partial = ''
  private started = false

  constructor(private readonly file: string) {}

  async readNew(): Promise<string[]> {
    let size: number
    try {
      size = (await fs.promises.stat(this.file)).size
    } catch {
      return []
    }
    if (size < this.offset) { // rotation/truncation
      this.offset = 0
      this.partial = ''
    }
    if (size === this.offset) return []

    // Only on the very first read of a file from offset 0 do we cap the tail.
    let dropLeadingPartial = false
    if (!this.started && this.offset === 0 && size > FIRST_TAIL_BYTES) {
      this.offset = size - FIRST_TAIL_BYTES
      dropLeadingPartial = true
    }
    this.started = true

    let chunk: string
    try {
      chunk = await new Promise<string>((resolve, reject) => {
        const parts: Buffer[] = []
        fs.createReadStream(this.file, { start: this.offset, end: size - 1 })
          .on('data', (d) => parts.push(d as Buffer))
          .on('end', () => resolve(Buffer.concat(parts).toString('utf8')))
          .on('error', reject)
      })
    } catch {
      return [] // read failed — don't advance the offset, we'll catch up on the next poll
    }
    this.offset = size

    const pieces = (this.partial + chunk).split('\n')
    this.partial = pieces.pop() ?? ''
    if (dropLeadingPartial) pieces.shift() // partial line before the first '\n' — not a complete record
    return pieces.filter((l) => l.trim().length > 0)
  }
}
