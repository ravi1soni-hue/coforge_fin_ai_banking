import express from "express";
import pool from "../config/db.js";

const router = express.Router();

router.get("/user/:userId", async (req, res) => {
  const { userId } = req.params;

  try {
    const userQ = await pool.query(
      `SELECT user_id, name, country, currency, created_at
       FROM users
       WHERE user_id = $1`,
      [userId]
    );

    if (userQ.rows.length === 0) {
      return res.status(404).json({
        ok: false,
        error: `User not found: ${userId}`,
      });
    }

    const [accountsQ, investmentsQ, loansQ, subscriptionsQ, txnsQ] = await Promise.all([
      pool.query(
        `SELECT account_id, account_type, sub_type, nickname, currency, balance_amount, servicer_name
         FROM accounts
         WHERE user_id = $1
         ORDER BY account_id`,
        [userId]
      ),
      pool.query(
        `SELECT investment_id, product_type, provider, name, invested_amount, current_value
         FROM investments
         WHERE user_id = $1
         ORDER BY investment_id`,
        [userId]
      ),
      pool.query(
        `SELECT loan_id, loan_type, provider, principal, outstanding_balance, emi, next_payment_date
         FROM loans
         WHERE user_id = $1
         ORDER BY loan_id`,
        [userId]
      ),
      pool.query(
        `SELECT subscription_id, provider, amount, cycle
         FROM subscriptions
         WHERE user_id = $1
         ORDER BY subscription_id`,
        [userId]
      ),
      pool.query(
        `SELECT transaction_id, account_id, amount, currency, credit_debit_indicator, category, merchant, booking_datetime
         FROM transactions
         WHERE user_id = $1
         ORDER BY booking_datetime DESC
         LIMIT 30`,
        [userId]
      ),
    ]);

    return res.status(200).json({
      ok: true,
      data: {
        user: userQ.rows[0],
        counts: {
          accounts: accountsQ.rows.length,
          investments: investmentsQ.rows.length,
          loans: loansQ.rows.length,
          subscriptions: subscriptionsQ.rows.length,
          transactionsShown: txnsQ.rows.length,
        },
        accounts: accountsQ.rows,
        investments: investmentsQ.rows,
        loans: loansQ.rows,
        subscriptions: subscriptionsQ.rows,
        recentTransactions: txnsQ.rows,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
});

export default router;
