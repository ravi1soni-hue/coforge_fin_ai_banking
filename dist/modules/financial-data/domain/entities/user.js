export class User {
    userId;
    name;
    currency;
    country;
    employment;
    createdAt;
    updatedAt;
    constructor(userId, name, currency, country, employment, createdAt, updatedAt) {
        this.userId = userId;
        this.name = name;
        this.currency = currency;
        this.country = country;
        this.employment = employment;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new User(props.userId, props.name, props.currency, props.country, props.employment, new Date(), new Date());
    }
    update(props) {
        if (props.name)
            this.name = props.name;
        if (props.currency)
            this.currency = props.currency;
        if (props.country)
            this.country = props.country;
        if (props.employment)
            this.employment = props.employment;
        this.updatedAt = new Date();
    }
}
