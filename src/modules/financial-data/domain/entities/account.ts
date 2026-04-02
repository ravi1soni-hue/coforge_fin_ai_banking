export class Account {
  constructor(
    public readonly accountId: string,
    public readonly userId: string,
    public type: string,
    public bank: string,
    public balance: number,
    public averageMonthlyBalance: number | null,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    accountId: string;
    userId: string;
    type: string;
    bank: string;
    balance: number;
    averageMonthlyBalance?: number;
  }): Account {
    return new Account(
      props.accountId,
      props.userId,
      props.type,
      props.bank,
      props.balance,
      props.averageMonthlyBalance || null,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    type: string;
    bank: string;
    balance: number;
    averageMonthlyBalance: number;
  }>): void {
    if (props.type) this.type = props.type;
    if (props.bank) this.bank = props.bank;
    if (props.balance !== undefined) this.balance = props.balance;
    if (props.averageMonthlyBalance !== undefined) this.averageMonthlyBalance = props.averageMonthlyBalance;
    this.updatedAt = new Date();
  }
}