import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const PHOTOS_BUCKET = process.env.PHOTOS_BUCKET_NAME || 'pinboard-tv-photos';

export async function createPresignedPhotoUploadUrl(
  householdId: string,
  contentType: string = 'image/jpeg'
): Promise<{ uploadUrl: string; publicUrl: string; key: string }> {
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const key = `photos/${householdId}/${timestamp}_${randomSuffix}.${extension}`;

  const command = new PutObjectCommand({
    Bucket: PHOTOS_BUCKET,
    Key: key,
    ContentType: contentType,
  });

  // URL valid for 15 minutes
  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  const publicUrl = `https://${PHOTOS_BUCKET}.s3.amazonaws.com/${key}`;

  return { uploadUrl, publicUrl, key };
}
