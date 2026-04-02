export interface Employment {
  type: string;
  monthlyIncome: number;
  salaryCreditDay: number;
}

export class User {
  constructor(
    public readonly userId: string,
    public name: string,
    public currency: string,
    public country: string,
    public employment: Employment,
    public readonly createdAt?: Date,
    public updatedAt?: Date
  ) {}

  static create(props: {
    userId: string;
    name: string;
    currency: string;
    country: string;
    employment: Employment;
  }): User {
    return new User(
      props.userId,
      props.name,
      props.currency,
      props.country,
      props.employment,
      new Date(),
      new Date()
    );
  }

  update(props: Partial<{
    name: string;
    currency: string;
    country: string;
    employment: Employment;
  }>): void {
    if (props.name) this.name = props.name;
    if (props.currency) this.currency = props.currency;
    if (props.country) this.country = props.country;
    if (props.employment) this.employment = props.employment;
    this.updatedAt = new Date();
  }
}