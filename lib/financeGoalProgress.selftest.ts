// lib/financeGoalProgress.selftest.ts
export {};

async function main() {
  const { computeGoalProgress } = await import('./financeGoalProgress');

  let failures = 0;
  function assert(cond: boolean, msg: string) {
    if (!cond) {
      failures++;
      console.error(`FAIL: ${msg}`);
    } else {
      console.log(`OK: ${msg}`);
    }
  }

  const baseGoal = { id: '1', label: 'Test', category: null, targetDate: null, createdAt: new Date(2026, 0, 1).toISOString() };

  // savings_target
  const savingsItems = [
    { type: 'income', category: 'salary', amount: 3000, date: new Date(2026, 0, 5) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 6) },
  ];
  const savingsGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 5000 };
  const savingsProgress = computeGoalProgress(savingsGoal, savingsItems, []);
  assert(savingsProgress.current === 2000, `savings_target current = income - expense (got ${savingsProgress.current})`);
  assert(savingsProgress.pct === 40, `savings_target pct = 40 (got ${savingsProgress.pct})`);

  // spending_cap, category-scoped
  const spendingItems = [
    { type: 'expense', category: 'groceries', amount: 150, date: new Date(2026, 0, 10) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 10) },
  ];
  const spendingGoal = { ...baseGoal, goalType: 'spending_cap', category: 'groceries', targetValue: 300 };
  const spendingProgress = computeGoalProgress(spendingGoal, [], spendingItems);
  assert(spendingProgress.current === 150, `spending_cap only counts the goal's category (got ${spendingProgress.current})`);

  // spending_cap, no category (total expense)
  const totalCapGoal = { ...baseGoal, goalType: 'spending_cap', category: null, targetValue: 2000 };
  const totalCapProgress = computeGoalProgress(totalCapGoal, [], spendingItems);
  assert(totalCapProgress.current === 1150, `spending_cap with no category sums all expense (got ${totalCapProgress.current})`);

  // debt_payoff
  const debtItems = [
    { type: 'expense', category: 'debt_payment', amount: 500, date: new Date(2026, 0, 15) },
    { type: 'expense', category: 'rent', amount: 1000, date: new Date(2026, 0, 15) },
  ];
  const debtGoal = { ...baseGoal, goalType: 'debt_payoff', targetValue: 2000 };
  const debtProgress = computeGoalProgress(debtGoal, debtItems, []);
  assert(debtProgress.current === 500, `debt_payoff only counts debt_payment category (got ${debtProgress.current})`);
  assert(debtProgress.pct === 25, `debt_payoff pct = 25 (got ${debtProgress.pct})`);

  // investment_contribution
  const investItems = [
    { type: 'expense', category: 'investment_contribution', amount: 400, date: new Date(2026, 0, 1) },
  ];
  const investGoal = { ...baseGoal, goalType: 'investment_contribution', targetValue: 500 };
  const investProgress = computeGoalProgress(investGoal, [], investItems);
  assert(investProgress.current === 400, `investment_contribution counts this month's contributions (got ${investProgress.current})`);
  assert(investProgress.pct === 80, `investment_contribution pct = 80 (got ${investProgress.pct})`);

  // pct clamped when target is 0 (never divides by zero)
  const zeroTargetGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 0 };
  const zeroProgress = computeGoalProgress(zeroTargetGoal, savingsItems, []);
  assert(zeroProgress.pct === 0, `pct clamps to 0 when target is 0 (got ${zeroProgress.pct})`);

  // pct clamped at 100 even if current exceeds target
  const overGoal = { ...baseGoal, goalType: 'savings_target', targetValue: 1000 };
  const overProgress = computeGoalProgress(overGoal, savingsItems, []);
  assert(overProgress.pct === 100, `pct clamps at 100 when current exceeds target (got ${overProgress.pct})`);

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log('\nAll financeGoalProgress assertions passed');
}

main();
