export class Subscription {
  constructor(
    public readonly id: number | undefined,
    public readonly userId: string,
    public name: string,
    public amount: number,
    public cycle: string,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    userId: string;
    name: string;
    amount: number;
    cycle: string;
  }): Subscription {
    return new Subscription(
      undefined,
      props.userId,
      props.name,
      props.amount,
      props.cycle,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    name: string;
    amount: number;
    cycle: string;
  }>): void {
    if (props.name) this.name = props.name;
    if (props.amount !== undefined) this.amount = props.amount;
    if (props.cycle) this.cycle = props.cycle;
    this.updatedAt = new Date();
  }
}