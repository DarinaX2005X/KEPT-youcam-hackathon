import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask, getCredit, getTask, uploadFile, YouCamError, YOUCAM_BASE } from '@/server/youcam/client';

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('YouCam client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv('YOUCAM_API_KEY', 'test-key');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('uploads: registers the file, then PUTs bytes with the presigned headers', async () => {
    fetchMock
      .mockResolvedValueOnce(
        ok({
          status: 200,
          data: {
            files: [
              {
                file_id: 'file-123',
                requests: [{ url: 'https://s3.example/put', method: 'PUT', headers: { 'Content-Type': 'image/jpeg', 'Content-Length': 3 } }],
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const id = await uploadFile(Buffer.from([1, 2, 3]), 'image/jpeg', 'face.jpg');
    expect(id).toBe('file-123');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1, init1] = fetchMock.mock.calls[0];
    expect(url1).toBe(`${YOUCAM_BASE}/s2s/v2.0/file`);
    expect(init1?.method).toBe('POST');
    expect((init1?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init1?.body as string)).toEqual({
      files: [{ content_type: 'image/jpeg', file_name: 'face.jpg', file_size: 3 }],
    });

    const [url2, init2] = fetchMock.mock.calls[1];
    expect(url2).toBe('https://s3.example/put');
    expect(init2?.method).toBe('PUT');
    expect(init2?.headers).toEqual({ 'Content-Type': 'image/jpeg', 'Content-Length': '3' });
    expect((init2?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init2?.signal).toBeInstanceOf(AbortSignal);
  });

  it('fails the upload when the PUT is rejected', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ status: 200, data: { files: [{ file_id: 'f', requests: [{ url: 'https://s3.example/put' }] }] } }))
      .mockResolvedValueOnce(new Response('denied', { status: 403 }));
    await expect(uploadFile(Buffer.from([1]), 'image/png', 'x.png')).rejects.toMatchObject({ code: 'UploadFailed', httpStatus: 403 });
  });

  it('parses CreditInsufficiency into YouCamError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 400, error: 'Insufficient unit', error_code: 'CreditInsufficiency' }, 400));
    const err = await createTask('skin-analysis', { src_file_id: 'f' }).catch((e) => e);
    expect(err).toBeInstanceOf(YouCamError);
    expect(err).toMatchObject({ httpStatus: 400, code: 'CreditInsufficiency', message: 'Insufficient unit' });
  });

  it('parses InvalidParameters into YouCamError', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 400, error: 'cannot mix HD and SD dst_actions', error_code: 'InvalidParameters' }, 400));
    await expect(createTask('skin-analysis', {})).rejects.toMatchObject({ httpStatus: 400, code: 'InvalidParameters' });
  });

  it('treats a 200 HTTP answer with a non-200 status field as an error', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 401, error: 'Invalid API key' }));
    await expect(getCredit()).rejects.toMatchObject({ httpStatus: 401, code: 'HTTP401' });
  });

  it('turns a timeout into YouCamError Timeout', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('timed out'), { name: 'TimeoutError' }));
    await expect(getTask('skin-analysis', 't1')).rejects.toMatchObject({ code: 'Timeout', httpStatus: 504 });
  });

  it('creates a task and reads its id', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 200, data: { task_id: 'task-9' } }));
    await expect(createTask('skin-simulation', { src_file_id: 'f', acne: 0.6 })).resolves.toBe('task-9');
    expect(fetchMock.mock.calls[0][0]).toBe(`${YOUCAM_BASE}/s2s/v2.0/task/skin-simulation`);
  });

  it('polls a task by path and id', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 200, data: { task_status: 'running' } }));
    await expect(getTask('aging', 'a/b+c')).resolves.toEqual({ task_status: 'running' });
    expect(fetchMock.mock.calls[0][0]).toBe(`${YOUCAM_BASE}/s2s/v2.0/task/aging/a%2Fb%2Bc`);
  });

  it('sums credit amounts', async () => {
    fetchMock.mockResolvedValueOnce(ok({ status: 200, results: [{ amount: 120 }, { amount: 35 }] }));
    await expect(getCredit()).resolves.toBe(155);
    expect(fetchMock.mock.calls[0][0]).toBe(`${YOUCAM_BASE}/s2s/v1.0/client/credit`);
  });

  it('refuses to call without a key', async () => {
    vi.stubEnv('YOUCAM_API_KEY', '');
    await expect(getCredit()).rejects.toMatchObject({ code: 'NoKey' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
