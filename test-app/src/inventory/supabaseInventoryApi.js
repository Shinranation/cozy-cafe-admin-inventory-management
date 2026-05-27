export async function insertInventoryTransactionRow(supabase, {
  ingredient_id,
  actualDelta,
  transaction_type,
  reason,
  reference_id,
  cashier_id,
}) {
  const txRow = {
    ingredient_id,
    quantity_change: actualDelta,
    transaction_type,
    reason,
    reference_id,
    cashier_id,
  }

  const { error } = await supabase.from('inventory_transactions').insert(txRow)
  return error
}

export async function insertExpenseRow(supabase, { ingredientName, amount, cashier_id }) {
  const expenseRow = {
    expense_name: `Inventory stock in: ${ingredientName}`,
    amount,
    category: 'Inventory',
    cashier_id,
    notes: 'Created from Inventory Stock In',
  }

  const { error } = await supabase.from('expenses').insert(expenseRow)
  return error
}
