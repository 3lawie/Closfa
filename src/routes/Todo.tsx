import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/Todo')({
  component: Todo,
})

function Todo() {
  const activities = [
    { color: 'text-orange-700', bg: 'bg-orange-200/50', border: 'border-orange-200/30' },
    { color: 'text-amber-700', bg: 'bg-amber-200/50', border: 'border-amber-200/30' },
    { color: 'text-emerald-700', bg: 'bg-emerald-200/50', border: 'border-emerald-200/30' },
    { color: 'text-violet-700', bg: 'bg-violet-200/50', border: 'border-violet-200/30' },
  ]

  return (
    <div className="!p-2 min-h-screen bg-[#F5F2ED] text-slate-800 font-sans">
      <header className="mb-12">
        <h1 className="text-4xl font-black tracking-tight mb-2 !text-slate-800 !opacity-90">
          Weekly Dashboard
        </h1>
        <p className="text-slate-500 font-medium">A muted, focused view of your week.</p>
      </header>

      <div className="grid grid-cols-7 gap-6 w-full">
        {Array.from({ length: 14 }).map((_, i) => {
          const theme = activities[i % activities.length]

          return (
            <div
              key={i}
              className="group relative aspect-square rounded-[2rem] bg-[#FCFAF7] border border-emerald-600/40 
                         flex flex-col items-center justify-center gap-3 p-6 
                         shadow-sm hover:shadow-md transition-all duration-500 
                         hover:-translate-y-1 cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-2xl ${theme.bg} ${theme.color} 
                              flex items-center justify-center text-lg font-bold 
                              transition-transform duration-500 group-hover:scale-105`}>
                {i + 1}
              </div>

              <div className="text-center">
                <span className="block text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">
                  Step
                </span>
                <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900 transition-colors">
                  Task {i + 1}
                </span>
              </div>

              <div className="flex gap-1.5 mt-1 opacity-40">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-600/40" />
                <div className="w-1.5 h-1.5 rounded-full bg-orange-600/40" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
