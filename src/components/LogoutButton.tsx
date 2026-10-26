export default function LogoutButton() {
  return (
    <form action="/auth/logout" method="post">
      <button
        type="submit"
        className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-100"
      >
        Keluar
      </button>
    </form>
  );
}
