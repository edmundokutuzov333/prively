import { describe, expect, it } from 'vitest';
import { CREATOR_TERMS_VERSION, creatorTermDeclarations, creatorTermsClosingNote, creatorTermsSections } from './creatorTerms';

describe('creator terms source contract', () => {
  it('keeps the versioned creator terms document complete', () => {
    expect(CREATOR_TERMS_VERSION).toBe('1.0.0');
    expect(creatorTermsSections.map((section) => section.number)).toEqual(
      Array.from({ length: 16 }, (_, index) => String(index + 1)),
    );
    expect(creatorTermsClosingNote).toContain('revisto por um advogado em Moçambique');
  });

  it('contains exactly the 16 mandatory declarations with unique keys', () => {
    expect(creatorTermDeclarations).toHaveLength(16);
    expect(new Set(creatorTermDeclarations.map((item) => item.key)).size).toBe(16);

    for (const declaration of creatorTermDeclarations) {
      expect(declaration.text.length).toBeGreaterThan(20);
    }
  });

  it('contains the explicit commercial and meeting rules', () => {
    const text = creatorTermsSections
      .flatMap((section) => [
        ...('paragraphs' in section && section.paragraphs ? section.paragraphs : []),
        ...('bullets' in section && section.bullets ? section.bullets : []),
        ...('paragraphsAfter' in section && section.paragraphsAfter ? section.paragraphsAfter : []),
        ...('bulletsAfter' in section && section.bulletsAfter ? section.bulletsAfter : []),
        ...('paragraphsAfter2' in section && section.paragraphsAfter2 ? section.paragraphsAfter2 : []),
      ])
      .join(' ');

    expect(text).toContain('20% sobre assinaturas, PPV, mensagens pagas e lives');
    expect(text).toContain('10% sobre gorjetas');
    expect(text).toContain('0% sobre encontros presenciais');
    expect(text).toContain('não é parte no encontro');
  });
});
