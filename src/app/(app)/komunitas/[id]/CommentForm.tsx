"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addComment, deleteComment } from "../actions";

export function CommentForm({ postId }: { postId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    const res = await addComment(postId, body);
    setPending(false);
    if (!res.ok) return setError(res.message);
    setBody("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Tulis komentar (tampil dengan nama Anda, terlihat semua karyawan)"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20"
      />
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={pending || !body.trim()}
        className="self-start rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? "Mengirim..." : "Kirim komentar"}
      </button>
    </form>
  );
}

export function DeleteCommentButton({ postId, commentId }: { postId: string; commentId: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function remove() {
    if (!confirm("Hapus komentar ini?")) return;
    setPending(true);
    const res = await deleteComment(postId, commentId);
    setPending(false);
    if (!res.ok) return alert(res.message);
    router.refresh();
  }

  return (
    <button type="button" onClick={remove} disabled={pending} className="shrink-0 text-xs font-medium text-red-700 hover:underline disabled:opacity-60">
      Hapus
    </button>
  );
}
