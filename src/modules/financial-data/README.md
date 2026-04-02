# Financial Data Module - Clean Architecture

This module implements a complete financial data management system using Clean Architecture principles. It provides a robust, maintainable, and testable solution for handling user financial information.

## 🏗️ Architecture Overview

The module follows Clean Architecture principles with four distinct layers:

### 1. **Domain Layer** (`domain/`)
Contains the core business logic and entities that are independent of any external frameworks.

- **Entities**: Business objects with validation and business rules
  - `User` - User profile with employment information
  - `Account` - Bank account details
  - `Loan` - Loan information
  - `Subscription` - Recurring payments
  - `Investment` - Investment holdings
  - `Transaction` - Financial transactions
  - `SavingsGoal` - Savings targets

- **Repositories**: Abstract interfaces for data access
  - `FinancialDataRepository` - Contract for data operations

- **Services**: Domain services with business logic
  - `FinancialDataDomainService` - Financial calculations and analysis

### 2. **Application Layer** (`application/`)
Contains application-specific business logic and use cases.

- **Use Cases**: Application workflows
  - `SaveBankingDataUseCase` - Save complete banking data
  - `GetBankingDataUseCase` - Retrieve banking data
  - `GetUserProfileUseCase` - Get user profile

- **Application Services**: Orchestrate use cases
  - `FinancialDataApplicationService` - Main application service

### 3. **Infrastructure Layer** (`infrastructure/`)
Contains external concerns like databases, web frameworks, and external APIs.

- **Repositories**: Concrete implementations
  - `KyselyFinancialDataRepository` - Kysely-based database access

- **Controllers**: Web framework adapters
  - `FinancialDataController` - Application service adapter

- **External**: External dependencies
  - `DatabaseConnection` - Database connection management

### 4. **Presentation Layer** (`presentation/`)
Contains API controllers and data transfer objects.

- **Controllers**: Web API endpoints
  - `ExpressFinancialDataController` - Express.js route handlers

- **DTOs**: Data transfer objects
  - `BankingDataDTO` - Complete banking data structure
  - `UserProfileDTO` - User profile data

## 🚀 API Endpoints

### Base URL: `/api/financial-data`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/` | Save complete banking data |
| `GET` | `/:userId` | Get complete banking data |
| `GET` | `/:userId/profile` | Get user profile only |
| `GET` | `/:userId/summary` | Get financial summary |

### Financial Summary Response
```json
{
  "totalBalance": 15000.50,
  "totalDebt": 5000.00,
  "monthlyExpenses": 1200.00,
  "totalInvestments": 8000.00,
  "savingsRate": 25.5,
  "financialHealthScore": 75
}
```

## 📊 Features

### Financial Analysis
- **Total Balance**: Sum of all account balances
- **Total Debt**: Sum of all outstanding loans
- **Monthly Expenses**: Calculated recurring costs
- **Total Investments**: Value of all investment holdings
- **Savings Rate**: Income vs expenses percentage
- **Financial Health Score**: Overall financial wellness (0-100)

### Data Integrity
- Unique constraints prevent duplicate data
- Transaction-safe operations
- Audit trail for all changes
- Validation at domain level

### Scalability
- Repository pattern for easy database switching
- Dependency injection for testability
- Modular design for feature extension

## 🧪 Testing

The architecture supports comprehensive testing at each layer:

- **Unit Tests**: Domain entities and services
- **Integration Tests**: Repository implementations
- **API Tests**: Controller endpoints
- **E2E Tests**: Complete user workflows

## 🔧 Usage

### Module Initialization
```typescript
import { financialDataModule } from './modules/financial-data/financial-data.module.js';

// Get services
const applicationService = financialDataModule.getApplicationService();
const repository = financialDataModule.getRepository();
```

### Using Application Service
```typescript
// Save banking data
await applicationService.saveBankingData(bankingData);

// Get banking data
const data = await applicationService.getBankingData(userId);

// Get financial summary
const summary = await applicationService.getFinancialSummary(userId);
```

### Using Repository Directly
```typescript
// Save user
await repository.saveUser(user);

// Get accounts
const accounts = await repository.getAccounts(userId);
```

## 🏛️ Clean Architecture Benefits

1. **Independence**: Framework and database agnostic
2. **Testability**: Each layer can be tested in isolation
3. **Maintainability**: Clear separation of concerns
4. **Scalability**: Easy to add new features and modify existing ones
5. **Flexibility**: Can adapt to changing requirements

## 📁 File Structure

```
src/modules/financial-data/
├── domain/
│   ├── entities/
│   ├── repositories/
│   └── services/
├── application/
│   ├── use-cases/
│   └── services/
├── infrastructure/
│   ├── repositories/
│   ├── controllers/
│   └── external/
├── presentation/
│   ├── controllers/
│   └── dto/
├── financial-data.module.ts
├── index.ts
└── README.md
```

## 🔄 Migration from Legacy Code

The module seamlessly integrates with existing Express.js routes and maintains backward compatibility while providing a clean, maintainable architecture for future development.

## 🤝 Contributing

When adding new features:
1. Start with domain entities and business rules
2. Add use cases in the application layer
3. Implement infrastructure adapters
4. Create presentation layer endpoints
5. Add comprehensive tests

This ensures the architecture remains clean and maintainable as the system grows.