import { describe, it, expect } from '@jest/globals';
import { resolveApiBaseUrl } from '../env';

describe('resolveApiBaseUrl', () => {
  it('pairs the production portal with the production API', () => {
    expect(resolveApiBaseUrl('https://unidorm.inuappcenter.kr')).toBe('https://unidorm-server.inuappcenter.kr');
  });

  it('pairs the dev portal with the dev API', () => {
    expect(resolveApiBaseUrl('https://inu-dormitory-dev.inuappcenter.kr/home')).toBe('https://inu-dormitory-dev.inuappcenter.kr');
  });

  it('ignores an override that disagrees with a known web host', () => {
    expect(resolveApiBaseUrl('https://unidorm.inuappcenter.kr', 'https://dev.example.com/')).toBe(
      'https://unidorm-server.inuappcenter.kr',
    );
  });

  it('uses the override for an unknown host, trimmed', () => {
    expect(resolveApiBaseUrl('http://localhost:5173', 'http://localhost:8080/')).toBe('http://localhost:8080');
  });

  it('falls back to the production API when nothing else applies', () => {
    expect(resolveApiBaseUrl('not a url')).toBe('https://unidorm-server.inuappcenter.kr');
  });
});
