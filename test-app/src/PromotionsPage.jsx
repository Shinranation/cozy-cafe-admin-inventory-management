import { useState } from 'react'

const MENU_CATEGORIES = [
  'RICE BOWL CHICKEN WINGS',
  'FRENCH FRIES',
  'SOFT DRINKS',
  'SANDWICHES',
  'WAFFLES',
  'OTHERS',
  'KOREAN RICE BOWLS',
  'SILOG BOWLS',
]

export default function PromotionsPage() {
  const [activeCategory, setActiveCategory] = useState(MENU_CATEGORIES[0])

  return (
    <main className="mx-auto my-6 max-w-5xl px-3 sm:my-10 sm:px-4">
      <div className="relative rounded-2xl border border-[#D98C5F]/30 bg-white p-4 shadow-sm sm:rounded-[2.5rem] sm:border-2 sm:p-10">
        <h2 className="mb-6 text-center text-4xl font-bold tracking-tight text-gray-400/80 sm:mb-12 sm:text-7xl">
          Promotions
        </h2>

        <div className="mb-6 flex flex-wrap justify-center gap-2 px-0 sm:mb-8 sm:gap-x-6 sm:gap-y-3 sm:px-6">
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`min-h-10 w-20 rounded-xl border px-2 py-1.5 text-center text-[9px] font-black uppercase leading-tight tracking-tighter shadow-sm transition-all sm:min-h-12 sm:w-24 sm:px-3 sm:py-2 sm:text-[10px]
                  ${activeCategory === cat ? 'border-[#D98C5F] bg-[#FFF7F1] text-[#D98C5F]' : 'border-gray-200 bg-white text-gray-600 hover:border-[#D98C5F]/50 hover:bg-[#FFF7F1]'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="mb-6 text-center sm:mb-10">
          <div className="w-24 h-[3px] bg-cyan-100 mx-auto mb-4" />
          <p className="text-[10px] font-bold text-gray-900 uppercase">Menu</p>
          <h3 className="text-lg font-black text-[#D98C5F] uppercase">{activeCategory}</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 md:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl border-2 border-[#D98C5F]/30 bg-gray-400 transition-transform hover:scale-[1.02] sm:rounded-[1.8rem] sm:border-[3px]"
            />
          ))}
        </div>
      </div>
    </main>
  )
}
