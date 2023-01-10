import http from "node:http"
import Debug from "debug"
import pump from "pump"
import EventEmitter from "events"
import TunnelAgent from "./TunnelAgent"
import { Duplex } from "node:stream"
import { Socket } from "net"

type Options = {
  id: string
  agent: TunnelAgent
}

// A client encapsulates req/res handling using an agent
//
// If an agent is destroyed, the request handling will error
// The caller is responsible for handling a failed request
class Client extends EventEmitter {
  agent: TunnelAgent
  id: string
  debug: Debug.Debugger
  graceTimeout: NodeJS.Timeout
  constructor(options: Options) {
    super()

    const agent = (this.agent = options.agent)
    const id = (this.id = options.id)

    this.debug = Debug(`lt:Client[${this.id}]`)

    // client is given a grace period in which they can connect before they are _removed_
    this.graceTimeout = setTimeout(() => {
      this.close()
    }, 1000).unref()

    agent.on("online", () => {
      this.debug("client online %s", id)
      clearTimeout(this.graceTimeout)
    })

    agent.on("offline", () => {
      this.debug("client offline %s", id)

      // if there was a previous timeout set, we don't want to double trigger
      clearTimeout(this.graceTimeout)

      // client is given a grace period in which they can re-connect before they are _removed_
      this.graceTimeout = setTimeout(() => {
        this.close()
      }, 1000).unref()
    })

    // TODO(roman): an agent error removes the client, the user needs to re-connect?
    // how does a user realize they need to re-connect vs some random client being assigned same port?
    agent.once("error", (_err) => {
      this.close()
    })
  }

  stats() {
    return this.agent.stats()
  }

  close() {
    clearTimeout(this.graceTimeout)
    this.agent.destroy()
    this.emit("close")
  }

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    this.debug("> %s", req.url)
    const opt = {
      path: req.url,
      agent: this.agent,
      method: req.method,
      headers: req.headers,
    }

    const clientReq = http.request(opt, (clientRes) => {
      this.debug("< %s", req.url)
      // write response code and headers
      res.writeHead(clientRes.statusCode!, clientRes.headers)

      // using pump is deliberate - see the pump docs for why
      pump(clientRes, res)
    })

    // this can happen when underlying agent produces an error
    // in our case we 504 gateway error this?
    // if we have already sent headers?
    clientReq.once("error", (_err) => {
      // TODO(roman): if headers not sent - respond with gateway unavailable
    })

    // using pump is deliberate - see the pump docs for why
    pump(req, clientReq)
  }

  handleUpgrade(req: http.IncomingMessage, socket: Duplex) {
    this.debug("> [up] %s", req.url)
    socket.once("error", (err: { code: string }) => {
      // These client side errors can happen if the client dies while we are reading
      // We don't need to surface these in our logs.
      if (err.code == "ECONNRESET" || err.code == "ETIMEDOUT") {
        return
      }
      console.error(err)
    })

    this.agent.createConnection(
      {},
      (err: Error | null, conn: Socket | null) => {
        this.debug("< [up] %s", req.url)
        // any errors getting a connection mean we cannot service this request
        if (err) {
          socket.end()
          return
        }
        if (!conn) {
          throw new Error("assert conn !== null")
        }

        // socket met have disconnected while we waiting for a socket
        if (!socket.readable || !socket.writable) {
          conn.destroy()
          socket.end()
          return
        }

        // websocket requests are special in that we simply re-create the header info
        // then directly pipe the socket data
        // avoids having to rebuild the request and handle upgrades via the http client
        const arr = [`${req.method} ${req.url} HTTP/${req.httpVersion}`]
        for (let i = 0; i < req.rawHeaders.length - 1; i += 2) {
          arr.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`)
        }

        arr.push("")
        arr.push("")

        // using pump is deliberate - see the pump docs for why
        pump(conn, socket)
        pump(socket, conn)
        conn.write(arr.join("\r\n"))
      }
    )
  }
}

export default Client
