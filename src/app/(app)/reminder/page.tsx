import { getCurrentEmployee } from "@/lib/auth";
import { todayJakarta } from "@/lib/format";
import ReminderBrief, { parseFlash } from "../ReminderBrief";

export const metadata = { title: "Reminder" };

// Halaman penuh Reminder: semua baris + pratinjau teks WhatsApp.
export default async function ReminderPage({
  searchParams,
}: {
  searchParams: Promise<{ flash?: string | string[] }>;
}) {
  const me = (await getCurrentEmployee())!;
  const sp = await searchParams;
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <ReminderBrief me={me} today={todayJakarta()} flash={parseFlash(sp.flash)} basePath="/reminder" full />
    </main>
  );
}
