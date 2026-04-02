export class Loan {
  constructor(
    public readonly loanId: string,
    public readonly userId: string,
    public type: string,
    public provider: string,
    public emi: number,
    public remainingTenureMonths: number,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    loanId: string;
    userId: string;
    type: string;
    provider: string;
    emi: number;
    remainingTenureMonths: number;
  }): Loan {
    return new Loan(
      props.loanId,
      props.userId,
      props.type,
      props.provider,
      props.emi,
      props.remainingTenureMonths,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    type: string;
    provider: string;
    emi: number;
    remainingTenureMonths: number;
  }>): void {
    if (props.type) this.type = props.type;
    if (props.provider) this.provider = props.provider;
    if (props.emi !== undefined) this.emi = props.emi;
    if (props.remainingTenureMonths !== undefined) this.remainingTenureMonths = props.remainingTenureMonths;
    this.updatedAt = new Date();
  }
}