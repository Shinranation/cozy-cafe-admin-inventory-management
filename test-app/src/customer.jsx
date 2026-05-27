import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

function parseRpcJsonArray(data) {
  if (data == null) return []
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function normalizeMenuRows(rows) {
  return rows
    .map((r) => {
      const availabilityStatus = String(r.availability_status ?? 'available')

      return {
        id: Number(r.item_id),
        name: String(r.name ?? ''),
        sizeLabel: String(r.size_label ?? ''),
        description: String(r.description ?? ''),
        category: String(r.category ?? ''),
        price: Number(r.price),
        availabilityStatus,
      }
    })
    .filter(
      (r) =>
        Number.isFinite(r.id) &&
        r.id > 0 &&
        r.availabilityStatus.toLowerCase() === 'available',
    )
}

function mergeMenuRows(primaryRows, fallbackRows) {
  const rowsById = new Map()

  for (const row of fallbackRows) {
    rowsById.set(row.id, row)
  }

  for (const row of primaryRows) {
    rowsById.set(row.id, row)
  }

  return [...rowsById.values()].sort((a, b) => {
    const categoryOrder = a.category.localeCompare(b.category)
    if (categoryOrder !== 0) return categoryOrder
    return a.name.localeCompare(b.name)
  })
}

function splitCategory(category) {
  return String(category || '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

function rootCategory(item) {
  return splitCategory(item.category)[0] || 'Other'
}

function subCategory(item) {
  const parts = splitCategory(item.category)
  return parts.length > 1 ? parts.slice(1).join(' / ') : ''
}

function displayCategory(item) {
  return subCategory(item) || rootCategory(item)
}

function formatPrice(price) {
  return Number.isFinite(price) ? `PHP ${price.toFixed(2)}` : 'PHP --'
}

function firstMenuItem(rows) {
  return [...rows].sort((a, b) => a.id - b.id)[0] ?? null
}

function MenuPreviewVisual({ label, active = false }) {
  return (
    <span
      className={[
        'relative block aspect-[4/3] w-full overflow-hidden rounded-xl border bg-white',
        active ? 'border-white/25 bg-white/10' : 'border-[#D98C5F]/30',
      ].join(' ')}
    >
      <span className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
        <span className="absolute h-[1px] w-full rotate-45 bg-current" />
        <span className="absolute h-[1px] w-full -rotate-45 bg-current" />
      </span>
      <span className="absolute inset-x-3 bottom-3 rounded-lg bg-white/85 px-3 py-2 text-center shadow-sm">
        <span className="block truncate text-xs font-extrabold uppercase tracking-wide text-[#3B2F2A]">
          {label}
        </span>
      </span>
    </span>
  )
}

export default function Customer() {
  const configured = supabaseConfigured()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(configured)
  const [fetchError, setFetchError] = useState(null)
  const [expandedItemId, setExpandedItemId] = useState(null)

  const loadMenu = useCallback(async () => {
    if (!supabase) return
    setFetchError(null)

    const [directResult, rpcResult] = await Promise.all([
      supabase
        .from('menu')
        .select('item_id,name,size_label,description,price,category,availability_status')
        .order('category')
        .order('name'),
      supabase.rpc('get_menu_public'),
    ])

    const directItems = directResult.error ? [] : normalizeMenuRows(directResult.data ?? [])
    const rpcItems = rpcResult.error ? [] : normalizeMenuRows(parseRpcJsonArray(rpcResult.data))
    const nextItems = mergeMenuRows(directItems, rpcItems)

    if (nextItems.length > 0) {
      setItems(nextItems)
      return
    }

    if (directResult.error || rpcResult.error) {
      setFetchError(
        directResult.error?.message ||
          rpcResult.error?.message ||
          'Could not load menu items.',
      )
      setItems([])
      return
    }

    setItems([])
  }, [])

  useEffect(() => {
    if (!configured || !supabase) return
    let cancelled = false
    void (async () => {
      setLoading(true)
      await loadMenu()
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [configured, loadMenu])

  useEffect(() => {
    if (!configured || !supabase) return

    const refreshVisibleMenu = () => {
      if (document.visibilityState === 'visible') {
        void loadMenu()
      }
    }

    window.addEventListener('focus', refreshVisibleMenu)
    document.addEventListener('visibilitychange', refreshVisibleMenu)

    const channel = supabase
      .channel('customer-menu-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu' }, () => {
        void loadMenu()
      })
      .subscribe()

    return () => {
      window.removeEventListener('focus', refreshVisibleMenu)
      document.removeEventListener('visibilitychange', refreshVisibleMenu)
      supabase.removeChannel(channel)
    }
  }, [configured, loadMenu])

  const rootCategoryOptions = useMemo(() => {
    const roots = new Set()

    for (const item of items) {
      roots.add(rootCategory(item))
    }

    return [...roots]
      .map((name) => {
        const rows = items.filter((item) => rootCategory(item) === name)
        return {
        name,
        count: rows.length,
        sample: firstMenuItem(rows),
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [items])

  const [activeRoot, setActiveRoot] = useState('All')
  const [activeSubCategory, setActiveSubCategory] = useState('')
  const [activeDrinkName, setActiveDrinkName] = useState('')
  const [activeSize, setActiveSize] = useState('')

  const subCategoryOptions = useMemo(() => {
    if (activeRoot === 'All') return []

    const groups = new Map()

    for (const item of items) {
      if (rootCategory(item) !== activeRoot) continue
      const name = subCategory(item)
      if (!name) continue
      const existing = groups.get(name) ?? []
      groups.set(name, [...existing, item])
    }

    return [...groups.entries()]
      .map(([name, rows]) => ({
        name,
        count: rows.length,
        sample: firstMenuItem(rows),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activeRoot, items])

  const subCategories = useMemo(
    () => subCategoryOptions.map((option) => option.name),
    [subCategoryOptions],
  )

  const drinkOptions = useMemo(() => {
    if (activeRoot === 'All') return []

    const groups = new Map()

    for (const item of items) {
      if (rootCategory(item) !== activeRoot) continue
      if (activeSubCategory && subCategory(item) !== activeSubCategory) continue
      if (!item.name) continue
      const existing = groups.get(item.name) ?? []
      groups.set(item.name, [...existing, item])
    }

    return [...groups.entries()]
      .map(([name, rows]) => ({
        name,
        count: rows.length,
        sample: firstMenuItem(rows),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [activeRoot, activeSubCategory, items])

  const drinkNames = useMemo(
    () => drinkOptions.map((option) => option.name),
    [drinkOptions],
  )

  const sizes = useMemo(() => {
    if (!activeDrinkName) return []

    return [
      ...new Set(
        items
          .filter((item) => rootCategory(item) === activeRoot)
          .filter((item) => !activeSubCategory || subCategory(item) === activeSubCategory)
          .filter((item) => item.name === activeDrinkName)
          .map((item) => item.sizeLabel)
          .filter(Boolean),
      ),
    ].sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b) || a.localeCompare(b))
  }, [activeDrinkName, activeRoot, activeSubCategory, items])

  const visibleItems = useMemo(() => {
    if (activeRoot === 'All') return []
    if (activeRoot !== 'All' && subCategories.length > 0 && !activeSubCategory) return []
    if (activeRoot !== 'All' && !activeDrinkName) return []

    return items.filter((item) => {
      if (activeRoot !== 'All' && rootCategory(item) !== activeRoot) return false
      if (activeSubCategory && subCategory(item) !== activeSubCategory) return false
      if (activeDrinkName && item.name !== activeDrinkName) return false
      if (activeSize && item.sizeLabel !== activeSize) return false
      return true
    })
  }, [activeDrinkName, activeRoot, activeSize, activeSubCategory, items, subCategories.length])

  const selectionPrompt = useMemo(() => {
    if (activeRoot === 'All') return 'Choose a menu category.'
    if (subCategories.length > 0 && !activeSubCategory) return `Choose a ${activeRoot} type.`
    if (!activeDrinkName) return 'Choose an item.'
    if (sizes.length > 1 && !activeSize) return 'Choose a size or view all sizes.'
    return ''
  }, [activeDrinkName, activeRoot, activeSize, activeSubCategory, sizes.length, subCategories.length])

  function chooseRoot(category) {
    setActiveRoot(category)
    setActiveSubCategory('')
    setActiveDrinkName('')
    setActiveSize('')
    setExpandedItemId(null)
  }

  function goBackToParents() {
    chooseRoot('All')
  }

  function chooseSubCategory(category) {
    setActiveSubCategory(category)
    setActiveDrinkName('')
    setActiveSize('')
    setExpandedItemId(null)
  }

  function goBackToSubCategories() {
    setActiveSubCategory('')
    setActiveDrinkName('')
    setActiveSize('')
    setExpandedItemId(null)
  }

  function chooseDrinkName(name) {
    setActiveDrinkName(name)
    setActiveSize('')
    setExpandedItemId(null)
  }

  function chooseSize(size) {
    setActiveSize(size)
    setExpandedItemId(null)
  }

  function toggleDetails(itemId) {
    setExpandedItemId((currentId) => (currentId === itemId ? null : itemId))
  }

  return (
    <div className="min-h-screen bg-[#F7F0E6] text-[#3B2F2A]">
      <main className="mx-auto max-w-6xl px-10 pb-16">
        <h2 className="py-28 text-center text-7xl font-extrabold tracking-tight text-gray-500/80">
          Promotions
        </h2>

        <section className="mx-auto max-w-4xl">
          <h3 className="mb-10 text-center text-5xl font-extrabold">Menu</h3>

          {!configured && (
            <p className="mb-8 text-center text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Menu is unavailable: configure Supabase URL and anon key for this app.
            </p>
          )}

          {fetchError && (
            <p className="mb-8 text-center text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              {fetchError}
              <button
                type="button"
                className="ml-2 text-xs font-bold underline text-[#D98C5F]"
                onClick={() => void loadMenu()}
              >
                Retry
              </button>
            </p>
          )}

          {loading && configured && (
            <p className="mb-8 text-center text-sm text-black/50" aria-live="polite">
              Loading menu...
            </p>
          )}

          <div className="mx-auto mb-12 max-w-4xl space-y-5">
            {activeRoot === 'All' ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {rootCategoryOptions.map((option) => {
                  const sample = option.sample

                  return (
                    <button
                      key={option.name}
                      type="button"
                      onClick={() => chooseRoot(option.name)}
                      className="rounded-[28px] border border-[#D98C5F]/35 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#D98C5F]/70 hover:bg-[#FFF7F1]/60"
                    >
                      <MenuPreviewVisual label={sample?.name || option.name} />
                      <span className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                        Category
                      </span>
                      <span className="mt-1 block break-words text-2xl font-extrabold leading-tight text-[#3B2F2A]">
                        {option.name}
                      </span>
                      <span className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D98C5F]/20 bg-[#F7F0E6]/70 px-3 py-2 text-xs font-bold text-[#3B2F2A]/65">
                        <span>{option.count} item{option.count !== 1 ? 's' : ''}</span>
                        {sample ? <span className="text-[#D98C5F]">{formatPrice(sample.price)}</span> : null}
                      </span>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D98C5F]/25 bg-white px-5 py-4 shadow-sm">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                    Selected category
                  </p>
                  <p className="mt-1 text-2xl font-extrabold leading-tight text-[#3B2F2A]">
                    {activeRoot}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={goBackToParents}
                  className="rounded-full border border-[#D98C5F]/40 bg-white px-5 py-2.5 text-sm font-extrabold text-[#3B2F2A] transition hover:bg-[#FFF7F1]"
                >
                  Back
                </button>
              </div>
            )}

            {subCategoryOptions.length > 0 && !activeSubCategory ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {subCategoryOptions.map((option) => {
                  const cat = option.name
                  const isActive = activeSubCategory === cat
                  const sample = option.sample

                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => chooseSubCategory(cat)}
                      className={[
                        'rounded-[28px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5',
                        isActive
                          ? 'border-[#D98C5F] bg-[#FFF7F1] ring-2 ring-[#D98C5F]/25'
                          : 'border-[#D98C5F]/35 bg-white hover:border-[#D98C5F]/70 hover:bg-[#FFF7F1]/60',
                      ].join(' ')}
                    >
                      <MenuPreviewVisual label={sample?.name || cat} active={isActive} />
                      <span className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                        {activeRoot}
                      </span>
                      <span className="mt-1 block break-words text-lg font-extrabold leading-tight text-[#3B2F2A]">
                        {cat}
                      </span>
                      {sample ? (
                        <span className="mt-3 block rounded-xl border border-[#D98C5F]/20 bg-white/75 px-3 py-2">
                          <span className="block truncate text-xs font-bold text-[#3B2F2A]">
                            {sample.name}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#3B2F2A]/60">
                            <span>{sample.sizeLabel || `${option.count} item${option.count !== 1 ? 's' : ''}`}</span>
                            <span className="text-[#D98C5F]">{formatPrice(sample.price)}</span>
                          </span>
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {subCategoryOptions.length > 0 && activeSubCategory ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#D98C5F]/25 bg-white px-5 py-4 shadow-sm">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                    Selected type
                  </p>
                  <p className="mt-1 text-2xl font-extrabold leading-tight text-[#3B2F2A]">
                    {activeSubCategory}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={goBackToSubCategories}
                  className="rounded-full border border-[#D98C5F]/40 bg-white px-5 py-2.5 text-sm font-extrabold text-[#3B2F2A] transition hover:bg-[#FFF7F1]"
                >
                  Back
                </button>
              </div>
            ) : null}

            {drinkOptions.length > 0 && (activeSubCategory || subCategories.length === 0) ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {drinkOptions.map((option) => {
                  const name = option.name
                  const isActive = activeDrinkName === name
                  const sample = option.sample

                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => chooseDrinkName(name)}
                      className={[
                        'rounded-[28px] border p-4 text-left shadow-sm transition hover:-translate-y-0.5',
                        isActive
                          ? 'border-[#3B2F2A] bg-[#3B2F2A] text-white'
                          : 'border-black/15 bg-white text-[#3B2F2A] hover:border-[#D98C5F]/70 hover:bg-[#FFF7F1]/60',
                      ].join(' ')}
                    >
                      <MenuPreviewVisual label={name} active={isActive} />
                      <span
                        className={[
                          'mt-4 block text-[10px] font-black uppercase tracking-[0.18em]',
                          isActive ? 'text-white/65' : 'text-[#D98C5F]',
                        ].join(' ')}
                      >
                        {activeSubCategory || activeRoot}
                      </span>
                      <span className="mt-1 block break-words text-base font-extrabold leading-tight">
                        {name}
                      </span>
                      {sample ? (
                        <span
                          className={[
                            'mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold',
                            isActive
                              ? 'border-white/20 bg-white/10 text-white/75'
                              : 'border-[#D98C5F]/20 bg-[#F7F0E6]/70 text-[#3B2F2A]/60',
                          ].join(' ')}
                        >
                          <span>{option.count > 1 ? `${option.count} sizes` : sample.sizeLabel || 'Single item'}</span>
                          <span className={isActive ? 'text-white' : 'text-[#D98C5F]'}>
                            {formatPrice(sample.price)}
                          </span>
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}

            {sizes.length > 1 ? (
              <div className="flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => chooseSize('')}
                  className={[
                    'rounded-full border px-4 py-2 text-xs font-bold transition-colors',
                    activeSize === ''
                      ? 'border-transparent bg-[#3B2F2A] text-white'
                      : 'border-black/20 bg-white text-[#3B2F2A] hover:bg-black/5',
                  ].join(' ')}
                >
                  All sizes
                </button>
                {sizes.map((size) => {
                  const isActive = activeSize === size

                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => chooseSize(size)}
                      className={[
                        'rounded-full border px-4 py-2 text-xs font-bold transition-colors',
                        isActive
                          ? 'border-transparent bg-[#3B2F2A] text-white'
                          : 'border-black/20 bg-white text-[#3B2F2A] hover:bg-black/5',
                      ].join(' ')}
                    >
                      {size}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-3">
            {visibleItems.map((item) => {
              const isExpanded = expandedItemId === item.id

              return (
                <article
                  key={item.id}
                  className="rounded-[28px] border-2 border-[#D98C5F] bg-white p-5"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border-2 border-black/40 bg-white relative">
                    <div className="absolute inset-0 flex items-center justify-center opacity-15 pointer-events-none">
                      <div className="absolute w-full h-[1px] bg-black rotate-45" />
                      <div className="absolute w-full h-[1px] bg-black -rotate-45" />
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xl font-extrabold leading-tight text-[#3B2F2A]">
                        {item.name}
                      </p>

                      {item.category ? (
                        <span className="shrink-0 rounded-full bg-[#F7F0E6] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#3B2F2A]/70">
                          {displayCategory(item)}
                        </span>
                      ) : null}
                    </div>

                    {item.sizeLabel ? (
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-[#3B2F2A]/55">
                        {item.sizeLabel}
                      </p>
                    ) : null}

                    <p className="mt-2 text-lg font-extrabold text-[#D98C5F]">
                      {formatPrice(item.price)}
                    </p>

                    {item.description ? (
                      <p
                        className={[
                          'mt-3 text-sm leading-relaxed text-black/65',
                          isExpanded ? '' : 'line-clamp-3',
                        ].join(' ')}
                      >
                        {item.description}
                      </p>
                    ) : (
                      <p className="mt-3 text-sm leading-relaxed text-black/45">
                        No description added yet.
                      </p>
                    )}

                    <div className="mt-4 border-t border-[#D98C5F]/20 pt-4 text-xs text-black/55">
                      <div className="flex justify-between gap-4">
                        <span>Menu ID</span>
                        <span className="font-bold text-[#3B2F2A]">{item.id}</span>
                      </div>
                      <div className="mt-2 flex justify-between gap-4">
                        <span>Status</span>
                        <span className="font-bold text-[#3B2F2A]">
                          {item.availabilityStatus}
                        </span>
                      </div>
                    </div>

                    {item.description.length > 120 ? (
                      <button
                        type="button"
                        onClick={() => toggleDetails(item.id)}
                        className="mt-4 w-full rounded-full border border-[#D98C5F]/40 px-4 py-2 text-sm font-bold text-[#D98C5F] transition hover:bg-[#D98C5F]/10"
                      >
                        {isExpanded ? 'Show less' : 'More details'}
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>

          {selectionPrompt ? (
            <p className="mt-10 text-center text-sm font-semibold text-black/50">
              {selectionPrompt}
            </p>
          ) : null}

          {!loading && !fetchError && configured && !selectionPrompt && visibleItems.length === 0 && (
            <p className="mt-10 text-center text-sm text-black/50">No items found yet.</p>
          )}
        </section>
      </main>

      <footer className="mt-16">
        <div className="h-[2px] w-full bg-[#1E96AE]" />
      </footer>
    </div>
  )
}
