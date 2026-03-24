import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME!;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Generate a presigned PUT URL for direct browser upload.
 * Includes Content-Length condition to enforce file size server-side.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentLength: number
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    ContentType: "application/pdf",
    ContentLength: contentLength,
  });
  return getSignedUrl(s3, command, { expiresIn: 900 }); // 15 minutes
}

/**
 * Stream an object from R2 directly to a file on disk.
 * Avoids buffering large PDFs in Node.js memory.
 */
export async function downloadToFile(
  key: string,
  destPath: string
): Promise<void> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });
  const response = await s3.send(command);
  if (!response.Body) {
    throw new Error(`R2 object not found: ${key}`);
  }
  const body = response.Body;
  const nodeStream =
    body instanceof Readable
      ? body
      : Readable.fromWeb(body as unknown as import("stream/web").ReadableStream);
  const fileStream = createWriteStream(destPath);
  await pipeline(nodeStream, fileStream);
}

/**
 * Delete an object from R2. Non-throwing — logs errors but does not fail.
 * Lifecycle rules handle cleanup if this fails.
 */
export async function deleteObject(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });
    await s3.send(command);
  } catch (error) {
    console.warn(`Failed to delete R2 object ${key}:`, error);
  }
}
