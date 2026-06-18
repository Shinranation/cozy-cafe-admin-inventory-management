export async function createInventoryIngredient(supabase, {
  name,
  classification,
  current_quantity,
  unit_of_measure,
  low_stock,
  total_cost,
  reference_id,
  cashier_id,
}) {
  return supabase.rpc('create_inventory_ingredient', {
    p_name: name,
    p_classification: classification || null,
    p_current_quantity: current_quantity,
    p_unit_of_measure: unit_of_measure,
    p_low_stock: low_stock,
    p_total_cost: total_cost,
    p_reference_id: reference_id,
    p_cashier_id: cashier_id,
  })
}

export async function applyInventoryStockMovement(supabase, {
  ingredient_id,
  quantity_change,
  transaction_type,
  reason,
  reference_id,
  cashier_id,
  expense_amount = 0,
}) {
  return supabase.rpc('apply_inventory_stock_movement', {
    p_ingredient_id: ingredient_id,
    p_quantity_change: quantity_change,
    p_transaction_type: transaction_type,
    p_reason: reason,
    p_reference_id: reference_id,
    p_cashier_id: cashier_id,
    p_expense_amount: expense_amount,
  })
}
