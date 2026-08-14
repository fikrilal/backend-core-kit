import {
  expandVerificationProfile,
  parseVerificationProfileId,
  verificationProfiles,
  type VerificationProfileRegistry,
} from './profile-registry';

describe('verification profile registry', () => {
  it('preserves the established fast verification order', () => {
    const scripts = expandVerificationProfile('fast').map((step) => step.script);

    expect(scripts).toEqual([
      'verify:knowledge',
      'format:check',
      'lint',
      'typecheck',
      'verify:env',
      'deps:check',
      'test',
      'openapi:check',
      'openapi:lint',
    ]);
  });

  it('expands ci to full followed by runtime', () => {
    const ciScripts = expandVerificationProfile('ci').map((step) => step.script);
    const fullScripts = expandVerificationProfile('full').map((step) => step.script);
    const runtimeScripts = expandVerificationProfile('runtime').map((step) => step.script);

    expect(ciScripts).toEqual([...fullScripts, ...runtimeScripts]);
    expect(ciScripts.at(-1)).toBe('harness:runtime');
  });

  it('rejects nested profile cycles', () => {
    const cyclicRegistry: VerificationProfileRegistry = {
      ...verificationProfiles,
      fast: {
        id: 'fast',
        description: 'cycle fixture',
        steps: [{ kind: 'profile', profile: 'ci' }],
      },
      ci: {
        id: 'ci',
        description: 'cycle fixture',
        steps: [{ kind: 'profile', profile: 'fast' }],
      },
    };

    expect(() => expandVerificationProfile('ci', cyclicRegistry)).toThrow(
      'Verification profile cycle: ci -> fast -> ci',
    );
  });

  it('parses only registered profile identifiers', () => {
    expect(parseVerificationProfileId('full')).toBe('full');
    expect(parseVerificationProfileId('unknown')).toBeUndefined();
  });
});
