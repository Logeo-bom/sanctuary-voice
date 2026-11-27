import { beforeEach, describe, expect, it } from 'vitest';
import { OfflineEdgeTranslator, isNllbLanguageSupported } from '../offlineEdgeTranslator';
import { getOfflineModelStatus, resetOfflineReadinessForTests } from '../offlineReadiness';

describe('offline Cebuano/Bisaya translation', () => {
  beforeEach(() => {
    resetOfflineReadinessForTests();
  });

  it('maps Cebuano to the on-device NLLB-200 model', () => {
    expect(isNllbLanguageSupported('ceb')).toBe(true);
    expect(isNllbLanguageSupported('ceb-PH')).toBe(true);
  });

  it('uses the Cebuano lexicon when NLLB is not downloaded, without starting a download', async () => {
    const translator = new OfflineEdgeTranslator('ceb', 'en', () => {});
    const result = await translator.translateBestEffort('Salamat sa Ginoo ug sa Espiritu Santo', 'ceb', 'en');
    expect(result).toContain('Lord');
    expect(result).toContain('Holy Spirit');
    expect(getOfflineModelStatus('Xenova/nllb-200-distilled-600M').state).toBe('missing');
  });
});
