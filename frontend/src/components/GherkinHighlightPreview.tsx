import React from 'react';

export interface GherkinHighlightPreviewProps {
  gherkinText: string;
}

const KEYWORD_COLORS: Record<string, string> = {
  Feature: 'var(--primary)',
  Funcionalidade: 'var(--primary)',
  Scenario: 'var(--info)',
  'Scenario Outline': 'var(--info)',
  Cenário: 'var(--info)',
  Given: 'var(--success)',
  Dado: 'var(--success)',
  When: 'var(--warning)',
  Quando: 'var(--warning)',
  Then: '#c084fc',
  Então: '#c084fc',
  And: 'var(--text-secondary)',
  E: 'var(--text-secondary)',
  But: 'var(--danger)',
  Mas: 'var(--danger)',
  Examples: 'var(--info)',
  Exemplos: 'var(--info)',
};

const GHERKIN_REGEX =
  /^(\s*)(Feature:|Funcionalidade:|Scenario Outline:|Scenario:|Cenário:|Examples:|Exemplos:|Given\b|Dado\b|When\b|Quando\b|Then\b|Então\b|And\b|E\b|But\b|Mas\b)(.*)$/i;

export const GherkinHighlightPreview: React.FC<GherkinHighlightPreviewProps> = ({
  gherkinText,
}) => {
  const lines = gherkinText.split('\n');

  return (
    <pre
      data-testid="gherkin-syntax-preview"
      style={{
        margin: 0,
        padding: '1rem',
        backgroundColor: 'var(--bg-default)',
        border: '1px solid var(--border-color)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: '0.88rem',
        overflowX: 'auto',
        lineHeight: 1.65,
      }}
    >
      {lines.map((line, idx) => {
        const match = GHERKIN_REGEX.exec(line);
        if (!match) {
          return (
            <div key={idx} style={{ color: 'var(--text-secondary)' }}>
              {line || ' '}
            </div>
          );
        }

        const indent = match[1] ?? '';
        const rawKeyword = match[2] ?? '';
        const rest = match[3] ?? '';
        const cleanKey = rawKeyword.replace(':', '').trim();

        const matchedKey =
          Object.keys(KEYWORD_COLORS).find((k) => k.toLowerCase() === cleanKey.toLowerCase()) ??
          'Feature';
        const color = KEYWORD_COLORS[matchedKey] ?? 'var(--primary)';

        return (
          <div key={idx}>
            <span>{indent}</span>
            <strong data-testid="gherkin-keyword" style={{ color }}>
              {rawKeyword}
            </strong>
            <span style={{ color: 'var(--text-primary)' }}>{rest}</span>
          </div>
        );
      })}
    </pre>
  );
};
