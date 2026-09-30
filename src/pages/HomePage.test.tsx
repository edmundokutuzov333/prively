import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import '@/lib/i18n';
import { persistAgeVerification } from '@/lib/ageGate';
import { HomePage } from './HomePage';

describe('HomePage', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.cookie = 'prively_age_verified=; Max-Age=0; Path=/';
  });

  it('presents both real entry paths without showing explicit content', () => {
    persistAgeVerification();
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Menos público, muito mais Privê.' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: /Entrar no Privê/i })[0]).toHaveAttribute('href', '/idade?role=client');
    expect(screen.getAllByRole('link', { name: /Sê criadora/i })[0]).toHaveAttribute('href', '/idade?role=creator');
    expect(screen.getByText('Sem conteúdo explícito nesta página')).toBeVisible();
  });

  it('keeps the curtain interaction local to the landing page', () => {
    persistAgeVerification();
    render(<MemoryRouter><HomePage /></MemoryRouter>);

    const curtain = screen.getByRole('button', { name: 'Abrir a cortina' });
    expect(curtain).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(curtain);

    expect(curtain).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Fechar a cortina' })).toBeVisible();
  });
});
