import { humanReadableId as hri } from "@alexjamesmalcolm/human-readable-ids"
import Debug from "debug"

import Client from "./Client"
import TunnelAgent from "./TunnelAgent"

type Option = {
  max_tcp_sockets: number
}

// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
  opt: Option
  clients: Record<string, Client>
  stats: { tunnels: number }
  debug: Debug.Debugger
  graceTimeout: null

  constructor(opt: Partial<Option> = {}) {
    this.opt = {
      max_tcp_sockets: 10,
      ...opt,
    }

    // id -> client instance
    this.clients = {}

    // statistics
    this.stats = {
      tunnels: 0,
    }

    this.debug = Debug("lt:ClientManager")

    // This is totally wrong :facepalm: this needs to be per-client...
    this.graceTimeout = null
  }

  // create a new tunnel with `id`
  // if the id is already used, a random id is assigned
  // if the tunnel could not be created, throws an error
  async newClient(id = "", schema = "http", host = "localhost") {
    const clients = this.clients
    const stats = this.stats

    // can't ask for id already is use
    if (clients[id]) {
      id = hri()
    }

    const maxSockets = this.opt.max_tcp_sockets
    const agent = new TunnelAgent({
      clientId: id,
      maxTcpSockets: 10,
    })

    const client = new Client({
      id,
      agent,
    })

    // add to clients map immediately
    // avoiding races with other clients requesting same id
    clients[id] = client

    client.once("close", () => {
      this.removeClient(id)
    })

    // try/catch used here to remove client id
    try {
      const info = await agent.listen()
      ++stats.tunnels
      return {
        id: id,
        port: info.port,
        url: `${schema}://${id}.${host}`,
        max_conn_count: maxSockets,
      }
    } catch (err) {
      this.removeClient(id)
      // rethrow error for upstream to handle
      throw err
    }
  }

  removeClient(id: string) {
    this.debug("removing client: %s", id)
    const client = this.clients[id]
    if (!client) {
      return
    }
    --this.stats.tunnels
    delete this.clients[id]
    client.close()
  }

  hasClient(id: string) {
    return !!this.clients[id]
  }

  getClient(id: string) {
    return this.clients[id]
  }
}

export default ClientManager
