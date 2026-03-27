"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAuthToken = signAuthToken;
exports.verifyAuthToken = verifyAuthToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
// Access token: 1 hour expiry (security best practice)
function signAuthToken(payload) {
    return jsonwebtoken_1.default.sign(payload, env_1.env.JWT_SECRET, { expiresIn: "1h" });
}
function verifyAuthToken(token) {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.JWT_SECRET);
    if (typeof decoded !== "object" || !decoded) {
        throw new Error("Invalid auth token payload.");
    }
    return {
        id: String(decoded.id),
        email: String(decoded.email),
        role: decoded.role
    };
}
