"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteProcedure } from "../actions";

export default function DeleteProcedureButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(`Hapus prosedur "${title}"? Tindakan ini tercatat di riwayat perubahan.`)) return;
        startTransition(async () => {
          const res = await deleteProcedure(id);
          if (!res.ok) return window.alert(res.message);
          router.push("/prosedur");
        });
      }}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      Hapus
    </button>
  );
}
