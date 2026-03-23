import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "../config/env";

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    ...(env.AWS_SESSION_TOKEN.trim() ? { sessionToken: env.AWS_SESSION_TOKEN } : {})
  }
});

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function uploadBufferToS3(params: {
  folder: string;
  fileName: string;
  contentType: string;
  data: Buffer;
}): Promise<{ key: string; bucket: string }> {
  const { folder, fileName, contentType, data } = params;
  const timestamp = Date.now();
  const key = `${folder}/${timestamp}-${sanitizeFileName(fileName)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: env.AWS_S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType
    })
  );

  return {
    key,
    bucket: env.AWS_S3_BUCKET
  };
}

export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: env.AWS_S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}
