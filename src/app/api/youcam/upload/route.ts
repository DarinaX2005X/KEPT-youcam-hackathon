import { uploadFile } from '@/server/youcam/client';
import { fail, json, upstreamFailure } from '@/server/youcam/http';
import { hasDailyRoom, LIMIT_MESSAGE } from '@/server/youcam/quota';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

// multipart/form-data with `file` (jpeg/png, ≤ 4 MB) → { fileId }
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail(400, 'bad_image', 'Send the photo as form data in the "file" field');
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') return fail(400, 'bad_image', 'Add a photo to upload');
  const ext = TYPES[file.type];
  if (!ext) return fail(400, 'bad_image', 'Use a JPEG or PNG photo');
  if (file.size === 0) return fail(400, 'bad_image', 'This photo is empty');
  if (file.size > MAX_BYTES) return fail(400, 'bad_image', 'This photo is larger than 4 MB. Use a smaller one');

  if (!hasDailyRoom()) return fail(429, 'limit', LIMIT_MESSAGE);

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const fileId = await uploadFile(buf, file.type, `kept-${Date.now()}.${ext}`);
    return json({ fileId });
  } catch (err) {
    return upstreamFailure(err);
  }
}
