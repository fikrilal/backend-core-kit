import { durationAdvisory, durationBaselines } from './duration-policy';

describe('verification duration policy', () => {
  it('covers every canonical profile with a non-blocking calibration budget', () => {
    expect(Object.keys(durationBaselines).sort()).toEqual(['ci', 'fast', 'full', 'runtime']);
    for (const baseline of Object.values(durationBaselines)) {
      expect(baseline.observedMs).toBeGreaterThan(0);
      expect(baseline.advisoryMs).toBeGreaterThan(baseline.observedMs);
    }
  });

  it('reports slow profiles without turning duration into a failure', () => {
    expect(durationAdvisory('runtime', 120_000)).toBeUndefined();
    expect(durationAdvisory('runtime', 120_001)).toContain('Duration advisory');
  });
});
