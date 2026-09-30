import { expect, test } from '@playwright/test';

const publicRoutes = [
  '/',
  '/idade',
  '/entrar',
  '/registo',
  '/admin/entrar',
  '/recuperar',
  '/se-criadora',
  '/sobre',
  '/ajuda',
  '/legal/termos',
  '/legal/termos-criadoras',
  '/legal/privacidade',
  '/legal/conteudo-proibido',
  '/legal/reembolsos',
  '/legal/cookies',
  '/legal/dmca',
  '/404',
  '/estado/404',
  '/estado/offline',
  '/estado/acesso-negado',
];

const clientProtectedRoutes = [
  '/descobrir',
  '/feed',
  '/mensagens',
  '/notificacoes',
  '/encontros',
  '/denuncias',
  '/carteira',
  '/compras',
  '/desejos',
  '/pedidos',
  '/loja',
  '/leiloes',
  '/sorteios',
  '/presentes',
  '/fidelidade',
  '/premium',
  '/bundles',
  '/definicoes/conta',
  '/definicoes/privacidade',
  '/definicoes/limites',
  '/definicoes/discreto',
  '/definicoes/seguranca',
  '/verificacao',
  '/pesquisa',
  '/subscricoes',
  '/tiers',
  '/ppv',
  '/comentarios',
  '/reaccoes',
  '/enquetes',
  '/ranking-fas',
  '/mensagens/bloqueadas',
  '/recarga',
  '/historico-carteira',
  '/recibos',
  '/moeda',
  '/pausa',
  '/auto-exclusao',
  '/modo-neutro',
  '/stories',
];

const creatorProtectedRoutes = [
  '/estudio',
  '/estudio/conteudo',
  '/estudio/loja',
  '/estudio/agenda',
  '/estudio/fas',
  '/estudio/mensagens',
  '/estudio/encontros',
  '/estudio/check-in',
  '/estudio/panico',
  '/estudio/ganhos',
  '/estudio/analitica',
  '/estudio/pedidos',
  '/estudio/leiloes',
  '/estudio/respostas',
  '/estudio/bundles',
  '/estudio/actividades',
  '/estudio/agenda-avancada',
  '/estudio/metas',
  '/estudio/promocoes',
  '/estudio/integracoes',
  '/estudio/definicoes',
  '/estudio/definicoes/seguranca',
  '/estudio/onboarding',
  '/estudio/vip',
  '/estudio/mural',
  '/estudio/stories',
  '/estudio/ppv',
  '/estudio/mensagens-pagas',
  '/estudio/sorteios',
  '/estudio/seguranca',
  '/estudio/bloqueios',
  '/estudio/silenciados',
  '/estudio/nao-mostrar',
  '/estudio/levantamentos',
  '/estudio/recibos',
  '/estudio/suporte',
];


const disabledProviderRoutes = [
  '/estudio/referral',
  '/admin/agencia',
  '/lives',
  '/live-privada',
  '/chamadas',
  '/estudio/lives',
  '/estudio/chamadas',
];

const adminRoutes = [
  '/admin',
  '/admin/utilizadores',
  '/admin/kyc',
  '/admin/media',
  '/admin/moderacao',
  '/admin/conformidade',
  '/admin/legal-holds',
  '/admin/locais-seguros',
  '/admin/emergencias',
  '/admin/negocio',
  '/admin/integracoes-negocio',
  '/admin/production',
  '/admin/auditoria',
  '/admin/arquivo',
  '/admin/config',
  '/admin/feature-flags',
  '/admin/comissoes',
  '/admin/selos',
  '/admin/presentes',
  '/admin/suporte',
  '/admin/tickets',
  '/admin/relatorios',
];

test.describe('platform route contract', () => {
  for (const route of publicRoutes) {
    test(`public route is reachable: ${route}`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.ok(), `Unexpected response for ${route}`).toBeTruthy();
      await expect(page.locator('body')).toBeVisible();
    });
  }

  for (const route of clientProtectedRoutes) {
    test(`client route is protected: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(new RegExp(`/entrar\\?next=%2F${route.slice(1).replaceAll('/', '%2F')}$|/verificacao$`));
    });
  }

  for (const route of creatorProtectedRoutes) {
    test(`creator route is protected: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/se-criadora|\/entrar\?next=/);
    });
  }

  for (const route of adminRoutes) {
    test(`admin route is protected: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/admin\/entrar|\/estado\/acesso-negado/);
    });
  }

  for (const route of disabledProviderRoutes) {
    test(`disabled external-provider route stays hidden: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/404$/);
    });
  }

  test('PWA manifest is served', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe('Prively');
    expect(manifest.display).toBe('standalone');
    expect(manifest.lang).toBe('pt-MZ');
  });

  test('service worker source is served', async ({ request }) => {
    const response = await request.get('/sw.js');
    expect(response.ok()).toBeTruthy();
    expect(await response.text()).toContain('showNotification');
  });

  test('language selector changes document language', async ({ page }) => {
    await page.goto('/');
    const ageGate = page.getByTestId('age-gate-confirm');
    if (await ageGate.isVisible()) {
      await ageGate.click();
      await page.goto('/');
    }
    await page.getByTestId('language-selector').click();
    await page.getByRole('button', { name: /^EN$/i }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
