"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatwootPool = void 0;
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const prisma = new client_1.PrismaClient();
// Conexão com o banco de dados do Chatwoot para queries diretas
const chatwootDbUrl = process.env.CHATWOOT_DATABASE_URL || '';
exports.chatwootPool = chatwootDbUrl
    ? new pg_1.Pool({
        connectionString: chatwootDbUrl,
    })
    : null;
exports.default = prisma;
//# sourceMappingURL=database.js.map