import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import '@/lib/i18n';
import { ClientWalletPage } from './ExperiencePages';

describe('ClientWalletPage', () => {
  it('does not invent a wallet balance', () => {
    render(<MemoryRouter><ClientWalletPage /></MemoryRouter>);
    expect(screen.getByText('Saldo ainda não ligado')).toBeVisible();
    expect(screen.queryByText('0 MT')).not.toBeInTheDocument();
  });
});