"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const net_1 = __importDefault(require("net"));
const log4js_1 = __importDefault(require("log4js"));
const debug_1 = __importDefault(require("debug"));
const ts_mixer_1 = require("ts-mixer");
const events_1 = __importDefault(require("events"));
const log = log4js_1.default.getLogger("TunnelAgent");
const DEFAULT_MAX_SOCKETS = 10;
// Implements an http.Agent interface to a pool of tunnel sockets
// A tunnel socket is a connection _from_ a client that will
// service http requests. This agent is usable wherever one can use an http.Agent
class TunnelAgent extends (0, ts_mixer_1.Mixin)(http_1.Agent, events_1.default) {
    constructor(options = {}) {
        super({
            keepAlive: true,
            // only allow keepalive to hold on to one socket
            // this prevents it from holding on to all the sockets so they can be used for upgrades
            maxFreeSockets: 1,
        });
        // sockets we can hand out via createConnection
        this.availableSockets = [];
        // when a createConnection cannot return a socket, it goes into a queue
        // once a socket is available it is handed out to the next callback
        this.waitingCreateConn = [];
        this.debug = (0, debug_1.default)(`lt:TunnelAgent[${options.clientId}]`);
        // track maximum allowed sockets
        this.connectedSockets = 0;
        this.maxTcpSockets = options.maxTcpSockets || DEFAULT_MAX_SOCKETS;
        // new tcp server to service requests for this client
        this.server = net_1.default.createServer();
        // flag to avoid double starts
        this.started = false;
        this.closed = false;
    }
    stats() {
        return {
            connectedSockets: this.connectedSockets,
        };
    }
    listen() {
        const server = this.server;
        if (this.started) {
            throw new Error("already started");
        }
        this.started = true;
        server.on("close", this._onClose.bind(this));
        server.on("connection", this._onConnection.bind(this));
        server.on("error", (err) => {
            // These errors happen from killed connections, we don't worry about them
            if (err.code == "ECONNRESET" || err.code == "ETIMEDOUT") {
                return;
            }
            log.error(err);
        });
        return new Promise((resolve) => {
            server.listen(() => {
                const address = server.address();
                if (address === null || typeof address === "string") {
                    throw new Error("address is null or string");
                }
                const port = address.port;
                this.debug("tcp server listening on port: %d", port);
                resolve({
                    // port for lt client tcp connections
                    port: port,
                });
            });
        });
    }
    _onClose() {
        this.closed = true;
        this.debug("closed tcp socket");
        // flush any waiting connections
        for (const conn of this.waitingCreateConn) {
            conn(new Error("closed"), null);
        }
        this.waitingCreateConn = [];
        this.emit("end");
    }
    // new socket connection from client for tunneling requests to client
    _onConnection(socket) {
        // no more socket connections allowed
        if (this.connectedSockets >= this.maxTcpSockets) {
            this.debug("no more sockets allowed");
            socket.destroy();
            return false;
        }
        socket.once("close", (hadError) => {
            this.debug("closed socket (error: %s)", hadError);
            this.connectedSockets -= 1;
            // remove the socket from available list
            const idx = this.availableSockets.indexOf(socket);
            if (idx >= 0) {
                this.availableSockets.splice(idx, 1);
            }
            this.debug("connected sockets: %s", this.connectedSockets);
            if (this.connectedSockets <= 0) {
                this.debug("all sockets disconnected");
                this.emit("offline");
            }
        });
        // close will be emitted after this
        socket.once("error", (_err) => {
            // we do not log these errors, sessions can drop from clients for many reasons
            // these are not actionable errors for our server
            socket.destroy();
        });
        if (this.connectedSockets === 0) {
            this.emit("online");
        }
        this.connectedSockets += 1;
        const address = socket.address();
        this.debug("new connection from: %s:%s", address.address, address.port);
        // if there are queued callbacks, give this socket now and don't queue into available
        const fn = this.waitingCreateConn.shift();
        if (fn) {
            this.debug("giving socket to queued conn request");
            setTimeout(() => {
                fn(null, socket);
            }, 0);
            return;
        }
        // make socket available for those waiting on sockets
        this.availableSockets.push(socket);
    }
    // fetch a socket from the available socket pool for the agent
    // if no socket is available, queue
    // cb(err, socket)
    createConnection(_options, cb) {
        if (this.closed) {
            cb(new Error("closed"), null);
            return;
        }
        this.debug("create connection");
        // socket is a tcp connection back to the user hosting the site
        const sock = this.availableSockets.shift();
        // no available sockets
        // wait until we have one
        if (!sock) {
            this.waitingCreateConn.push(cb);
            this.debug("waiting connected: %s", this.connectedSockets);
            this.debug("waiting available: %s", this.availableSockets.length);
            return;
        }
        this.debug("socket given");
        cb(null, sock);
    }
    destroy() {
        this.server.close();
        super.destroy();
    }
}
exports.default = TunnelAgent;
