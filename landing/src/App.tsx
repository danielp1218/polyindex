import { Sidebar } from './components/Sidebar';
import { BalanceCard } from './components/BalanceCard';
import { BetsList } from './components/BetsList';
import { IndexTable } from './components/IndexTable';

function App() {
  return (
    <div className="h-screen bg-[#111d2e] overflow-hidden relative">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-[#111d2e]/95 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-[1400px] mx-auto h-full px-8 flex items-center justify-between">
          <span className="text-white font-serif text-xl font-bold italic">PolyIndex</span>
          <div className="flex items-center gap-4">
            <a href="#" className="text-sm text-gray-400 hover:text-white">Log in</a>
            <button className="px-4 py-1.5 bg-transparent border border-white/20 text-white rounded-lg text-sm font-medium hover:bg-white/5">
              Get Started
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="pt-14 h-screen relative">
        <div className="max-w-[1400px] mx-auto px-8 py-4 h-[calc(100vh-56px)] flex flex-col">
          {/* Dashboard Layout */}
          <div className="flex gap-6 flex-1 min-h-0">
            {/* Left Sidebar */}
            <div className="border-r border-white/10">
              <Sidebar />
            </div>

            {/* Right Content */}
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {/* Top Row: Balance + Bets */}
              <div className="flex gap-4 items-stretch flex-1 min-h-0">
                <div className="flex-[3] min-w-0">
                  <BalanceCard />
                </div>
                <div className="flex-[2] min-w-0">
                  <BetsList />
                </div>
              </div>

              {/* Bottom: Index Table with fade */}
              <div className="relative flex-1 min-h-0 overflow-hidden">
                <IndexTable />
                {/* Fade overlay */}
                <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#111d2e] via-[#111d2e]/80 to-transparent pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Hero Text Overlay */}
          <div className="absolute bottom-24 left-8 right-8 pointer-events-none">
            <div className="max-w-[1400px] mx-auto pl-12">
              <div className="mb-6">
                <h1 className="text-5xl md:text-6xl text-white font-serif leading-tight">
                  A <span className="italic">higher standard</span>
                </h1>
                <h1 className="text-5xl md:text-6xl text-white font-serif leading-tight">
                  in Polymarket betting.
                </h1>
                <p className="text-gray-400 mt-4 text-lg">
                  Diversify your risk, creating your own index funds of literally anything.
                </p>
              </div>

              {/* Chrome Download Button - Centered */}
              <div className="flex justify-center">
                <button className="pointer-events-auto flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white/90 font-medium hover:bg-white/15 hover:border-white/30 transition-all duration-200 shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
                  <img src="/chrome.png" alt="Chrome" className="w-8 h-5 rounded-full" />
                  Download for Chrome
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
