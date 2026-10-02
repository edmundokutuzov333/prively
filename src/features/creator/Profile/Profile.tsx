import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle, MapPin, PencilSimple } from "@phosphor-icons/react";
import { useTranslation } from "@/lib/i18n";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { Ficha } from "@/design/Ficha";
import { Botao } from "@/design/Botao";
import { requireSupabase } from "@/lib/supabase";
import { useAuth } from "@/app/session";
import { ROUTES } from "@/lib/routes";

type Channel = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  bairro: string | null;
  province: string | null;
};

const emptyForm: Channel = {
  id: "",
  handle: "",
  display_name: "",
  bio: null,
  city: null,
  bairro: null,
  province: null,
};

function errorCode(error: unknown): string {
  const raw = error instanceof Error ? error.message.toLowerCase() : typeof error === "string" ? error.toLowerCase() : "";
  const codes = [
    "not_creator",
    "channel_not_found",
    "channel_forbidden",
    "channel_handle_taken",
    "invalid_channel_handle",
    "display_name_invalid",
    "bio_too_long",
  ];
  return codes.find((code) => raw.includes(code)) ?? "";
}

export default function Profile() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [form, setForm] = useState<Channel>(emptyForm);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = async () => {
    if (!user) {
      setChannel(null);
      setForm(emptyForm);
      setPageState("forbidden");
      return;
    }

    setPageState("loading");
    setMessage(null);

    try {
      const { data, error } = await requireSupabase()
        .from("channels")
        .select("id,handle,display_name,bio,city,bairro,province")
        .eq("owner_id", user.id)
        .eq("is_seed", false)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setChannel(null);
        setForm(emptyForm);
        setPageState("empty");
        return;
      }

      const next = data as Channel;
      setChannel(next);
      setForm(next);
      setPageState("success");
    } catch {
      setPageState(navigator.onLine ? "error" : "offline");
      setMessage("experience.pages.creator.profile.errors.generic");
    }
  };

  useEffect(() => {
    if (authLoading) {
      setPageState("loading");
      return;
    }
    void load();
  }, [authLoading, user?.id]);

  const save = async () => {
    if (!channel || saving) return;

    setSaving(true);
    setMessage(null);

    try {
      const { data, error } = await requireSupabase().rpc("update_creator_channel", {
        _channel: channel.id,
        _handle: form.handle,
        _display_name: form.display_name,
        _bio: form.bio,
        _city: form.city,
        _bairro: form.bairro,
        _province: form.province,
      });

      if (error) {
        const code = errorCode(error);
        const known = new Set([
          "not_creator",
          "channel_not_found",
          "channel_forbidden",
          "channel_handle_taken",
          "invalid_channel_handle",
          "display_name_invalid",
          "bio_too_long",
        ]);
        setMessage(known.has(code) ? `content.errors.${code}` : "experience.pages.creator.profile.errors.generic");
        return;
      }

      const updated = { ...form, id: String(data) };
      setChannel(updated);
      setForm(updated);
      setMessage("experience.pages.creator.profile.saved");
    } catch {
      setMessage(navigator.onLine ? "experience.pages.creator.profile.errors.generic" : "pageShell.offline");
    } finally {
      setSaving(false);
    }
  };

  const stateMessage = pageState === "loading"
    ? t("pageShell.loading")
    : pageState === "offline"
      ? t("pageShell.offline")
      : pageState === "forbidden"
        ? t("experience.pages.creator.profile.authRequired")
        : t("experience.pages.creator.profile.errors.generic");

  if (pageState !== "success") {
    return (
      <PageShell
        title={t("experience.pages.creator.profile.title")}
        description={t("experience.pages.creator.profile.description")}
        state={pageState}
        emptyState={{
          message: pageState === "empty"
            ? t("experience.pages.creator.profile.noChannel")
            : stateMessage,
          action: pageState === "empty"
            ? <Link to={ROUTES.CREATOR_CONTENT} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("experience.pages.creator.profile.createChannel")}</Link>
            : <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("common.retry")}</button>,
        }}
      />
    );
  }

  return (
    <PageShell
      title={t("experience.pages.creator.profile.title")}
      description={t("experience.pages.creator.profile.description")}
      state="success"
    >
      <div className="space-y-6">
        {message ? (
          <div role="status" className="rounded-md border border-bone-50/10 bg-ink-900/70 p-4 text-sm text-bone-200">
            {message.startsWith("content.errors.") ? t(message) : t(message)}
          </div>
        ) : null}

        <Ficha variant="focus" className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-bone-500">
                <PencilSimple size={15} /> {t("experience.pages.creator.profile.channelEyebrow")}
              </p>
              <h2 className="mt-3 text-2xl font-semibold text-bone-50">@{channel?.handle}</h2>
            </div>
            <CheckCircle size={25} weight="duotone" className="text-ok" />
          </div>

          <div className="mt-7 grid gap-5 md:grid-cols-2">
            <label>
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.handle")}</span>
              <input value={form.handle} onChange={(event) => setForm((current) => ({ ...current, handle: event.target.value.toLowerCase() }))} maxLength={24} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" />
            </label>
            <label>
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.displayName")}</span>
              <input value={form.display_name} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} maxLength={60} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" />
            </label>
            <label className="md:col-span-2">
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.bio")}</span>
              <textarea value={form.bio ?? ""} onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))} maxLength={500} rows={5} className="w-full rounded-md border border-input bg-ink-850 p-3 text-bone-50 outline-none" />
            </label>
            <label>
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.city")}</span>
              <input value={form.city ?? ""} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" />
            </label>
            <label>
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.bairro")}</span>
              <input value={form.bairro ?? ""} onChange={(event) => setForm((current) => ({ ...current, bairro: event.target.value }))} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" />
            </label>
            <label>
              <span className="mb-2 block text-sm text-bone-300">{t("experience.pages.creator.profile.province")}</span>
              <input value={form.province ?? ""} onChange={(event) => setForm((current) => ({ ...current, province: event.target.value }))} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" />
            </label>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Botao onClick={() => void save()} loading={saving} disabled={!form.handle.trim() || !form.display_name.trim()}>
              {t("experience.pages.creator.profile.save")}
            </Botao>
            <Link to={ROUTES.CLIENT_CREATOR_PROFILE(form.handle)} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">
              {t("experience.pages.creator.profile.viewPublic")}
            </Link>
          </div>

          <div className="mt-6 flex items-start gap-3 text-sm text-bone-500">
            <MapPin size={18} className="mt-0.5 shrink-0" />
            <span>{[form.bairro, form.city, form.province].filter(Boolean).join(", ") || t("experience.pages.creator.profile.locationEmpty")}</span>
          </div>
        </Ficha>
      </div>
    </PageShell>
  );
}
