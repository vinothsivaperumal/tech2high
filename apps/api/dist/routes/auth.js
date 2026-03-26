"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const audit_1 = require("../services/audit");
const email_1 = require("../services/email");
const client_1 = require("../db/client");
const jwt_1 = require("../utils/jwt");
const password_1 = require("../utils/password");
const optionalTextField = (maxLength) => zod_1.z.string().trim().max(maxLength).optional();
const optionalPhoneField = zod_1.z
    .string()
    .trim()
    .max(30)
    .optional()
    .refine((value) => !value || /^[0-9+()\-\s]{7,20}$/.test(value), {
    message: "Invalid phone number"
});
const registerProfileSchema = zod_1.z.object({
    fullName: zod_1.z.string().trim().min(2).max(120),
    phone: optionalPhoneField,
    city: optionalTextField(120),
    state: optionalTextField(120),
    country: optionalTextField(120),
    institute: optionalTextField(160),
    experienceLevel: optionalTextField(60)
});
const registerSchema = zod_1.z
    .object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    role: zod_1.z.enum(["student", "trainer", "admin"]).default("student")
})
    .merge(registerProfileSchema);
const updateProfileSchema = zod_1.z
    .object({
    email: zod_1.z.string().email().optional(),
    fullName: zod_1.z.string().trim().min(2).max(120).optional(),
    phone: optionalPhoneField,
    city: optionalTextField(120),
    state: optionalTextField(120),
    country: optionalTextField(120),
    institute: optionalTextField(160),
    experienceLevel: optionalTextField(60)
})
    .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be updated"
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8)
});
const userSelectFields = `
  id,
  email,
  role,
  full_name,
  phone,
  city,
  state,
  country,
  institute,
  experience_level,
  created_at,
  updated_at
`;
function normalizeOptionalString(value) {
    if (value === undefined) {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}
function mapUser(row) {
    return {
        id: row.id,
        email: row.email,
        role: row.role,
        fullName: row.full_name,
        phone: row.phone,
        city: row.city,
        state: row.state,
        country: row.country,
        institute: row.institute,
        experienceLevel: row.experience_level,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}
exports.authRouter = (0, express_1.Router)();
exports.authRouter.post("/register", async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const { email, password, role, fullName, phone, city, state, country, institute, experienceLevel } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const existing = await client_1.pool.query("SELECT id FROM users WHERE email = $1", [normalizedEmail]);
    if (existing.rowCount) {
        res.status(409).json({ message: "Email already exists" });
        return;
    }
    const passwordHash = await (0, password_1.hashPassword)(password);
    const inserted = await client_1.pool.query(`
    INSERT INTO users (
      email,
      password_hash,
      role,
      full_name,
      phone,
      city,
      state,
      country,
      institute,
      experience_level
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING ${userSelectFields}
    `, [
        normalizedEmail,
        passwordHash,
        role,
        fullName.trim(),
        normalizeOptionalString(phone),
        normalizeOptionalString(city),
        normalizeOptionalString(state),
        normalizeOptionalString(country),
        normalizeOptionalString(institute),
        normalizeOptionalString(experienceLevel)
    ]);
    const user = mapUser(inserted.rows[0]);
    const token = (0, jwt_1.signAuthToken)({
        id: user.id,
        email: user.email,
        role: user.role
    });
    await (0, audit_1.createAuditLog)({
        actorUserId: user.id,
        action: "auth.register",
        entityType: "user",
        entityId: user.id,
        metadata: { role: user.role }
    });
    try {
        const emailResult = await (0, email_1.sendRegistrationEmail)({
            to: user.email,
            fullName: user.fullName,
            role: user.role
        });
        if (!emailResult.sent) {
            console.info(`Registration email skipped for ${user.email}`);
        }
    }
    catch (emailError) {
        console.error("Failed to send registration email", emailError);
    }
    res.status(201).json({ user, token });
});
exports.authRouter.post("/login", async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const result = await client_1.pool.query(`
    SELECT password_hash, ${userSelectFields}
    FROM users
    WHERE email = $1
    `, [normalizedEmail]);
    if (!result.rowCount) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
    }
    const user = result.rows[0];
    const validPassword = await (0, password_1.verifyPassword)(password, user.password_hash);
    if (!validPassword) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
    }
    const token = (0, jwt_1.signAuthToken)({
        id: user.id,
        email: user.email,
        role: user.role
    });
    await (0, audit_1.createAuditLog)({
        actorUserId: user.id,
        action: "auth.login",
        entityType: "user",
        entityId: user.id,
        metadata: {}
    });
    res.json({
        token,
        user: mapUser(user)
    });
});
exports.authRouter.get("/me", auth_1.requireAuth, async (req, res) => {
    const result = await client_1.pool.query(`
    SELECT ${userSelectFields}
    FROM users
    WHERE id = $1
    `, [req.user.id]);
    if (!result.rowCount) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    res.json({ user: mapUser(result.rows[0]) });
});
exports.authRouter.patch("/me", auth_1.requireAuth, async (req, res) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
        return;
    }
    const updates = [];
    const values = [];
    const changedFields = [];
    const pushUpdate = (column, value, field) => {
        updates.push(`${column} = $${values.length + 1}`);
        values.push(value);
        changedFields.push(field);
    };
    if (parsed.data.email !== undefined) {
        const normalizedEmail = parsed.data.email.toLowerCase();
        const existing = await client_1.pool.query("SELECT id FROM users WHERE email = $1 AND id <> $2", [
            normalizedEmail,
            req.user.id
        ]);
        if (existing.rowCount) {
            res.status(409).json({ message: "Email already exists" });
            return;
        }
        pushUpdate("email", normalizedEmail, "email");
    }
    if (parsed.data.fullName !== undefined) {
        pushUpdate("full_name", parsed.data.fullName.trim(), "fullName");
    }
    if (parsed.data.phone !== undefined) {
        pushUpdate("phone", normalizeOptionalString(parsed.data.phone), "phone");
    }
    if (parsed.data.city !== undefined) {
        pushUpdate("city", normalizeOptionalString(parsed.data.city), "city");
    }
    if (parsed.data.state !== undefined) {
        pushUpdate("state", normalizeOptionalString(parsed.data.state), "state");
    }
    if (parsed.data.country !== undefined) {
        pushUpdate("country", normalizeOptionalString(parsed.data.country), "country");
    }
    if (parsed.data.institute !== undefined) {
        pushUpdate("institute", normalizeOptionalString(parsed.data.institute), "institute");
    }
    if (parsed.data.experienceLevel !== undefined) {
        pushUpdate("experience_level", normalizeOptionalString(parsed.data.experienceLevel), "experienceLevel");
    }
    if (!updates.length) {
        res.status(400).json({ message: "No fields to update" });
        return;
    }
    updates.push("updated_at = NOW()");
    values.push(req.user.id);
    const updated = await client_1.pool.query(`
    UPDATE users
    SET ${updates.join(", ")}
    WHERE id = $${values.length}
    RETURNING ${userSelectFields}
    `, values);
    if (!updated.rowCount) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    const user = mapUser(updated.rows[0]);
    const token = (0, jwt_1.signAuthToken)({
        id: user.id,
        email: user.email,
        role: user.role
    });
    await (0, audit_1.createAuditLog)({
        actorUserId: req.user.id,
        action: "auth.profile.update",
        entityType: "user",
        entityId: req.user.id,
        metadata: {
            fields: changedFields
        }
    });
    res.json({ user, token });
});
