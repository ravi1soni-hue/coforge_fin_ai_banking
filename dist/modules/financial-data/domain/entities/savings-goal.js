export class SavingsGoal {
    goalId;
    userId;
    targetAmount;
    targetDate;
    currentSaved;
    status;
    createdAt;
    updatedAt;
    constructor(goalId, userId, targetAmount, targetDate, currentSaved, status, createdAt, updatedAt) {
        this.goalId = goalId;
        this.userId = userId;
        this.targetAmount = targetAmount;
        this.targetDate = targetDate;
        this.currentSaved = currentSaved;
        this.status = status;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
    static create(props) {
        return new SavingsGoal(props.goalId, props.userId, props.targetAmount, props.targetDate, props.currentSaved, props.status, new Date(), new Date());
    }
    update(props) {
        if (props.targetAmount !== undefined)
            this.targetAmount = props.targetAmount;
        if (props.targetDate)
            this.targetDate = props.targetDate;
        if (props.currentSaved !== undefined)
            this.currentSaved = props.currentSaved;
        if (props.status)
            this.status = props.status;
        this.updatedAt = new Date();
    }
}
