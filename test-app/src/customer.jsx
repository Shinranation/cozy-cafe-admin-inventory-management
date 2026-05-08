import React, { useMemo, useState } from "react";

export default function Customer() {
  const categories = useMemo(
    () => [
      "All",
      "Rice Bowl Chicken Wings",
      "French Fries",
      "Others",
      "Waffles",
      "Soft Drinks",
      "Korean Rice Bowls",
      "Sandwiches",
      "Silog Bowls",
    ],
    []
  );

  const itemsFromDb = useMemo(
    () => [
      {
        id: "item-1",
        name: "Sample Item",
        category: "All",
        imageUrl: "",
        price: null,
      },
    ],
    []
  );

  const [activeCategory, setActiveCategory] = useState("All");

  const visibleItems = useMemo(() => {
    if (activeCategory === "All") return itemsFromDb;
    return itemsFromDb.filter((item) => item.category === activeCategory);
  }, [activeCategory, itemsFromDb]);

  return (
    <div className="min-h-screen bg-[#F7F0E6] text-[#3B2F2A]">

      <main className="mx-auto max-w-6xl px-10 pb-16">
        <h2 className="py-28 text-center text-7xl font-extrabold tracking-tight text-gray-500/80">
          Promotions
        </h2>

        <section className="mx-auto max-w-4xl">
          <h3 className="mb-10 text-center text-5xl font-extrabold">Menu</h3>

          <div className="mx-auto mb-12 flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-5">
            {categories.map((cat) => {
              const isActive = activeCategory === cat;

              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategory(cat)}
                  className={[
                    "rounded-full border px-7 py-3 text-sm font-semibold transition-colors",
                    isActive
                      ? "border-transparent bg-[#3B2F2A] text-white"
                      : "border-black/50 bg-white text-[#3B2F2A] hover:bg-black/5",
                  ].join(" ")}
                >
                  {cat}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => (
              <article
                key={item.id}
                // reduced padding + made card height shrink to content
                className="rounded-[28px] border-2 border-[#D98C5F] bg-white p-5"
              >
                {/* Image (force inner box to WHITE) */}
                <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-black/40 bg-white">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    // Empty image placeholder (still white)
                    <div className="flex h-full w-full items-center justify-center bg-white">
                      <img
                        src="https://via.placeholder.com/150"
                        alt="No image available"
                      />
                    </div>
                  )}
                </div>

                {/* Bigger name + more noticeable price */}
                <div className="mt-4">
                  <p className="text-xl font-extrabold leading-tight text-[#3B2F2A]">
                    {item.name}
                  </p>
                  <p className="mt-1 text-lg font-extrabold text-[#D98C5F]">
                    {item.price != null
                      ? `₱${Number(item.price).toFixed(2)}`
                      : "₱—"}
                  </p>
                </div>

                {/* Removed the big spacer to avoid too much white space */}
              </article>
            ))}
          </div>

          {visibleItems.length === 0 && (
            <p className="mt-10 text-center text-sm text-black/50">
              No items found in this category yet.
            </p>
          )}
        </section>
      </main>

      <footer className="mt-16">
        <div className="h-[2px] w-full bg-[#1E96AE]" />
      </footer>
    </div>
  );
}