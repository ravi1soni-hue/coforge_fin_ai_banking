export type TransactionType = 'CREDIT' | 'DEBIT';

export class Transaction {
  constructor(
    public readonly id: number | undefined,
    public readonly userId: string,
    public date: string,
    public type: TransactionType,
    public category: string,
    public amount: number,
    public readonly createdAt?: Date
  ) {}

  static create(props: {
    userId: string;
    date: string;
    type: TransactionType;
    category: string;
    amount: number;
  }): Transaction {
    return new Transaction(
      undefined,
      props.userId,
      props.date,
      props.type,
      props.category,
      props.amount,
      new Date()
    );
  }
}