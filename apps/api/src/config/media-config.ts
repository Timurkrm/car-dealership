export interface MediaConfig {
  maxFileSize: number;
  maxImages: number;
  uploadTtl: number;
  readTtl: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  thumbnailWidth: number;
  mediumWidth: number;
  largeWidth: number;
  quality: number;
  concurrency: number;
}
export function parseMediaConfig(
  env: NodeJS.ProcessEnv,
  issues: string[],
): MediaConfig {
  const value = (key: string, fallback: number, min: number, max: number) => {
    const raw = env[key] ?? String(fallback);
    const result = Number(raw);
    if (
      !/^\d+$/.test(raw) ||
      !Number.isSafeInteger(result) ||
      result < min ||
      result > max
    )
      issues.push(`${key} must be an integer between ${min} and ${max}`);
    return result;
  };
  const config = {
    maxFileSize: value('MEDIA_MAX_FILE_SIZE', 15728640, 1024, 20971520),
    maxImages: value('MEDIA_MAX_IMAGES_PER_LISTING', 25, 1, 30),
    uploadTtl: value('MEDIA_UPLOAD_URL_TTL', 600, 60, 900),
    readTtl: value('MEDIA_READ_URL_TTL', 600, 60, 900),
    maxWidth: value('MEDIA_MAX_WIDTH', 12000, 16, 20000),
    maxHeight: value('MEDIA_MAX_HEIGHT', 12000, 16, 20000),
    maxPixels: value('MEDIA_MAX_PIXELS', 40000000, 256, 60000000),
    thumbnailWidth: value('MEDIA_THUMBNAIL_WIDTH', 320, 16, 640),
    mediumWidth: value('MEDIA_MEDIUM_WIDTH', 960, 16, 1280),
    largeWidth: value('MEDIA_LARGE_WIDTH', 1600, 16, 2400),
    quality: value('MEDIA_OUTPUT_QUALITY', 82, 50, 95),
    concurrency: value('MEDIA_WORKER_CONCURRENCY', 2, 1, 4),
  };
  if (
    config.thumbnailWidth > config.mediumWidth ||
    config.mediumWidth > config.largeWidth
  )
    issues.push('Media variant dimensions must increase');
  return config;
}
