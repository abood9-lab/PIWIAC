import { v2 as cloudinary } from "cloudinary";
import { logger } from "./logger";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function uploadBase64(
  data: string,
  mimeType: string,
  folder: string = "pixlr"
): Promise<{ url: string; publicId: string; resourceType: string }> {
  const resourceType = mimeType.startsWith("video")
    ? "video"
    : mimeType.startsWith("audio")
    ? "video"
    : mimeType.startsWith("image")
    ? "image"
    : "raw";

  const dataUri = data.startsWith("data:")
    ? data
    : `data:${mimeType};base64,${data}`;

  try {
    const result = await cloudinary.uploader.upload(dataUri, {
      folder,
      resource_type: resourceType as "video" | "image" | "raw" | "auto",
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error
      ? err.message
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as Record<string, unknown>).message)
        : JSON.stringify(err);
    logger.error({ err, folder, mimeType }, `Cloudinary upload failed: ${msg}`);
    throw new Error(`Cloudinary upload failed: ${msg}`);
  }
}
