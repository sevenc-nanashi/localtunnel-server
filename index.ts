import "localenv"
import optimist from "optimist"

import log4js from "log4js"
import Debug from "debug"
import { AddressInfo } from "net"

import CreateServer from "./server"

const debug = Debug("localtunnel")
const log = log4js.getLogger("localtunnel")

const argv = optimist
  .usage("Usage: $0 --port [num]")
  .options("secure", {
    default: false,
    describe: "use this flag to indicate proxy over https",
  })
  .options("port", {
    describe: "listen on this port for outside requests",
  })
  .options("address", {
    default: "0.0.0.0",
    describe: "IP address to bind to",
  })
  .options("domain", {
    describe:
      "Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)",
  })
  .options("max-sockets", {
    default: 10,
    describe:
      "maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)",
  }).argv

if (argv.help) {
  optimist.showHelp()
  process.exit()
}

const server = CreateServer({
  max_tcp_sockets: argv["max-sockets"],
  secure: argv.secure,
  domain: argv.domain,
})

server.listen(
  argv.port || parseInt(process.env.PORT!) || 80,
  argv.address,
  () => {
    const address = server.address() as AddressInfo
    debug("server listening on port: %d", address.port)
  }
)

process.on("SIGINT", () => {
  process.exit()
})

process.on("SIGTERM", () => {
  process.exit()
})

process.on("uncaughtException", (err) => {
  log.error(err)
})

process.on("unhandledRejection", (reason, _promise) => {
  log.error(reason)
})
