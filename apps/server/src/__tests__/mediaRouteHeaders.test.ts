import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { mediaStorage } from '../services/mediaStorage.js';

describe('Media Streaming Route & Headers Test Suite', () => {
  beforeAll(async () => {
    mediaStorage.ensureDemoMedia();
  });

  it('serves 206 Partial Content with byte ranges and correct headers', async () => {
    const res = await request(app)
      .get('/media/demo/sample_video.mp4')
      .set('Range', 'bytes=0-100')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toMatch(/^bytes 0-100\/\d+$/);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['content-length']).toBe('101');
  });

  it('serves 200 with full content and CORS headers when no Range header is sent', async () => {
    const res = await request(app)
      .get('/media/demo/sample_video.mp4')
      .set('Origin', 'http://localhost:5173');

    expect(res.status).toBe(200);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });

  it('handles OPTIONS preflight with CORS headers for media streaming', async () => {
    const res = await request(app)
      .options('/media/demo/sample_video.mp4')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-expose-headers']).toContain('Content-Range');
  });

  it('returns 416 Requested Range Not Satisfiable for out of bounds ranges', async () => {
    const res = await request(app)
      .get('/media/demo/sample_video.mp4')
      .set('Range', 'bytes=999999999-9999999999');

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toMatch(/^bytes \*\/\d+$/);
  });
});
