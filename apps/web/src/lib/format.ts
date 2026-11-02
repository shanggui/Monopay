import type { TransactionCategory, TransactionView } from '@monopay/shared'

export const categoryLabels: Record<TransactionCategory, string> = {
  initial: '初始资金',
  rent: '租金',
  purchase: '购买',
  tax: '税费',
  fine: '罚款',
  chance: '机会/命运',
  mortgage: '抵押/变卖',
  loan: '借款',
  repay: '还款',
  trade: '交易',
  salary: '工资',
  refund: '退款',
  correction: '矫正',
  other: '其他',
}

export const playerCategories: TransactionCategory[] = ['rent', 'trade', 'loan', 'repay', 'other']

export const bankCategories: TransactionCategory[] = ['tax', 'fine', 'purchase', 'chance', 'other']

export function formatMoney(value: number): string {
  return value.toLocaleString('zh-CN')
}

export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function isIncoming(transaction: TransactionView, meId: string): boolean {
  return transaction.toType === 'player' && transaction.toPlayerId === meId
}

export function isOutgoing(transaction: TransactionView, meId: string): boolean {
  return transaction.fromType === 'player' && transaction.fromPlayerId === meId
}
