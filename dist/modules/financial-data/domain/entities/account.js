export class Account {
    accountId;
    userId;
    type;
    bank;
    balance;
    averageMonthlyBalance;
    createdAt;
    updatedAt;
    constructor(accountId, userId, type, bank, balance, averageMonthlyBalance, createdAt, updatedAt) {
        this.accountId = accountId;
        this.userId = userId;
        this.type = type;
        this.bank = bank;
        this.balance = balance;
        this.averageMonthlyBalance = averageMonthlyBalance;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new Account(props.accountId, props.userId, props.type, props.bank, props.balance, props.averageMonthlyBalance || null, new Date(), new Date());
    }
    update(props) {
        if (props.type)
            this.type = props.type;
        if (props.bank)
            this.bank = props.bank;
        if (props.balance !== undefined)
            this.balance = props.balance;
        if (props.averageMonthlyBalance !== undefined)
            this.averageMonthlyBalance = props.averageMonthlyBalance;
        this.updatedAt = new Date();
    }
}
