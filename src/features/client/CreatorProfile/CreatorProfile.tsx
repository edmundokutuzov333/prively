import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, UserCircle } from "@phosphor-icons/react";
import { useTranslation } from "@/lib/i18n";
import { PageShell, type PageState } from "@/components/layout/PageShell";
import { Ficha } from "@/design/Ficha";
import { useAuth } from "@/app/session";
import { requireSupabase } from "@/lib/supabase";
import { ROUTES } from "@/lib/routes";

type PublicChannel = {
  id: string;
  handle: string;
  display_name: string;
  bio: string | null;
  city: string | null;
  bairro: string | null;
  province: string | null;
};

export default function CreatorProfile() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const { handle = "" } = useParams<{ handle: string }>();
  const [channel, setChannel] = useState<PublicChannel | null>(null);
  const [state, setState] = useState<PageState>("loading");

  const load = async () => {
    if (!user) {
      setChannel(null);
      setState("forbidden");
      return;
    }

    setState("loading");

    try {
      const { data, error } = await requireSupabase()
        .from("channels")
        .select("id,handle,display_name,bio,city,bairro,province")
        .eq("handle", handle)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        setChannel(null);
        setState("empty");
        return;
      }

      setChannel(data as PublicChannel);
      setState("success");
    } catch {
      setChannel(null);
      setState(navigator.onLine ? "error" : "offline");
    }
  };

  useEffect(() => {
    if (authLoading) {
      setState("loading");
      return;
    }
    void load();
  }, [authLoading, user?.id, handle]);

  if (state !== "success") {
    const message = state === "empty"
      ? t("publicCreatorProfile.notFound")
      : state === "forbidden"
        ? t("publicCreatorProfile.authRequired")
        : state === "offline"
          ? t("pageShell.offline")
          : state === "loading"
            ? t("pageShell.loading")
            : t("pageShell.error");

    return (
      <PageShell
        title={t("experience.pages.profile.title")}
        description={t("experience.pages.profile.intro")}
        state={state}
        emptyState={{
          message,
          action: state === "error" || state === "offline"
            ? <button type="button" onClick={() => void load()} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("common.retry")}</button>
            : <Link to={ROUTES.DISCOVER} className="inline-flex min-h-11 items-center rounded-xl border border-bone-50/12 px-4 text-sm font-semibold text-bone-50">{t("publicCreatorProfile.backToDiscover")}</Link>,
        }}
      />
    );
  }

  const location = [channel?.bairro, channel?.city, channel?.province].filter(Boolean).join(", ");

  return (
    <PageShell
      title={channel?.display_name ?? t("experience.pages.profile.title")}
      description={t("publicCreatorProfile.publicDescription")}
      state="success"
    >
      <div className="space-y-6">
        <Ficha variant="focus" className="p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-14 items-center justify-center rounded-full border border-bone-50/10 bg-ink-850">
              <UserCircle size={32} weight="duotone" className="text-bone-100" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-bone-500">@{channel?.handle}</p>
              <h2 className="mt-1 text-2xl font-semibold text-bone-50">{channel?.display_name}</h2>
            </div>
          </div>

          {channel?.bio ? <p className="mt-7 max-w-3xl text-base leading-7 text-bone-200">{channel.bio}</p> : null}

          <div className="mt-6 flex items-start gap-3 text-sm text-bone-500">
            <MapPin size={18} className="mt-0.5 shrink-0" />
            <span>{location || t("publicCreatorProfile.locationEmpty")}</span>
          </div>
        </Ficha>
      </div>
    </PageShell>
  );
}
