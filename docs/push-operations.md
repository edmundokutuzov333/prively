# Push discreto

Gerar as chaves com `npx web-push generate-vapid-keys` fora do repositório. Guardar `VITE_VAPID_PUBLIC_KEY` no ambiente da aplicação e `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` apenas nos segredos das Edge Functions. A rotação cria um par novo, aceita ambos durante a janela de transição, regista a data e remove o antigo depois de as subscrições terem sido renovadas.

O servidor envia apenas payloads neutros. O modo discreto fixa o título em “Actividade”; nunca envia nome, pseudónimo, valor ou pré-visualização. Endpoints 404/410 são desactivados e não entram em ciclo de reenvio. No iOS, push web exige a PWA instalada no ecrã inicial; a UI deve explicar essa limitação.
