# 🌱 Database Seeded with Sample Data

Successfully populated the database with 3 sample users and their complete financial information!

## 📊 Seeded Users

### 1. **Raj Kumar** (ID: `user_001`)
- **Profile**: Salaried employee, ₹75,000/month income
- **Accounts**: 
  - HDFC Bank Savings: ₹250,000
  - ICICI Bank Current: ₹150,000
- **Loans**: Home Loan (SBI) - ₹45,000 EMI, 180 months remaining
- **Subscriptions**: Netflix, Amazon Prime, Gym Membership
- **Investments**: Mutual Funds (₹500K), Stock Portfolio (₹300K)
- **Transactions**: 4 recent transactions
- **Savings Goals**: 2 active goals totaling ₹1.5M target

### 2. **Priya Sharma** (ID: `user_002`)
- **Profile**: Freelancer, ₹120,000/month income
- **Accounts**: AXIS Bank Savings - ₹500,000
- **Loans**: None
- **Subscriptions**: Microsoft 365, Adobe Creative Cloud
- **Investments**: Fixed Deposit (₹1M), Mutual Funds (₹750K)
- **Transactions**: 3 recent transactions
- **Savings Goals**: 1 goal targeting ₹2M

### 3. **Amit Patel** (ID: `user_003`)
- **Profile**: Business owner, ₹200,000/month income
- **Accounts**:
  - HDFC Bank Business: ₹2,000,000
  - SBI Savings: ₹500,000
- **Loans**: Business Loan (ICICI) - ₹80,000 EMI, 120 months remaining
- **Subscriptions**: Business Software (₹5,000/month)
- **Investments**: Real Estate (₹5M), Stock Portfolio (₹2M)
- **Transactions**: 3 recent transactions
- **Savings Goals**: 1 goal targeting ₹10M

## 🧪 Test Endpoints

### Get All Data
```bash
GET /api/financial-data/user_001
GET /api/financial-data/user_002
GET /api/financial-data/user_003
```

### Get User Profile
```bash
GET /api/financial-data/user_001/profile
GET /api/financial-data/user_002/profile
GET /api/financial-data/user_003/profile
```

### Get Financial Summary
```bash
GET /api/financial-data/user_001/summary
GET /api/financial-data/user_002/summary
GET /api/financial-data/user_003/summary
```

## 📝 Example Response - Get All Data

```json
{
  "userProfile": {
    "userId": "user_001",
    "name": "Raj Kumar",
    "currency": "INR",
    "country": "India",
    "employment": {
      "type": "Salaried",
      "monthlyIncome": 75000,
      "salaryCreditDay": 1
    }
  },
  "accounts": [
    {
      "accountId": "acc_001_1",
      "type": "Savings",
      "bank": "HDFC Bank",
      "balance": "250000.00"
    }
  ],
  "loans": [...],
  "subscriptions": [...],
  "investments": [...],
  "transactions": [...],
  "savingsGoals": [...]
}
```

## 🎯 Financial Metrics Calculated

The financial summary endpoint provides:
- **Total Balance**: Sum of all account balances
- **Total Debt**: Outstanding loan amounts
- **Monthly Expenses**: Calculated from subscriptions
- **Total Investments**: Current value of all investments
- **Savings Rate**: Income vs expense percentage
- **Financial Health Score**: Overall wellness rating (0-100)

## 🔄 Re-seed Database

To refresh the database with new sample data, run:

```bash
npm run seed
```

This will:
1. Insert 3 users with complete financial profiles
2. Add accounts, loans, subscriptions, investments
3. Create recent transactions
4. Set up savings goals

## 🛠️ Data Structure

Each user has:
- ✅ User profile with employment info
- ✅ Multiple bank accounts
- ✅ Active loans with EMI details
- ✅ Recurring subscriptions
- ✅ Investment portfolio
- ✅ Transaction history
- ✅ Savings goals with progress tracking

## 📱 API Features

- **Authentication**: Ready for implementation
- **Pagination**: Ready for large datasets
- **Filtering**: Ready by date, category, amount
- **Validation**: Implemented at entity level
- **Error Handling**: Comprehensive error responses

## 🎓 Learning Resources

See the financial data module documentation for:
- Clean Architecture patterns
- Domain Driven Design
- Repository pattern
- Use case implementation
- Dependency injection

---

**Seeded on**: April 2, 2026  
**Total Records**: 3 users + 18 related records  
**Database**: Neon PostgreSQL  
**Status**: ✅ Ready for testing