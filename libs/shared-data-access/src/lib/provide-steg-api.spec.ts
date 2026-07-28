import { resolveStegApiUrl } from './provide-steg-api';

describe('resolveStegApiUrl', () => {
  it('returns an API endpoint', () => {
    expect(resolveStegApiUrl()).toContain('/api/v1');
  });
});
