import { getSupabase } from "../db/client";

/**
 * Platform-neutral upload payload. The web app converts a DOM File to bytes
 * (`await file.arrayBuffer()`); the RN app reads the captured photo URI into
 * bytes. Core never references the DOM `File` type so it stays RN-safe.
 */
export interface UploadableFile {
  body: ArrayBuffer | Uint8Array;
  fileName: string;
  contentType: string;
}

const BUCKET = "prescriptions";

export async function uploadPrescriptionPhoto(
  visitId: string,
  file: UploadableFile,
): Promise<string> {
  const ext = file.fileName.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${visitId}/${Date.now()}.${ext}`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, file.body, {
      contentType: file.contentType || "image/jpeg",
    });
  if (error) throw error;
  const { data } = getSupabase().storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
