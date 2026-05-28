import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase, supabaseConfigured, defaultPosCashierId } from './lib/supabaseClient.js'

/** @typedef {{ item_id: number, name: string, size_label: string, price: number, category: string, availability_status: string, has_recipe: boolean }} MenuItemRow */

function menuItemLabel(item) {
  return item.size_label ? `${item.name} (${item.size_label})` : item.name
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

function firstMenuItem(rows) {
  return [...rows].sort((a, b) => a.item_id - b.item_id)[0] ?? null
}

function formatPrice(price) {
  return Number.isFinite(price) ? `PHP ${price.toFixed(2)}` : 'PHP --'
}

function sortSizeLabels(a, b) {
  return Number.parseFloat(a) - Number.parseFloat(b) || a.localeCompare(b)
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

export default function NewOrder({ onBack, onCancel }) {
  const configured = supabaseConfigured()
  const [items, setItems] = useState(/** @type {MenuItemRow[]} */ ([]))
  const [menuLoading, setMenuLoading] = useState(configured)
  const [menuError, setMenuError] = useState(/** @type {string | null} */ (null))

  const [activeRoot, setActiveRoot] = useState('All')
  const [activeSubCategory, setActiveSubCategory] = useState('')
  const [activeMenuName, setActiveMenuName] = useState('')
  const [activeSize, setActiveSize] = useState('')
  /** cart: menu item_id -> qty */
  const [qty, setQty] = useState(/** @type {Record<number, number>} */ ({}))
  const [stockMessage, setStockMessage] = useState(/** @type {string | null} */ (null))
  const [confirmError, setConfirmError] = useState(/** @type {string | null} */ (null))
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [guestDisplayName, setGuestDisplayName] = useState('')

  const loadMenu = useCallback(async () => {
    if (!supabase) return
    setMenuError(null)
    setMenuLoading(true)

    const { data, error } = await supabase
      .from('menu')
      .select('item_id,name,size_label,price,category,availability_status')
      .order('category')
      .order('name')

    if (error) {
      setMenuError(error.message)
      setItems([])
      setMenuLoading(false)
      return
    }

    const menuIds = (data ?? [])
      .map((r) => Number(r.item_id))
      .filter((id) => Number.isFinite(id) && id > 0)
    const recipeMenuIds = new Set()

    if (menuIds.length > 0) {
      const { data: recipeRows, error: recipeError } = await supabase
        .from('menu_ingredients')
        .select('menu_item_id')
        .in('menu_item_id', menuIds)

      if (!recipeError) {
        for (const row of recipeRows ?? []) {
          const id = Number(row.menu_item_id)
          if (Number.isFinite(id)) recipeMenuIds.add(id)
        }
      }
    }

    setItems(
      (data ?? [])
        .map((r) => ({
          item_id: Number(r.item_id),
          name: String(r.name ?? ''),
          size_label: String(r.size_label ?? ''),
          price: Number(r.price) || 0,
          category: String(r.category ?? ''),
          availability_status: String(r.availability_status ?? ''),
          has_recipe: recipeMenuIds.has(Number(r.item_id)),
        }))
        .filter(
          (r) =>
            Number.isFinite(r.item_id) &&
            r.item_id > 0 &&
            r.availability_status.toLowerCase() === 'available',
        ),
    )
    setMenuLoading(false)
  }, [])

  useEffect(() => {
    if (!configured || !supabase) return
    const timeoutId = window.setTimeout(() => {
      void loadMenu()
    }, 0)

    return () => window.clearTimeout(timeoutId)
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

  const menuNameOptions = useMemo(() => {
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

  const sizes = useMemo(() => {
    if (!activeMenuName) return []

    return [
      ...new Set(
        items
          .filter((item) => rootCategory(item) === activeRoot)
          .filter((item) => !activeSubCategory || subCategory(item) === activeSubCategory)
          .filter((item) => item.name === activeMenuName)
          .map((item) => item.size_label)
          .filter(Boolean),
      ),
    ].sort(sortSizeLabels)
  }, [activeMenuName, activeRoot, activeSubCategory, items])

  const visibleItems = useMemo(() => {
    if (activeRoot === 'All') return []
    if (subCategories.length > 0 && !activeSubCategory) return []
    if (!activeMenuName) return []

    return items.filter((item) => {
      if (rootCategory(item) !== activeRoot) return false
      if (activeSubCategory && subCategory(item) !== activeSubCategory) return false
      if (item.name !== activeMenuName) return false
      if (activeSize && item.size_label !== activeSize) return false
      return true
    })
  }, [activeMenuName, activeRoot, activeSize, activeSubCategory, items, subCategories.length])

  const selectionPrompt = useMemo(() => {
    if (activeRoot === 'All') return 'Choose a menu category.'
    if (subCategories.length > 0 && !activeSubCategory) return `Choose a ${activeRoot} type.`
    if (!activeMenuName) return 'Choose an item.'
    if (sizes.length > 1 && !activeSize) return 'Choose a size or view all sizes.'
    return ''
  }, [activeMenuName, activeRoot, activeSize, activeSubCategory, sizes.length, subCategories.length])

  const orderList = useMemo(() => {
    const byId = new Map(items.map((i) => [i.item_id, i]))
    return Object.entries(qty)
      .map(([id, n]) => {
        const item = byId.get(Number(id))
        if (!item) return null
        return {
          id: item.item_id,
          name: menuItemLabel(item),
          price: item.price,
          qty: n,
          hasRecipe: item.has_recipe,
          lineTotal: item.price * n,
        }
      })
      .filter(Boolean)
  }, [qty, items])

  const totalItems = useMemo(() => Object.values(qty).reduce((sum, n) => sum + n, 0), [qty])

  const totalPrice = useMemo(() => orderList.reduce((sum, row) => sum + row.lineTotal, 0), [orderList])

  function inc(item) {
    setStockMessage(null)
    setConfirmError(null)
    const id = item.item_id
    const cur = qty[id] ?? 0
    setQty((prev) => ({ ...prev, [id]: cur + 1 }))
  }

  function dec(id) {
    setStockMessage(null)
    setConfirmError(null)
    setQty((prev) => {
      const next = Math.max(0, (prev[id] ?? 0) - 1)
      const copy = { ...prev }
      if (next === 0) delete copy[id]
      else copy[id] = next
      return copy
    })
  }

  async function handleConfirmOrder() {
    if (!supabase || totalItems === 0) return
    setConfirmError(null)
    setStockMessage(null)
    setConfirmBusy(true)

    const p_lines = orderList.map((row) => ({
      menu_item_id: row.id,
      quantity: row.qty,
    }))

    const { error } = await supabase.rpc('confirm_pos_order', {
      p_cashier_id: defaultPosCashierId(),
      p_client_id: null,
      p_guest_display_name: guestDisplayName.trim() || null,
      p_lines,
    })

    setConfirmBusy(false)
    if (error) {
      const msg = error.message ?? String(error)
      if (msg.includes('NO_RECIPE')) {
        setConfirmError('The database is still using the old recipe-required order function. Run the allow-orders-without-recipe SQL migration, then retry this order.')
      } else if (msg.includes('ARCHIVED_INGREDIENT')) {
        setConfirmError('One or more menu recipes use archived ingredients. Update the recipe links in Inventory > Menu Item.')
      } else if (msg.includes('inventory_ingredient_id is null')) {
        setConfirmError('Order function is outdated. Run the menu_ingredients order SQL migration so orders use recipe ingredients.')
      } else if (msg.includes('INSUFFICIENT_STOCK')) {
        setConfirmError(msg.replace(/^.*INSUFFICIENT_STOCK:\s*/i, ''))
      } else {
        setConfirmError(msg)
      }
      return
    }

    setQty({})
    setGuestDisplayName('')
    onBack?.()
  }

  function chooseRoot(category) {
    setActiveRoot(category)
    setActiveSubCategory('')
    setActiveMenuName('')
    setActiveSize('')
  }

  function goBackToParents() {
    chooseRoot('All')
  }

  function chooseSubCategory(category) {
    setActiveSubCategory(category)
    setActiveMenuName('')
    setActiveSize('')
  }

  function goBackToSubCategories() {
    setActiveSubCategory('')
    setActiveMenuName('')
    setActiveSize('')
  }

  function chooseMenuName(name) {
    setActiveMenuName(name)
    setActiveSize('')
  }

  function goBackToMenuNames() {
    setActiveMenuName('')
    setActiveSize('')
  }

  function chooseSize(size) {
    setActiveSize(size)
  }

  return (
    <main className="min-h-screen bg-[#FDFBF4] px-4 py-10 font-sans text-gray-700">
      <div className="mx-auto max-w-[90rem]">
        <header className="mb-10 text-center">
          <h1 className="text-6xl md:text-7xl font-bold text-gray-500/80 leading-tight">New Order</h1>
          {onCancel && (
            <button
              type="button"
              onClick={() => onCancel()}
              className="mt-4 text-sm font-bold text-[#D98C5F] underline hover:opacity-90"
            >
              ← Back to queue
            </button>
          )}
        </header>

        {!configured && (
          <p className="mb-6 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            Supabase is not configured. Set <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
            <code className="text-xs bg-white px-1 rounded">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        )}

        {menuError && (
          <p className="mb-6 text-center text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {menuError}
            <button
              type="button"
              className="ml-2 text-xs font-bold underline text-[#D98C5F]"
              onClick={() => void loadMenu()}
            >
              Retry
            </button>
          </p>
        )}

        {(stockMessage || confirmError) && (
          <div
            className="mb-6 text-center text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"
            role="alert"
          >
            {stockMessage ?? confirmError}
          </div>
        )}

        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">

          <section>
            {menuLoading && (
              <p className="text-center text-gray-500 text-sm py-12" aria-live="polite">
                Loading menu…
              </p>
            )}
            {!menuLoading && items.length === 0 && !menuError && (
              <p className="text-center text-gray-500 text-sm py-12">No menu items returned.</p>
            )}

            {!menuLoading && items.length > 0 && (
              <div className="mb-8 space-y-5">
                {activeRoot === 'All' ? (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
                      const sample = option.sample

                      return (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => chooseSubCategory(option.name)}
                          className="rounded-[28px] border border-[#D98C5F]/35 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#D98C5F]/70 hover:bg-[#FFF7F1]/60"
                        >
                          <MenuPreviewVisual label={sample?.name || option.name} />
                          <span className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                            {activeRoot}
                          </span>
                          <span className="mt-1 block break-words text-lg font-extrabold leading-tight text-[#3B2F2A]">
                            {option.name}
                          </span>
                          {sample ? (
                            <span className="mt-3 block rounded-xl border border-[#D98C5F]/20 bg-white/75 px-3 py-2">
                              <span className="block truncate text-xs font-bold text-[#3B2F2A]">
                                {sample.name}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[#3B2F2A]/60">
                                <span>{sample.size_label || `${option.count} item${option.count !== 1 ? 's' : ''}`}</span>
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

                {menuNameOptions.length > 0 && (activeSubCategory || subCategories.length === 0) && !activeMenuName ? (
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {menuNameOptions.map((option) => {
                      const sample = option.sample

                      return (
                        <button
                          key={option.name}
                          type="button"
                          onClick={() => chooseMenuName(option.name)}
                          className="rounded-[28px] border border-black/15 bg-white p-4 text-left text-[#3B2F2A] shadow-sm transition hover:-translate-y-0.5 hover:border-[#D98C5F]/70 hover:bg-[#FFF7F1]/60"
                        >
                          <MenuPreviewVisual label={option.name} />
                          <span className="mt-4 block text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                            {activeSubCategory || activeRoot}
                          </span>
                          <span className="mt-1 block break-words text-base font-extrabold leading-tight">
                            {option.name}
                          </span>
                          {sample ? (
                            <span className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#D98C5F]/20 bg-[#F7F0E6]/70 px-3 py-2 text-xs font-bold text-[#3B2F2A]/60">
                              <span>{option.count > 1 ? `${option.count} sizes` : sample.size_label || 'Single item'}</span>
                              <span className="text-[#D98C5F]">{formatPrice(sample.price)}</span>
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}

                {activeMenuName ? (
                  <div className="rounded-2xl border border-[#D98C5F]/25 bg-white px-5 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#D98C5F]">
                          Selected item
                        </p>
                        <p className="mt-1 text-2xl font-extrabold leading-tight text-[#3B2F2A]">
                          {activeMenuName}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={goBackToMenuNames}
                        className="rounded-full border border-[#D98C5F]/40 bg-white px-5 py-2.5 text-sm font-extrabold text-[#3B2F2A] transition hover:bg-[#FFF7F1]"
                      >
                        Back
                      </button>
                    </div>

                    {sizes.length > 1 ? (
                      <div className="mt-4 flex flex-wrap gap-3">
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
                ) : null}
              </div>
            )}

            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {visibleItems.map((item) => {
                const count = qty[item.item_id] ?? 0
                return (
                  <article
                    key={item.item_id}
                    className="bg-white border border-gray-400/40 shadow-sm rounded-2xl p-4"
                  >
                    <p className="text-center text-xs font-extrabold tracking-wide text-gray-700 uppercase">
                      {item.name}
                    </p>
                    {item.size_label && (
                      <p className="mt-1 text-center text-[10px] font-bold uppercase text-gray-500">
                        {item.size_label}
                      </p>
                    )}

                    <div className="mt-3 aspect-square w-full rounded-xl border border-gray-300 bg-white relative overflow-hidden">
                      <div className="absolute inset-0 flex items-center justify-center opacity-20">
                        <div className="absolute w-full h-[1px] bg-black rotate-45" />
                        <div className="absolute w-full h-[1px] bg-black -rotate-45" />
                      </div>
                    </div>

                    <p className="mt-3 text-center text-sm font-extrabold text-gray-700">₱{item.price.toFixed(2)}</p>
                    {!item.has_recipe ? (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] font-bold text-amber-800">
                        No recipe linked. Stock will not be deducted.
                      </p>
                    ) : null}
                    <div className="mt-3 flex items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={() => inc(item)}
                        disabled={!configured}
                        className="grid h-8 w-10 place-items-center rounded-lg border border-[#D98C5F]/40 bg-[#D98C5F]/10 text-[#D98C5F] font-extrabold hover:bg-[#D98C5F]/15 disabled:opacity-40 disabled:cursor-not-allowed"
                        aria-label={`Add ${item.name}`}
                      >
                        +
                      </button>

                      <span className="min-w-8 text-center font-bold text-gray-700">{count}</span>

                      <button
                        type="button"
                        onClick={() => dec(item.item_id)}
                        className="grid h-8 w-10 place-items-center rounded-lg border border-gray-400/40 bg-black/5 text-gray-700 font-extrabold hover:bg-black/10"
                        aria-label={`Remove ${item.name}`}
                        disabled={count === 0}
                      >
                        −
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>

            {selectionPrompt ? (
              <p className="mt-10 text-center text-sm font-semibold text-gray-500">
                {selectionPrompt}
              </p>
            ) : null}

            {!menuLoading && !menuError && configured && !selectionPrompt && visibleItems.length === 0 && (
              <p className="mt-10 text-center text-sm text-gray-500">No items found yet.</p>
            )}
          </section>

          <aside className="xl:sticky xl:top-6 h-fit">
            <div className="bg-white border border-gray-400/40 shadow-sm rounded-2xl p-5">
              <h2 className="text-lg font-extrabold text-gray-700">Order List</h2>

              <label className="mt-3 block text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                Customer name (optional)
                <input
                  type="text"
                  value={guestDisplayName}
                  onChange={(e) => setGuestDisplayName(e.target.value)}
                  placeholder="Walk-in guest"
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-normal text-gray-800"
                  maxLength={120}
                />
              </label>

              <div className="mt-4 max-h-[420px] overflow-auto pr-1">
                {orderList.length === 0 ? (
                  <p className="text-sm text-gray-500">No items added yet. Use the + button to add items.</p>
                ) : (
                  <ul className="space-y-3">
                    {orderList.map((row) => (
                      <li
                        key={row.id}
                        className="flex items-start justify-between gap-3 rounded-xl border border-gray-400/30 p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-gray-700 truncate">{row.name}</p>
                          <p className="text-xs text-gray-500">
                            ₱{row.price.toFixed(2)} × {row.qty}
                          </p>
                          {!row.hasRecipe ? (
                            <p className="mt-1 text-[11px] font-bold text-amber-700">
                              No stock deduction
                            </p>
                          ) : null}
                        </div>

                        <p className="shrink-0 font-extrabold text-gray-800">₱{row.lineTotal.toFixed(2)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-600">
                  {totalItems} {totalItems === 1 ? 'item' : 'items'} added
                </p>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-lg font-extrabold text-gray-800">TOTAL:</p>
                  <p className="text-lg font-extrabold text-gray-800">₱{totalPrice.toFixed(2)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleConfirmOrder()}
                  disabled={totalItems === 0 || confirmBusy || !configured || menuLoading}
                  className={[
                    'mt-4 w-full rounded-full px-8 py-4 font-extrabold shadow-md transition',
                    totalItems === 0 || confirmBusy || !configured || menuLoading
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                      : 'bg-[#D98C5F] text-white hover:opacity-90',
                  ].join(' ')}
                >
                  {confirmBusy ? 'Saving…' : 'Confirm Order'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
