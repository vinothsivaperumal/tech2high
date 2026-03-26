"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBufferToS3 = uploadBufferToS3;
exports.getPresignedUrl = getPresignedUrl;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const env_1 = require("../config/env");
const s3 = new client_s3_1.S3Client({
    region: env_1.env.AWS_REGION,
    credentials: {
        accessKeyId: env_1.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: env_1.env.AWS_SECRET_ACCESS_KEY,
        ...(env_1.env.AWS_SESSION_TOKEN.trim() ? { sessionToken: env_1.env.AWS_SESSION_TOKEN } : {})
    }
});
function sanitizeFileName(fileName) {
    return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}
async function uploadBufferToS3(params) {
    const { folder, fileName, contentType, data } = params;
    const timestamp = Date.now();
    const key = `${folder}/${timestamp}-${sanitizeFileName(fileName)}`;
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: env_1.env.AWS_S3_BUCKET,
        Key: key,
        Body: data,
        ContentType: contentType
    }));
    return {
        key,
        bucket: env_1.env.AWS_S3_BUCKET
    };
}
async function getPresignedUrl(key, expiresIn = 3600) {
    const command = new client_s3_1.GetObjectCommand({
        Bucket: env_1.env.AWS_S3_BUCKET,
        Key: key,
    });
    return (0, s3_request_presigner_1.getSignedUrl)(s3, command, { expiresIn });
}
