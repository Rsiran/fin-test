"use node";

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

function getR2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function deleteR2Object(client: S3Client, key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) return;
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.warn(`Cleanup: failed to delete R2 object ${key}:`, error);
  }
}

export const cleanupStaleDocuments = internalAction({
  args: {},
  handler: async (ctx) => {
    const staleDocs = await ctx.runQuery(internal.cleanup.getStaleDocuments);

    if (staleDocs.length === 0) {
      console.log("Cleanup: no stale documents found");
      return;
    }

    const r2Client = getR2Client();
    let deleted = 0;
    let failed = 0;

    for (const doc of staleDocs) {
      try {
        // Delete R2 object if present
        if (doc.r2Key && r2Client) {
          await deleteR2Object(r2Client, doc.r2Key);
        }

        // Cascade delete from database
        await ctx.runMutation(internal.cleanup.deleteStaleDocument, {
          id: doc._id,
        });

        deleted++;
      } catch (error) {
        failed++;
        console.error(`Cleanup: failed to delete document ${doc._id}:`, error);
      }
    }

    console.log(
      `Cleanup: found ${staleDocs.length}, deleted ${deleted}, failed ${failed}`
    );
  },
});
