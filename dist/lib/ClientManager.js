"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const human_readable_ids_1 = require("@alexjamesmalcolm/human-readable-ids");
const debug_1 = __importDefault(require("debug"));
const Client_1 = __importDefault(require("./Client"));
const TunnelAgent_1 = __importDefault(require("./TunnelAgent"));
// Manage sets of clients
//
// A client is a "user session" established to service a remote localtunnel client
class ClientManager {
    constructor(opt = {}) {
        this.opt = Object.assign({ max_tcp_sockets: 10 }, opt);
        // id -> client instance
        this.clients = {};
        // statistics
        this.stats = {
            tunnels: 0,
        };
        this.debug = (0, debug_1.default)("lt:ClientManager");
        // This is totally wrong :facepalm: this needs to be per-client...
        this.graceTimeout = null;
    }
    // create a new tunnel with `id`
    // if the id is already used, a random id is assigned
    // if the tunnel could not be created, throws an error
    newClient(id = "", schema = "http", host = "localhost") {
        return __awaiter(this, void 0, void 0, function* () {
            const clients = this.clients;
            const stats = this.stats;
            // can't ask for id already is use
            if (clients[id]) {
                id = (0, human_readable_ids_1.humanReadableId)();
            }
            const maxSockets = this.opt.max_tcp_sockets;
            const agent = new TunnelAgent_1.default({
                clientId: id,
                maxTcpSockets: 10,
            });
            const client = new Client_1.default({
                id,
                agent,
            });
            // add to clients map immediately
            // avoiding races with other clients requesting same id
            clients[id] = client;
            client.once("close", () => {
                this.removeClient(id);
            });
            // try/catch used here to remove client id
            try {
                const info = yield agent.listen();
                ++stats.tunnels;
                return {
                    id: id,
                    port: info.port,
                    url: `${schema}://${id}.${host}`,
                    max_conn_count: maxSockets,
                };
            }
            catch (err) {
                this.removeClient(id);
                // rethrow error for upstream to handle
                throw err;
            }
        });
    }
    removeClient(id) {
        this.debug("removing client: %s", id);
        const client = this.clients[id];
        if (!client) {
            return;
        }
        --this.stats.tunnels;
        delete this.clients[id];
        client.close();
    }
    hasClient(id) {
        return !!this.clients[id];
    }
    getClient(id) {
        return this.clients[id];
    }
}
exports.default = ClientManager;
