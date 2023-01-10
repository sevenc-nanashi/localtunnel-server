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
const koa_1 = __importDefault(require("koa"));
const tldjs_1 = __importDefault(require("tldjs"));
const debug_1 = __importDefault(require("debug"));
const http_1 = __importDefault(require("http"));
const human_readable_ids_1 = require("@alexjamesmalcolm/human-readable-ids");
const koa_router_1 = __importDefault(require("koa-router"));
const ClientManager_1 = __importDefault(require("./lib/ClientManager"));
const debug = (0, debug_1.default)("localtunnel:server");
function default_1(opt = {}) {
    const validHosts = opt.domain ? [opt.domain] : undefined;
    const myTldjs = tldjs_1.default.fromUserSettings({ validHosts });
    const landingPage = opt.landing || "https://localtunnel.github.io/www/";
    function getClientIdFromHostname(hostname) {
        return myTldjs.getSubdomain(hostname);
    }
    const manager = new ClientManager_1.default(opt);
    const schema = opt.secure ? "https" : "http";
    const app = new koa_1.default();
    const router = new koa_router_1.default();
    router.get("/api/status", (ctx, _next) => __awaiter(this, void 0, void 0, function* () {
        const stats = manager.stats;
        ctx.body = {
            tunnels: stats.tunnels,
            mem: process.memoryUsage(),
        };
    }));
    router.get("/api/tunnels/:id/status", (ctx, _next) => __awaiter(this, void 0, void 0, function* () {
        const clientId = ctx.params.id;
        const client = manager.getClient(clientId);
        if (!client) {
            ctx.throw(404);
            return;
        }
        const stats = client.stats();
        ctx.body = {
            connected_sockets: stats.connectedSockets,
        };
    }));
    app.use(router.routes());
    app.use(router.allowedMethods());
    // root endpoint
    app.use((ctx, next) => __awaiter(this, void 0, void 0, function* () {
        const path = ctx.request.path;
        // skip anything not on the root path
        if (path !== "/") {
            yield next();
            return;
        }
        const isNewClientRequest = ctx.query["new"] !== undefined;
        if (isNewClientRequest) {
            const reqId = (0, human_readable_ids_1.humanReadableId)();
            debug("making new client with id %s", reqId);
            const info = yield manager.newClient(reqId, schema, ctx.request.host);
            ctx.body = info;
            return;
        }
        // no new client request, send to landing page
        ctx.redirect(landingPage);
    }));
    // anything after the / path is a request for a specific client name
    // This is a backwards compat feature
    app.use((ctx, next) => __awaiter(this, void 0, void 0, function* () {
        const parts = ctx.request.path.split("/");
        // any request with several layers of paths is not allowed
        // rejects /foo/bar
        // allow /foo
        if (parts.length !== 2) {
            yield next();
            return;
        }
        const reqId = parts[1];
        // limit requested hostnames to 63 characters
        if (!/^(?:[a-z0-9][a-z0-9-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/.test(reqId)) {
            const msg = "Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.";
            ctx.status = 403;
            ctx.body = {
                message: msg,
            };
            return;
        }
        debug("making new client with id %s", reqId);
        const info = yield manager.newClient(reqId, schema, ctx.request.host);
        ctx.body = info;
        return;
    }));
    const server = http_1.default.createServer();
    const appCallback = app.callback();
    server.on("request", (req, res) => {
        // without a hostname, we won't know who the request is for
        const hostname = req.headers.host;
        if (!hostname) {
            res.statusCode = 400;
            res.end("Host header is required");
            return;
        }
        const clientId = getClientIdFromHostname(hostname);
        if (!clientId) {
            appCallback(req, res);
            return;
        }
        const client = manager.getClient(clientId);
        if (!client) {
            res.statusCode = 404;
            res.end("404");
            return;
        }
        client.handleRequest(req, res);
    });
    server.on("upgrade", (req, socket, _head) => {
        const hostname = req.headers.host;
        if (!hostname) {
            socket.destroy();
            return;
        }
        const clientId = getClientIdFromHostname(hostname);
        if (!clientId) {
            socket.destroy();
            return;
        }
        const client = manager.getClient(clientId);
        if (!client) {
            socket.destroy();
            return;
        }
        client.handleUpgrade(req, socket);
    });
    return server;
}
exports.default = default_1;
