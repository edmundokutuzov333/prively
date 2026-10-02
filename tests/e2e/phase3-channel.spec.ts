import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !service) throw new Error("missing_local_e2e_env");

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function provisionUser(email: string, password: string, handle: string, creator: boolean) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      handle,
      display_name: handle,
      signup_role: creator ? "creator" : "client",
      role: creator ? "creator" : "client",
      age_confirmed: true,
      legal_acceptances: {
        terms: { version: "1.0" },
        privacy: { version: "1.0" },
      },
    },
  });

  if (created.error || !created.data.user) {
    throw created.error ?? new Error("phase3_fixture_user_create_failed");
  }

  const userId = created.data.user.id;

  const profile = await admin.from("profiles").upsert({
    id: userId,
    handle,
    display_name: handle,
    status: "active",
    age_verified_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (profile.error) throw profile.error;

  const kyc = await admin.from("kyc_verifications").insert({
    user_id: userId,
    provider: "manual",
    status: "approved",
    doc_type: "identity_document",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
    reason: "phase3 e2e approved fixture",
  });
  if (kyc.error) throw kyc.error;

  if (creator) {
    const role = await admin.from("user_roles").upsert(
      { user_id: userId, role: "creator" },
      { onConflict: "user_id,role" },
    );
    if (role.error) throw role.error;

    const setting = await admin.from("platform_settings").upsert({
      key: "legal.creator_terms_version",
      value: "1.0",
    }, { onConflict: "key" });
    if (setting.error) throw setting.error;

    const terms = await admin.from("creator_terms_acceptances").upsert({
      id: crypto.randomUUID(),
      user_id: userId,
      version: "1.0",
      accepted_at: new Date().toISOString(),
      source: "phase3-e2e",
      declarations: {},
      metadata: {},
    }, { onConflict: "id" });
    if (terms.error) throw terms.error;
  }

  return userId;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/entrar");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/palavra-passe|password/i).fill(password);
  await page.getByRole("button", { name: /entrar|iniciar sessão|sign in/i }).click();
  await page.waitForURL(//descobrir|/verificacao|/estudio/, { timeout: 15000 });
}

async function provisionAndSignIn(
  browser: Browser,
  email: string,
  password: string,
  handle: string,
  creator: boolean,
) {
  const userId = await provisionUser(email, password, handle, creator);
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email, password);
  return { userId, context, page };
}

test.describe("phase 3 creator channel", () => {
  test("creator creates and edits channel, client sees public profile", async ({ browser }) => {
    const ts = Date.now();
    const creatorEmail = `phase3-creator-${ts}@example.test`;
    const creatorPassword = `Phase3Creator!${ts}`;
    const creatorHandle = `phase3_creator_${String(ts).slice(-6)}`;
    const clientEmail = `phase3-client-${ts}@example.test`;
    const clientPassword = `Phase3Client!${ts}`;
    const clientHandle = `phase3_client_${String(ts).slice(-6)}`;
    const channelHandle = `phase3_public_${String(ts).slice(-6)}`;
    const updatedHandle = `phase3_updated_${String(ts).slice(-6)}`;

    let creatorId: string | null = null;
    let clientId: string | null = null;
    let creatorContext: Awaited<ReturnType<Browser["newContext"]>> | null = null;
    let clientContext: Awaited<ReturnType<Browser["newContext"]>> | null = null;

    try {
      const creator = await provisionAndSignIn(browser, creatorEmail, creatorPassword, creatorHandle, true);
      creatorId = creator.userId;
      creatorContext = creator.context;

      await creator.page.goto("/estudio/conteudo");
      await expect(creator.page.getByRole("heading", { name: /conteúdo|content/i })).toBeVisible();

      await creator.page.getByLabel(/handle do canal|channel handle/i).fill(channelHandle);
      await creator.page.getByLabel(/nome público|public name/i).fill("Phase 3 Creator");
      await creator.page.getByLabel(/bio/i).fill("Canal real da Fase 3");

      await expect(creator.page.getByText(/este identificador está disponível|this handle is available|ce handle est disponible/i)).toBeVisible({ timeout: 10000 });
      await creator.page.getByRole("button", { name: /criar canal|create channel|créer le canal/i }).click();

      await expect(creator.page.getByText(`@${channelHandle}`)).toBeVisible({ timeout: 10000 });

      await creator.page.goto("/estudio/perfil");
      await expect(creator.page.getByRole("heading", { name: /perfil da criadora|creator profile|profil de la créatrice/i })).toBeVisible();
      await creator.page.getByLabel(/handle/i).fill(updatedHandle);
      await expect(creator.page.getByText(/este identificador está disponível|this handle is available|ce handle est disponible/i)).toBeVisible({ timeout: 10000 });
      await creator.page.getByLabel(/nome público|public name/i).fill("Phase 3 Creator Updated");
      await creator.page.getByLabel(/^bio$/i).fill("Bio pública actualizada da Fase 3");
      await creator.page.getByLabel(/cidade|city|ville/i).fill("Maputo");
      await creator.page.getByLabel(/bairro|district|quartier/i).fill("KaMpfumo");
      await creator.page.getByRole("button", { name: /guardar alterações|save changes|enregistrer les changements/i }).click();

      await expect(creator.page.getByRole("status")).toContainText(/alterações guardadas|changes saved|modifications enregistrées/i);

      const updatedChannel = await admin
        .from("channels")
        .select("id,handle,display_name,bio")
        .eq("owner_id", creatorId)
        .eq("is_seed", false)
        .maybeSingle();
      if (updatedChannel.error || !updatedChannel.data) {
        throw updatedChannel.error ?? new Error("phase3_channel_missing_after_update");
      }
      expect(updatedChannel.data.handle).toBe(updatedHandle);
      expect(updatedChannel.data.display_name).toBe("Phase 3 Creator Updated");
      expect(updatedChannel.data.bio).toBe("Bio pública actualizada da Fase 3");

      await creator.page.goto(`/c/${updatedHandle}`);
      await expect(creator.page.getByRole("heading", { name: "Phase 3 Creator Updated" })).toBeVisible();

      const client = await provisionAndSignIn(browser, clientEmail, clientPassword, clientHandle, false);
      clientId = client.userId;
      clientContext = client.context;

      await client.page.goto(`/c/${updatedHandle}`);
      await expect(client.page.getByRole("heading", { name: "Phase 3 Creator Updated" })).toBeVisible();
      await expect(client.page.getByText("Bio pública actualizada da Fase 3")).toBeVisible();
      await expect(client.page.getByText(/Maputo/)).toBeVisible();
      await expect(client.page.getByText(/KaMpfumo/)).toBeVisible();

      const audit = await admin
        .from("security_events")
        .select("event_type,metadata")
        .eq("user_id", creatorId)
        .in("event_type", ["channel.created", "channel.updated"]);
      if (audit.error) throw audit.error;
      expect(audit.data?.some((row) => row.event_type === "channel.created")).toBe(true);
      expect(audit.data?.some((row) => row.event_type === "channel.updated")).toBe(true);
    } finally {
      if (clientContext) await clientContext.close();
      if (creatorContext) await creatorContext.close();
      if (clientId) await admin.auth.admin.deleteUser(clientId);
      if (creatorId) await admin.auth.admin.deleteUser(creatorId);
    }
  });
});
