export class Subscription {
    id;
    userId;
    name;
    amount;
    cycle;
    createdAt;
    updatedAt;
    constructor(id, userId, name, amount, cycle, createdAt, updatedAt) {
        this.id = id;
        this.userId = userId;
        this.name = name;
        this.amount = amount;
        this.cycle = cycle;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new Subscription(undefined, props.userId, props.name, props.amount, props.cycle, new Date(), new Date());
    }
    update(props) {
        if (props.name)
            this.name = props.name;
        if (props.amount !== undefined)
            this.amount = props.amount;
        if (props.cycle)
            this.cycle = props.cycle;
        this.updatedAt = new Date();
    }
}
