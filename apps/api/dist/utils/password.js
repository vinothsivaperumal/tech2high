"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashPassword = hashPassword;
exports.verifyPassword = verifyPassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const SALT_ROUNDS = 12;
async function hashPassword(rawPassword) {
    return bcryptjs_1.default.hash(rawPassword, SALT_ROUNDS);
}
async function verifyPassword(rawPassword, hashedPassword) {
    return bcryptjs_1.default.compare(rawPassword, hashedPassword);
}
