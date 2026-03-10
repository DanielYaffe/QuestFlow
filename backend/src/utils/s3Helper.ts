import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import { config } from '../config/config';

const s3Client = new S3Client({
  region: config.AWS_REGION,
  ...(config.MINIO_ENDPOINT ? { endpoint: config.MINIO_ENDPOINT } : {}),
  credentials: {
    accessKeyId:     config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
  forcePathStyle: Boolean(config.MINIO_ENDPOINT),
});

const BUCKET_NAME = config.AWS_S3_BUCKET;

export const uploadBufferToS3 = async (
  buffer: Buffer,
  mimeType: string,
  folder: string,
  bucketName?: string,
  customFileName?: string,
): Promise<string> => {
  const bucket = bucketName || BUCKET_NAME;
  const ext = mimeType.split('/')[1] ?? 'bin';
  const fileName = `${folder}/${customFileName ?? crypto.randomUUID()}.${ext}`;

  const command = new PutObjectCommand({
    Bucket:      bucket,
    Key:         fileName,
    Body:        buffer,
    ContentType: mimeType,
  });

  await s3Client.send(command);

  return fileName; // return the key, not a URL — use getPresignedUrl to access
};

export const deleteFileFromS3 = async (
  filePath: string,
  bucketName?: string,
): Promise<void> => {
  const bucket = bucketName || BUCKET_NAME;

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key:    filePath,
  });

  await s3Client.send(command);
};

export const getPresignedUrl = async (
  filePath: string,
  bucketName?: string,
  expiresIn: number = 3600,
): Promise<string> => {
  const bucket = bucketName || BUCKET_NAME;

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key:    filePath,
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return presignedUrl;
};

export const getS3FileUrls = async (
  bucketName: string,
  folder: string,
  expiresIn: number = 3600,
): Promise<string[]> => {
  const bucket = bucketName || BUCKET_NAME;

  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: folder,
  });

  const response = await s3Client.send(command);

  if (!response.Contents || response.Contents.length === 0) {
    return [];
  }

  const presignedUrlPromises = response.Contents.map(async (file) => {
    if (!file.Key) return null;
    return await getPresignedUrl(file.Key, bucket, expiresIn);
  });

  const presignedUrls = await Promise.all(presignedUrlPromises);

  return presignedUrls.filter((url): url is string => url !== null);
};
