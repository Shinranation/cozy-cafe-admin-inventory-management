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
    <main className="max-w-5xl mx-auto my-10 px-4">
      <div className="bg-white border-2 border-[#D98C5F]/30 rounded-[2.5rem] p-10 shadow-sm relative">
        <h2 className="text-7xl font-bold text-center text-gray-400/80 mb-12 tracking-tight">
          Promotions
        </h2>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 mb-8 px-6">
          {MENU_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`min-h-12 w-24 rounded-xl border px-3 py-2 text-center text-[10px] font-black leading-tight tracking-tighter uppercase shadow-sm transition-all
                  ${activeCategory === cat ? 'border-[#D98C5F] bg-[#FFF7F1] text-[#D98C5F]' : 'border-gray-200 bg-white text-gray-600 hover:border-[#D98C5F]/50 hover:bg-[#FFF7F1]'}`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="text-center mb-10">
          <div className="w-24 h-[3px] bg-cyan-100 mx-auto mb-4" />
          <p className="text-[10px] font-bold text-gray-900 uppercase">Menu</p>
          <h3 className="text-lg font-black text-[#D98C5F] uppercase">{activeCategory}</h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-gray-400 rounded-[1.8rem] border-[3px] border-[#D98C5F]/30 hover:scale-[1.02] transition-transform"
            />
          ))}
        </div>
      </div>
    </main>
  )
}
