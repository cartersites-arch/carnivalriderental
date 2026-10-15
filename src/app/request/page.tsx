import { catalog } from "@/lib/catalog";
import { pageMetadata } from "@/lib/seo";
import { paths } from "@/lib/urls";
import { RequestForm } from "./RequestForm";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return pageMetadata({
    title: "Start an event request",
    description: "Tell us about your event and we source a carnival ride and operator, then send a written quote.",
    path: "/request",
    indexable: false,
  });
}

export default async function RequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = (key: string): string => typeof sp[key] === "string" ? sp[key] : "";
  const rides = catalog.rides().map((r) => ({ slug: r.slug, name: r.name }));
  const ride = rides.some((r) => r.slug === query("ride")) ? query("ride") : "";
  return (
    <main className="container-page py-10">
      <p className="eyebrow">Event request</p>
      <h1 className="mt-2 font-display text-4xl">Tell us about your event</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Four short steps. We use this to source an operator and prepare a written quote. Submitting is not a booking and
        takes no payment.
      </p>
      <RequestForm
        rides={rides}
        initial={{ rideSlug: ride, city: query("city"), state: query("state").trim().toUpperCase(), dateStart: query("date") }}
        browseHref={paths.rides()}
      />
    </main>
  );
}
