"use strict";
// utils/refreshToken.ts
// Implements refresh token generation and verification for secure session renewal
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signRefreshToken = signRefreshToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// 7 days expiry for refresh tokens
function signRefreshToken(payload) {
    return jsonwebtoken_1.default.sign({ ...payload, type: "refresh" }, env_1.env.JWT_SECRET, { expiresIn: "7d" });
}
function verifyRefreshToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (typeof decoded !== "object" || !decoded || decoded.type !== "refresh") {
        throw new Error("Invalid refresh token payload.");
    }
    return decoded;
}
