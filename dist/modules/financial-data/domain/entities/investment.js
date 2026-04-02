export class Investment {
    id;
    userId;
    type;
    provider;
    currentValue;
    monthlyContribution;
    createdAt;
    updatedAt;
    constructor(id, userId, type, provider, currentValue, monthlyContribution, createdAt, updatedAt) {
        this.id = id;
        this.userId = userId;
        this.type = type;
        this.provider = provider;
        this.currentValue = currentValue;
        this.monthlyContribution = monthlyContribution;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new Investment(undefined, props.userId, props.type, props.provider, props.currentValue, props.monthlyContribution, new Date(), new Date());
    }
    update(props) {
        if (props.type)
            this.type = props.type;
        if (props.provider)
            this.provider = props.provider;
        if (props.currentValue !== undefined)
            this.currentValue = props.currentValue;
        if (props.monthlyContribution !== undefined)
            this.monthlyContribution = props.monthlyContribution;
        this.updatedAt = new Date();
    }
}
