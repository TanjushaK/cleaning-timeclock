export const metadata = {
  title: "Офлайн • Timeclock",
};

export default function OfflinePage() {
  return (
    <main className="min-h-dvh bg-[#120805] text-amber-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-amber-500/30 bg-black/30 p-6 shadow-lg">
        <div className="text-2xl font-semibold">Нет сети</div>
        <div className="mt-3 text-sm text-amber-100/80">
          Приложение запущено офлайн. START/STOP сохраняются в очередь и уйдут при появлении интернета.
        </div>

        <div className="mt-4 rounded-xl border border-amber-500/20 bg-black/20 p-4 text-sm text-amber-100/80">
          Когда сеть появится — просто открой приложение. Синк сработает при активации.
        </div>

        <div className="mt-5 text-xs text-amber-200/70">
          Подсказка: если ты только что установил приложение и открыл его впервые офлайн — подключись к сети один раз,
          чтобы закешировать интерфейс.
        </div>
      </div>
    </main>
  );
}
