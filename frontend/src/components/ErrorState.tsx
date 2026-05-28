interface Props {
  title?: string;
  message?: string;
  retry?: () => void;
}

export default function ErrorState({ title = "Kunne ikke laste data", message, retry }: Props) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center space-y-3">
      <p className="text-slate-100 font-semibold">{title}</p>
      {message && <p className="text-slate-400 text-sm">{message}</p>}
      {retry && (
        <button
          onClick={retry}
          className="text-sm text-amber-400 hover:text-amber-300 underline transition-colors"
        >
          Prøv igjen
        </button>
      )}
    </div>
  );
}
