/** Minimal Google Cloud Storage bucket operations used by the hosting adapter. */
export interface GcsBucketOperations
{
  /** Create the bucket when it does not already exist. */
  ensureBucket(bucketName: string): Promise<void>;
}
