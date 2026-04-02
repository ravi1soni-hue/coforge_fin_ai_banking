export class Transaction {
    id;
    userId;
    date;
    type;
    category;
    amount;
    createdAt;
    constructor(id, userId, date, type, category, amount, createdAt) {
        this.id = id;
        this.userId = userId;
        this.date = date;
        this.type = type;
        this.category = category;
        this.amount = amount;
        this.createdAt = createdAt;
    }
    static create(props) {
        return new Transaction(undefined, props.userId, props.date, props.type, props.category, props.amount, new Date());
    }
}
