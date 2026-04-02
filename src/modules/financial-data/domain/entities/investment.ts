export class Investment {
  constructor(
    public readonly id: number | undefined,
    public readonly userId: string,
    public type: string,
    public provider: string,
    public currentValue: number,
    public monthlyContribution: number,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    userId: string;
    type: string;
    provider: string;
    currentValue: number;
    monthlyContribution: number;
  }): Investment {
    return new Investment(
      undefined,
      props.userId,
      props.type,
      props.provider,
      props.currentValue,
      props.monthlyContribution,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    type: string;
    provider: string;
    currentValue: number;
    monthlyContribution: number;
  }>): void {
    if (props.type) this.type = props.type;
    if (props.provider) this.provider = props.provider;
    if (props.currentValue !== undefined) this.currentValue = props.currentValue;
    if (props.monthlyContribution !== undefined) this.monthlyContribution = props.monthlyContribution;
    this.updatedAt = new Date();
  }
}