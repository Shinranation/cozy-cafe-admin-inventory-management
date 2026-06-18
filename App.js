import React, { useState } from 'react';

const CozyCoffeeMenu = () => {
  const [activeCategory, setActiveCategory] = useState("RICE BOWL CHICKEN WINGS");

  return (
    <div className="min-h-screen bg-[#F9F5EB] font-sans text-gray-700">
      {/* Navigation Bar */}
      <nav className="flex justify-between items-center px-8 py-4 bg-white border-b border-cyan-100">
        <h1 className="text-3xl font-extrabold text-cyan-400">The Cozzy Cup Cafe</h1>
        <div className="flex items-center gap-8">
          <a href="#" className="text-orange-400 font-medium border-b-2 border-orange-400">Home</a>
          <a href="#" className="hover:text-cyan-400 transition">Menu</a>
          <a href="#" className="hover:text-cyan-400 transition">About Us</a>
          <div className="w-10 h-10 rounded-full border-2 border-cyan-400 flex items-center justify-center text-cyan-400">
            <span className="text-xl">👤</span>
          </div>
        </div>
      </nav>

      {/* Main Promotions Container */}
      <main className="max-w-6xl mx-auto mt-10 mb-20">
        <div className="bg-white border-2 border-orange-200 rounded-[2rem] p-8 shadow-sm">
          
          <h2 className="text-6xl font-bold text-center text-gray-500 mb-12">Promotions</h2>

          {/* Categories Navigation */}
          <div className="flex flex-wrap justify-center gap-6 mb-4">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`text-[10px] font-bold tracking-wider transition-colors w-24 text-center leading-tight
                  ${activeCategory === cat ? 'text-orange-400 underline underline-offset-4' : 'text-gray-600 hover:text-orange-300'}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Active Title */}
          <div className="text-center mb-10">
             <div className="w-32 h-0.5 bg-cyan-100 mx-auto mb-4"></div>
             <p className="text-sm font-bold text-gray-800 uppercase">Menu</p>
             <h3 className="text-xl font-bold text-orange-400 uppercase">{activeCategory}</h3>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 px-4">
            {menuItems.map((item, index) => (
              <div 
                key={index} 
                className="aspect-square bg-gray-400 rounded-[1.5rem] border-4 border-orange-200 shadow-inner hover:scale-105 transition-transform cursor-pointer"
              >
                {/* Content like images or labels would go here */}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* Footer Branding Area */}
      <footer className="w-full h-32 bg-[#D9C8B1] border-t-2 border-orange-300"></footer>
    </div>
  );
};

export default CozyCoffeeMenu;
