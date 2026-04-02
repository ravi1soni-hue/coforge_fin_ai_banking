export class SavingsGoal {
  constructor(
    public readonly goalId: string,
    public readonly userId: string,
    public targetAmount: number,
    public targetDate: string,
    public currentSaved: number,
    public status: string,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    goalId: string;
    userId: string;
    targetAmount: number;
    targetDate: string;
    currentSaved: number;
    status: string;
  }): SavingsGoal {
    return new SavingsGoal(
      props.goalId,
      props.userId,
      props.targetAmount,
      props.targetDate,
      props.currentSaved,
      props.status,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    targetAmount: number;
    targetDate: string;
    currentSaved: number;
    status: string;
  }>): void {
    if (props.targetAmount !== undefined) this.targetAmount = props.targetAmount;
    if (props.targetDate) this.targetDate = props.targetDate;
    if (props.currentSaved !== undefined) this.currentSaved = props.currentSaved;
    if (props.status) this.status = props.status;
    this.updatedAt = new Date();
  }
}