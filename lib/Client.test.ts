import assert from "assert"
import http from "http"
import { Duplex, DuplexOptions } from "stream"
import net from "net"

import Client from "./Client"
import TunnelAgent from "./TunnelAgent"

class DummySocket extends Duplex {
  _write(_chunk: unknown, _encoding: unknown, callback: CallableFunction) {
    callback()
  }

  _read(_size: unknown) {
    this.push("HTTP/1.1 304 Not Modified\r\nX-Powered-By: dummy\r\n\r\n\r\n")
    this.push(null)
  }
}

class DummyWebsocket extends Duplex {
  sentHeader: boolean
  constructor(options: DuplexOptions) {
    super(options)
    this.sentHeader = false
  }

  _write(
    chunk: { toString: () => string },
    _encoding: unknown,
    callback: CallableFunction
  ) {
    const str = chunk.toString()
    // if chunk contains `GET / HTTP/1.1` -> queue headers
    // otherwise echo back received data
    if (str.indexOf("GET / HTTP/1.1") === 0) {
      const arr = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
      ]
      this.push(arr.join("\r\n"))
      this.push("\r\n\r\n")
    } else {
      this.push(str)
    }
    callback()
  }

  _read(_size: unknown) {
    // nothing to implement
  }
}

class DummyAgent extends TunnelAgent {
  constructor() {
    super()
  }

  createConnection(_options: unknown, cb: CallableFunction) {
    cb(null, new DummySocket())
  }
}

describe("Client", () => {
  it("should handle request", async () => {
    const agent = new DummyAgent()
    const client = new Client({ agent, id: "foobar" })

    const server = http.createServer((req, res) => {
      client.handleRequest(req, res)
    })

    await new Promise((resolve) => server.listen(resolve))

    const address = server.address() as net.AddressInfo
    const opt = {
      host: "localhost",
      port: address.port,
      path: "/",
    }

    const res = await new Promise<http.IncomingMessage>((resolve) => {
      const req = http.get(opt, (res) => {
        resolve(res)
      })
      req.end()
    })
    assert.equal(res.headers["x-powered-by"], "dummy")
    server.close()
  })

  it("should handle upgrade", async () => {
    // need a websocket server and a socket for it
    class DummyWebsocketAgent extends TunnelAgent {
      constructor() {
        super()
      }

      createConnection(_options: unknown, cb: CallableFunction) {
        cb(null, new DummyWebsocket({}))
      }
    }

    const agent = new DummyWebsocketAgent()
    const client = new Client({ agent, id: "foobar" })

    const server = http.createServer()
    server.on("upgrade", (req, socket, _head: unknown) => {
      client.handleUpgrade(req, socket)
    })

    await new Promise((resolve) => server.listen(resolve))

    const address = server.address() as net.AddressInfo

    const netClient = await new Promise<net.Socket>((resolve) => {
      const newClient = net.createConnection({ port: address.port }, () => {
        resolve(newClient)
      })
    })

    const out = ["GET / HTTP/1.1", "Connection: Upgrade", "Upgrade: websocket"]

    netClient.write(out.join("\r\n") + "\r\n\r\n")

    {
      const data = await new Promise((resolve) => {
        netClient.once("data", (chunk) => {
          resolve(chunk.toString())
        })
      })
      const exp = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
      ]
      assert.equal(exp.join("\r\n") + "\r\n\r\n", data)
    }

    {
      netClient.write("foobar")
      const data = await new Promise((resolve) => {
        netClient.once("data", (chunk) => {
          resolve(chunk.toString())
        })
      })
      assert.equal("foobar", data)
    }

    netClient.destroy()
    server.close()
  })
})
