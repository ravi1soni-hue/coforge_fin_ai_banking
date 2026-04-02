export class Loan {
    loanId;
    userId;
    type;
    provider;
    emi;
    remainingTenureMonths;
    createdAt;
    updatedAt;
    constructor(loanId, userId, type, provider, emi, remainingTenureMonths, createdAt, updatedAt) {
        this.loanId = loanId;
        this.userId = userId;
        this.type = type;
        this.provider = provider;
        this.emi = emi;
        this.remainingTenureMonths = remainingTenureMonths;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new Loan(props.loanId, props.userId, props.type, props.provider, props.emi, props.remainingTenureMonths, new Date(), new Date());
    }
    update(props) {
        if (props.type)
            this.type = props.type;
        if (props.provider)
            this.provider = props.provider;
        if (props.emi !== undefined)
            this.emi = props.emi;
        if (props.remainingTenureMonths !== undefined)
            this.remainingTenureMonths = props.remainingTenureMonths;
        this.updatedAt = new Date();
    }
}
