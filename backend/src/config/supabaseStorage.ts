import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabaseStorageClient = createClient(env.supabaseStorage.url, env.supabaseStorage.serviceRoleKey, {
  auth: { persistSession: false },
});

const publicBucket = env.supabaseStorage.bucket;
const kycBucket = env.supabaseStorage.kycBucket;

const KYC_SIGNED_URL_EXPIRY_SECONDS = 10 * 60;

async function ensureBucketExists(bucket: string, isPublic: boolean) {
  const { data: buckets, error: listError } = await supabaseStorageClient.storage.listBuckets();
  if (listError) {
    throw new Error(`Failed to list Supabase Storage buckets: ${listError.message}`);
  }

  if (buckets.some((b) => b.name === bucket)) {
    return;
  }

  const { error: createError } = await supabaseStorageClient.storage.createBucket(bucket, {
    public: isPublic,
  });
  if (createError) {
    throw new Error(`Failed to create Supabase Storage bucket "${bucket}": ${createError.message}`);
  }
}

export async function ensureUploadBucketsExist() {
  await ensureBucketExists(publicBucket, true);
  await ensureBucketExists(kycBucket, false);
}

export async function uploadFileToStorage(path: string, buffer: Buffer, contentType: string) {
  const { error } = await supabaseStorageClient.storage.from(publicBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Failed to upload file to Supabase Storage: ${error.message}`);
  }

  const { data } = supabaseStorageClient.storage.from(publicBucket).getPublicUrl(path);
  return data.publicUrl;
}

export async function uploadKycFileToStorage(path: string, buffer: Buffer, contentType: string) {
  const { error } = await supabaseStorageClient.storage.from(kycBucket).upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) {
    throw new Error(`Failed to upload KYC file to Supabase Storage: ${error.message}`);
  }

  return path;
}

export async function getSignedKycDocumentUrl(path: string) {
  const { data, error } = await supabaseStorageClient.storage
    .from(kycBucket)
    .createSignedUrl(path, KYC_SIGNED_URL_EXPIRY_SECONDS);
  if (error) {
    throw new Error(`Failed to create signed URL for KYC document: ${error.message}`);
  }

  return { url: data.signedUrl, expiresInSeconds: KYC_SIGNED_URL_EXPIRY_SECONDS };
}
