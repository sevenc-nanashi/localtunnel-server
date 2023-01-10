"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("localenv");
const optimist_1 = __importDefault(require("optimist"));
const log4js_1 = __importDefault(require("log4js"));
const debug_1 = __importDefault(require("debug"));
const server_1 = __importDefault(require("./server"));
const debug = (0, debug_1.default)("localtunnel");
const log = log4js_1.default.getLogger("localtunnel");
const argv = optimist_1.default
    .usage("Usage: $0 --port [num]")
    .options("secure", {
    default: false,
    describe: "use this flag to indicate proxy over https",
})
    .options("port", {
    default: "80",
    describe: "listen on this port for outside requests",
})
    .options("address", {
    default: "0.0.0.0",
    describe: "IP address to bind to",
})
    .options("domain", {
    describe: "Specify the base domain name. This is optional if hosting localtunnel from a regular example.com domain. This is required if hosting a localtunnel server from a subdomain (i.e. lt.example.dom where clients will be client-app.lt.example.come)",
})
    .options("max-sockets", {
    default: 10,
    describe: "maximum number of tcp sockets each client is allowed to establish at one time (the tunnels)",
}).argv;
if (argv.help) {
    optimist_1.default.showHelp();
    process.exit();
}
const server = (0, server_1.default)({
    max_tcp_sockets: argv["max-sockets"],
    secure: argv.secure,
    domain: argv.domain,
});
server.listen(argv.port, argv.address, () => {
    const address = server.address();
    debug("server listening on port: %d", address.port);
});
process.on("SIGINT", () => {
    process.exit();
});
process.on("SIGTERM", () => {
    process.exit();
});
process.on("uncaughtException", (err) => {
    log.error(err);
});
process.on("unhandledRejection", (reason, _promise) => {
    log.error(reason);
});
// vim: ft=typescript
