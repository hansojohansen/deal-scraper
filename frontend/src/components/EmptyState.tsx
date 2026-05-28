interface Props {
  title?: string;
  message?: string;
}

export default function EmptyState({ title = "Ingen resultater", message }: Props) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center space-y-2">
      <p className="text-slate-300 font-medium">{title}</p>
      {message && <p className="text-slate-500 text-sm">{message}</p>}
    </div>
  );
}
