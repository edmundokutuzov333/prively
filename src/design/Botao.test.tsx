import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Botao } from './Botao';

describe('Botao', () => {
  it('renders its action label', () => {
    render(<Botao>Acção</Botao>);
    expect(screen.getByRole('button', { name: 'Acção' })).toBeVisible();
  });

  it('prevents interaction while loading', () => {
    render(<Botao loading>Entrar</Botao>);
    expect(screen.getByRole('button', { name: /Entrar/i })).toBeDisabled();
  });
});