import {Writable, Readable} from 'stream'
import * as rpc from 'vscode-jsonrpc/node'

/**
 * Creates a sample MessageConnection instance bound to no-op read/write streams.
 * @returns A sample MessageConnection instance. Tests may stub methods on this instance as needed.
 */
export function createSampleMessageConnection(): rpc.MessageConnection {
  const noopReadStream = new Readable({read(size) {}})
  const noopWriteStream = new Writable({
    write(chunk, encoding, callback) {
      callback()
    },
  })
  return rpc.createMessageConnection(
    new rpc.StreamMessageReader(noopReadStream),
    new rpc.StreamMessageWriter(noopWriteStream)
  )
}
